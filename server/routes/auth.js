'use strict';
/** Rotas de autenticacao: login, sessao, logout e recuperacao de senha. */
const express = require('express');
const { db } = require('../db');
const { rota, erro } = require('../lib/http');
const v = require('../lib/validacao');
const a = require('../lib/auth');
const { registrar } = require('../lib/registro');

const router = express.Router();

/**
 * Controle simples de repeticao por e-mail + IP (em memoria, por processo).
 * Usado no login (conta so as falhas) e na recuperacao de senha (conta toda
 * tentativa, porque de fora nao da para distinguir sucesso de falha).
 */
function criarLimitador({ limite, janela }) {
  const registros = new Map();

  const limpar = () => {
    const agora = Date.now();
    for (const [chave, reg] of registros) {
      if (agora - reg.desde > janela) registros.delete(chave);
    }
  };

  return {
    chave(req, email) {
      // req.ip respeita o `trust proxy` do app; ler o cabecalho cru deixaria o
      // proprio atacante escolher a chave do limite e repetir a vontade.
      return `${req.ip || 'desconhecido'}|${email}`;
    },
    bloqueado(chave) {
      const reg = registros.get(chave);
      if (!reg) return false;
      if (Date.now() - reg.desde > janela) { registros.delete(chave); return false; }
      return reg.total >= limite;
    },
    contar(chave) {
      // A recuperacao de senha e anonima: sem esta poda o mapa cresceria sem fim.
      if (registros.size > 5000) limpar();
      const reg = registros.get(chave) || { total: 0, desde: Date.now() };
      if (Date.now() - reg.desde > janela) { reg.total = 0; reg.desde = Date.now(); }
      reg.total += 1;
      registros.set(chave, reg);
    },
    liberar(chave) { registros.delete(chave); },
  };
}

const limiteLogin = criarLimitador({ limite: 8, janela: 15 * 60 * 1000 });
const limiteRecuperacao = criarLimitador({ limite: 5, janela: 60 * 60 * 1000 });

router.post('/login', rota((req, res) => {
  const email = v.email(req.body.email, 'e-mail');
  const senha = String(req.body.senha || '');
  const chave = limiteLogin.chave(req, email);

  if (limiteLogin.bloqueado(chave)) {
    throw erro.requisicao('Muitas tentativas seguidas. Aguarde 15 minutos e tente novamente.');
  }

  const usuario = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);
  if (!usuario || !a.conferirSenha(senha, usuario.senha_hash)) {
    limiteLogin.contar(chave);
    throw new (require('../lib/http').AppError)(401, 'E-mail ou senha incorretos.');
  }
  if (!usuario.ativo) throw erro.semPermissao('Este usuário está inativo. Procure a administração.');

  limiteLogin.liberar(chave);
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
    // Limpar o cookie nao basta: quem tivesse copiado o token continuaria entrando
    // com ele ate expirar. A sessao deste aparelho e invalidada no servidor.
    a.revogarSessao(req.sessao);
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

/**
 * Solicita a recuperacao de senha. Endpoint anonimo, por isso:
 *
 * - A resposta e SEMPRE identica, exista o cadastro ou nao, para nao revelar
 *   quem tem conta no sistema.
 * - O link NUNCA volta na resposta. Devolve-lo aqui entregaria o token de troca
 *   de senha a qualquer pessoa que soubesse o e-mail do administrador, o que e
 *   tomada de conta direta, sem precisar de senha nenhuma.
 *
 * Sem servico de e-mail configurado, o link sai no log do servidor e pode ser
 * gerado pela administracao em Usuários (POST /api/usuarios/:id/link-recuperacao).
 * Para envio automatico, basta plugar um provedor SMTP no lugar do console.log.
 */
router.post('/recuperar-senha', rota((req, res) => {
  const email = v.email(req.body.email, 'e-mail');
  const resposta = {
    ok: true,
    mensagem: 'Se este e-mail estiver cadastrado, a recuperação foi registrada. '
      + 'Procure a administração para receber o link de redefinição.',
  };

  const chave = limiteRecuperacao.chave(req, email);
  if (limiteRecuperacao.bloqueado(chave)) return res.json(resposta);
  limiteRecuperacao.contar(chave);

  const usuario = db.prepare('SELECT id, nome FROM usuarios WHERE email = ? AND ativo = 1').get(email);
  if (!usuario) return res.json(resposta);

  const token = a.gerarTokenRecuperacao();
  db.prepare(
    `UPDATE usuarios SET reset_token = ?, reset_expira = datetime('now', '+1 hour') WHERE id = ?`
  ).run(a.hashRecuperacao(token), usuario.id);

  registrar(req, {
    entidade: 'usuario', entidade_id: usuario.id, acao: 'recuperacao_solicitada',
    descricao: `Recuperação de senha solicitada para ${email}`,
  });

  console.log(
    `[recuperação de senha] ${usuario.nome} <${email}> — link válido por 1 hora:\n`
    + `                       /#/redefinir-senha?token=${token}`
  );
  return res.json(resposta);
}));

router.post('/redefinir-senha', rota((req, res) => {
  const token = v.texto(req.body.token, 'token', { obrigatorio: true });
  if (req.body.senha !== req.body.confirmacao) {
    throw erro.requisicao('A confirmação da senha não confere.', { campo: 'confirmacao' });
  }

  const usuario = db.prepare(
    `SELECT id, nome, email FROM usuarios
     WHERE reset_token = ? AND reset_expira IS NOT NULL AND reset_expira > datetime('now') AND ativo = 1`
  ).get(a.hashRecuperacao(token));

  if (!usuario) throw erro.requisicao('Link de recuperação inválido ou expirado. Solicite um novo.');
  const senha = a.validarForcaSenha(req.body.senha, { email: usuario.email });

  db.prepare(
    `UPDATE usuarios SET senha_hash = ?, reset_token = NULL, reset_expira = NULL,
     atualizado_em = datetime('now') WHERE id = ?`
  ).run(a.criarHash(senha), usuario.id);
  // Quem redefine a senha costuma estar justamente tentando expulsar um intruso.
  a.encerrarSessoes(usuario.id);

  registrar(req, {
    entidade: 'usuario', entidade_id: usuario.id, acao: 'senha_redefinida',
    descricao: 'Senha redefinida pelo link de recuperação — sessões abertas encerradas',
  });
  res.json({ ok: true, mensagem: 'Senha redefinida com sucesso. Faça login com a nova senha.' });
}));

router.post('/trocar-senha', a.exigirLogin, rota((req, res) => {
  const atual = String(req.body.senha_atual || '');
  const nova = a.validarForcaSenha(req.body.senha_nova, { email: req.usuario.email });
  if (req.body.senha_nova !== req.body.confirmacao) {
    throw erro.requisicao('A confirmação da senha não confere.', { campo: 'confirmacao' });
  }

  const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.usuario.id);
  if (!a.conferirSenha(atual, usuario.senha_hash)) {
    throw erro.requisicao('A senha atual está incorreta.', { campo: 'senha_atual' });
  }

  db.prepare("UPDATE usuarios SET senha_hash = ?, atualizado_em = datetime('now') WHERE id = ?")
    .run(a.criarHash(nova), usuario.id);

  // Derruba as sessoes antigas e reemite a desta aba, para quem trocou a senha
  // nao ser deslogado do proprio aparelho no meio do caminho.
  a.encerrarSessoes(usuario.id);
  const atualizado = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(usuario.id);
  a.definirCookie(res, a.gerarToken(atualizado));

  registrar(req, {
    entidade: 'usuario', entidade_id: usuario.id, acao: 'senha_alterada',
    descricao: 'Alterou a própria senha — demais aparelhos desconectados',
  });
  res.json({ ok: true, mensagem: 'Senha alterada. Os outros aparelhos conectados foram desconectados.' });
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
