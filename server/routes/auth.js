'use strict';
/** Rotas de autenticacao: login, sessao, logout e recuperacao de senha. */
const express = require('express');
const { db } = require('../db');
const { rota, erro } = require('../lib/http');
const v = require('../lib/validacao');
const a = require('../lib/auth');
const { registrar } = require('../lib/registro');

const router = express.Router();

// Controle simples de forca bruta por e-mail + IP (em memoria).
const tentativas = new Map();
const JANELA = 15 * 60 * 1000;
const LIMITE = 8;

function chaveTentativa(req, email) {
  const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();
  return `${ip}|${email}`;
}
function bloqueado(chave) {
  const reg = tentativas.get(chave);
  if (!reg) return false;
  if (Date.now() - reg.desde > JANELA) { tentativas.delete(chave); return false; }
  return reg.total >= LIMITE;
}
function falhou(chave) {
  const reg = tentativas.get(chave) || { total: 0, desde: Date.now() };
  if (Date.now() - reg.desde > JANELA) { reg.total = 0; reg.desde = Date.now(); }
  reg.total += 1;
  tentativas.set(chave, reg);
}

router.post('/login', rota((req, res) => {
  const email = v.email(req.body.email, 'e-mail');
  const senha = String(req.body.senha || '');
  const chave = chaveTentativa(req, email);

  if (bloqueado(chave)) {
    throw erro.requisicao('Muitas tentativas seguidas. Aguarde 15 minutos e tente novamente.');
  }

  const usuario = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);
  if (!usuario || !a.conferirSenha(senha, usuario.senha_hash)) {
    falhou(chave);
    throw new (require('../lib/http').AppError)(401, 'E-mail ou senha incorretos.');
  }
  if (!usuario.ativo) throw erro.semPermissao('Este usuário está inativo. Procure a administração.');

  tentativas.delete(chave);
  db.prepare("UPDATE usuarios SET ultimo_acesso = datetime('now') WHERE id = ?").run(usuario.id);

  const token = a.gerarToken(usuario);
  a.definirCookie(res, token);
  req.usuario = usuario;
  registrar(req, { entidade: 'usuario', entidade_id: usuario.id, acao: 'login', descricao: 'Entrou no sistema' });

  res.json({
    token,
    usuario: {
      id: usuario.id, nome: usuario.nome, email: usuario.email,
      perfil: usuario.perfil, telefone: usuario.telefone, matricula: usuario.matricula,
    },
  });
}));

router.post('/logout', rota((req, res) => {
  if (req.usuario) {
    registrar(req, { entidade: 'usuario', entidade_id: req.usuario.id, acao: 'logout', descricao: 'Saiu do sistema' });
  }
  a.limparCookie(res);
  res.json({ ok: true });
}));

router.get('/sessao', rota((req, res) => {
  if (!req.usuario) throw erro.naoAutenticado();
  const naoLidas = db
    .prepare('SELECT COUNT(*) AS total FROM notificacoes WHERE usuario_id = ? AND lida = 0')
    .get(req.usuario.id).total;
  res.json({ usuario: req.usuario, notificacoes_nao_lidas: naoLidas });
}));

/** Solicita recuperacao. A resposta e sempre igual para nao revelar cadastros. */
router.post('/recuperar-senha', rota((req, res) => {
  const email = v.email(req.body.email, 'e-mail');
  const usuario = db.prepare('SELECT id, nome FROM usuarios WHERE email = ? AND ativo = 1').get(email);

  const resposta = {
    ok: true,
    mensagem: 'Se este e-mail estiver cadastrado, o link de recuperação foi gerado. Procure a administração caso não o receba.',
  };

  if (!usuario) return res.json(resposta);

  const token = a.gerarTokenRecuperacao();
  db.prepare(
    `UPDATE usuarios SET reset_token = ?, reset_expira = datetime('now', '+1 hour') WHERE id = ?`
  ).run(a.hashRecuperacao(token), usuario.id);

  registrar(req, {
    entidade: 'usuario', entidade_id: usuario.id, acao: 'recuperacao_solicitada',
    descricao: `Recuperação de senha solicitada para ${email}`,
  });

  // Sem servico de e-mail configurado, o link fica disponivel para a administracao
  // repassar ao usuario. Basta plugar um provedor SMTP aqui para envio automatico.
  resposta.link_recuperacao = `/#/redefinir-senha?token=${token}`;
  return res.json(resposta);
}));

router.post('/redefinir-senha', rota((req, res) => {
  const token = v.texto(req.body.token, 'token', { obrigatorio: true });
  const senha = a.validarForcaSenha(req.body.senha);
  if (req.body.senha !== req.body.confirmacao) {
    throw erro.requisicao('A confirmação da senha não confere.', { campo: 'confirmacao' });
  }

  const usuario = db.prepare(
    `SELECT id, nome FROM usuarios
     WHERE reset_token = ? AND reset_expira IS NOT NULL AND reset_expira > datetime('now') AND ativo = 1`
  ).get(a.hashRecuperacao(token));

  if (!usuario) throw erro.requisicao('Link de recuperação inválido ou expirado. Solicite um novo.');

  db.prepare(
    `UPDATE usuarios SET senha_hash = ?, reset_token = NULL, reset_expira = NULL,
     atualizado_em = datetime('now') WHERE id = ?`
  ).run(a.criarHash(senha), usuario.id);

  registrar(req, {
    entidade: 'usuario', entidade_id: usuario.id, acao: 'senha_redefinida',
    descricao: 'Senha redefinida pelo link de recuperação',
  });
  res.json({ ok: true, mensagem: 'Senha redefinida com sucesso. Faça login com a nova senha.' });
}));

router.post('/trocar-senha', a.exigirLogin, rota((req, res) => {
  const atual = String(req.body.senha_atual || '');
  const nova = a.validarForcaSenha(req.body.senha_nova);
  if (req.body.senha_nova !== req.body.confirmacao) {
    throw erro.requisicao('A confirmação da senha não confere.', { campo: 'confirmacao' });
  }

  const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.usuario.id);
  if (!a.conferirSenha(atual, usuario.senha_hash)) {
    throw erro.requisicao('A senha atual está incorreta.', { campo: 'senha_atual' });
  }

  db.prepare("UPDATE usuarios SET senha_hash = ?, atualizado_em = datetime('now') WHERE id = ?")
    .run(a.criarHash(nova), usuario.id);
  registrar(req, { entidade: 'usuario', entidade_id: usuario.id, acao: 'senha_alterada', descricao: 'Alterou a própria senha' });
  res.json({ ok: true, mensagem: 'Senha alterada com sucesso.' });
}));

router.put('/perfil', a.exigirLogin, rota((req, res) => {
  const nome = v.texto(req.body.nome, 'Nome', { obrigatorio: true, max: 120 });
  const telefone = v.digitos(req.body.telefone);
  db.prepare("UPDATE usuarios SET nome = ?, telefone = ?, atualizado_em = datetime('now') WHERE id = ?")
    .run(nome, telefone, req.usuario.id);
  registrar(req, { entidade: 'usuario', entidade_id: req.usuario.id, acao: 'perfil_atualizado', descricao: 'Atualizou os próprios dados' });
  res.json({ ok: true, usuario: db.prepare('SELECT id, nome, email, perfil, telefone, matricula FROM usuarios WHERE id = ?').get(req.usuario.id) });
}));

module.exports = router;
