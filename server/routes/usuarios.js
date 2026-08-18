'use strict';
/** Gestao de usuarios (exclusivo da administracao). */
const express = require('express');
const { db } = require('../db');
const { rota, erro } = require('../lib/http');
const v = require('../lib/validacao');
const a = require('../lib/auth');
const { registrar, diferencas } = require('../lib/registro');

const router = express.Router();
router.use(a.exigirLogin);

/** Lista simples de mecanicos, usada nos filtros e na abertura de fichas. */
router.get('/mecanicos', rota((_req, res) => {
  res.json({
    itens: db.prepare("SELECT id, nome, telefone FROM usuarios WHERE perfil='mecanico' AND ativo=1 ORDER BY nome").all(),
  });
}));

router.use(a.exigirAdmin);

router.get('/', rota((req, res) => {
  const busca = (req.query.busca || '').trim();
  const filtros = [];
  const params = {};
  if (req.query.inativos !== '1') filtros.push('u.ativo = 1');
  if (req.query.perfil) { filtros.push('u.perfil = @perfil'); params.perfil = req.query.perfil; }
  if (busca) {
    params.busca = `%${busca}%`;
    filtros.push('(u.nome LIKE @busca OR u.email LIKE @busca OR u.matricula LIKE @busca)');
  }
  const onde = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
  const itens = db.prepare(
    `SELECT u.id, u.nome, u.email, u.perfil, u.telefone, u.matricula, u.ativo, u.ultimo_acesso, u.criado_em,
            (SELECT COUNT(*) FROM fichas f WHERE f.mecanico_id = u.id) AS total_fichas,
            (SELECT COUNT(*) FROM fichas f WHERE f.mecanico_id = u.id AND f.status NOT IN ('concluida','cancelada')) AS fichas_abertas
       FROM usuarios u ${onde} ORDER BY u.perfil, u.nome`
  ).all(params);
  res.json({ itens, total: itens.length });
}));

router.post('/', rota((req, res) => {
  const dados = {
    nome: v.texto(req.body.nome, 'Nome', { obrigatorio: true, min: 3, max: 120 }),
    email: v.email(req.body.email, 'e-mail'),
    perfil: v.opcao(req.body.perfil, 'Perfil de acesso', ['mecanico', 'admin'], { obrigatorio: true }),
    telefone: v.digitos(req.body.telefone),
    matricula: v.texto(req.body.matricula, 'Matrícula', { max: 40 }),
  };
  if (db.prepare('SELECT id FROM usuarios WHERE email = ?').get(dados.email)) {
    throw erro.conflito('Já existe um usuário com este e-mail.', { campo: 'email' });
  }
  const senha = a.validarForcaSenha(req.body.senha);
  const info = db.prepare(
    `INSERT INTO usuarios (nome, email, senha_hash, perfil, telefone, matricula)
     VALUES (@nome, @email, @senha_hash, @perfil, @telefone, @matricula)`
  ).run({ ...dados, senha_hash: a.criarHash(senha) });

  registrar(req, {
    entidade: 'usuario', entidade_id: info.lastInsertRowid, acao: 'criado',
    descricao: `Usuário "${dados.nome}" (${dados.perfil}) cadastrado`,
  });
  res.status(201).json(
    db.prepare('SELECT id, nome, email, perfil, telefone, matricula, ativo FROM usuarios WHERE id = ?').get(info.lastInsertRowid)
  );
}));

router.put('/:id', rota((req, res) => {
  const atual = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.id);
  if (!atual) throw erro.naoEncontrado('Usuário não encontrado.');
  const dados = {
    nome: v.texto(req.body.nome, 'Nome', { obrigatorio: true, min: 3, max: 120 }),
    email: v.email(req.body.email, 'e-mail'),
    perfil: v.opcao(req.body.perfil, 'Perfil de acesso', ['mecanico', 'admin'], { obrigatorio: true }),
    telefone: v.digitos(req.body.telefone),
    matricula: v.texto(req.body.matricula, 'Matrícula', { max: 40 }),
  };
  if (db.prepare('SELECT id FROM usuarios WHERE email = ? AND id <> ?').get(dados.email, atual.id)) {
    throw erro.conflito('Já existe outro usuário com este e-mail.', { campo: 'email' });
  }
  if (atual.perfil === 'admin' && dados.perfil !== 'admin') {
    const admins = db.prepare("SELECT COUNT(*) AS t FROM usuarios WHERE perfil='admin' AND ativo=1 AND id <> ?").get(atual.id).t;
    if (!admins) throw erro.conflito('É necessário manter ao menos um administrador ativo.');
  }
  db.prepare(
    `UPDATE usuarios SET nome=@nome, email=@email, perfil=@perfil, telefone=@telefone,
       matricula=@matricula, atualizado_em=datetime('now') WHERE id=@id`
  ).run({ ...dados, id: atual.id });
  registrar(req, {
    entidade: 'usuario', entidade_id: atual.id, acao: 'atualizado',
    descricao: `Usuário "${dados.nome}" atualizado`, detalhes: diferencas(atual, dados),
  });
  res.json(db.prepare('SELECT id, nome, email, perfil, telefone, matricula, ativo FROM usuarios WHERE id = ?').get(atual.id));
}));

router.post('/:id/senha', rota((req, res) => {
  const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.id);
  if (!usuario) throw erro.naoEncontrado('Usuário não encontrado.');
  const senha = a.validarForcaSenha(req.body.senha);
  db.prepare("UPDATE usuarios SET senha_hash=?, reset_token=NULL, reset_expira=NULL, atualizado_em=datetime('now') WHERE id=?")
    .run(a.criarHash(senha), usuario.id);
  registrar(req, {
    entidade: 'usuario', entidade_id: usuario.id, acao: 'senha_redefinida_admin',
    descricao: `Senha de "${usuario.nome}" redefinida pela administração`,
  });
  res.json({ ok: true, mensagem: 'Senha redefinida. Informe a nova senha ao usuário.' });
}));

router.post('/:id/inativar', rota((req, res) => {
  const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.id);
  if (!usuario) throw erro.naoEncontrado('Usuário não encontrado.');
  if (usuario.id === req.usuario.id) throw erro.conflito('Você não pode inativar o próprio usuário.');
  if (usuario.ativo && usuario.perfil === 'admin') {
    const admins = db.prepare("SELECT COUNT(*) AS t FROM usuarios WHERE perfil='admin' AND ativo=1 AND id <> ?").get(usuario.id).t;
    if (!admins) throw erro.conflito('É necessário manter ao menos um administrador ativo.');
  }
  const ativo = usuario.ativo ? 0 : 1;
  db.prepare("UPDATE usuarios SET ativo=?, atualizado_em=datetime('now') WHERE id=?").run(ativo, usuario.id);
  registrar(req, {
    entidade: 'usuario', entidade_id: usuario.id, acao: ativo ? 'reativado' : 'inativado',
    descricao: `Usuário "${usuario.nome}" ${ativo ? 'reativado' : 'inativado'}`,
  });
  res.json({ ok: true, ativo });
}));

module.exports = router;
