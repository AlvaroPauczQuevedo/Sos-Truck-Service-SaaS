'use strict';
/** Autenticacao: senha com bcrypt, sessao via JWT em cookie httpOnly. */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../db');
const { erro } = require('./http');

const SEGREDO = process.env.JWT_SECRET || 'sos-truck-service-dev-secret-troque-em-producao';
const EXPIRA = process.env.JWT_EXPIRES || '12h';
const COOKIE = 'sos_sessao';
const ROUNDS = 10;

const criarHash = (senha) => bcrypt.hashSync(senha, ROUNDS);
const conferirSenha = (senha, hash) => bcrypt.compareSync(String(senha || ''), String(hash || ''));

function validarForcaSenha(senha) {
  const s = String(senha || '');
  if (s.length < 6) throw erro.requisicao('A senha deve ter pelo menos 6 caracteres.', { campo: 'senha' });
  if (s.length > 100) throw erro.requisicao('A senha deve ter no máximo 100 caracteres.', { campo: 'senha' });
  return s;
}

function gerarToken(usuario) {
  return jwt.sign(
    { id: usuario.id, perfil: usuario.perfil, nome: usuario.nome },
    SEGREDO,
    { expiresIn: EXPIRA }
  );
}

function definirCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 12,
    path: '/',
  });
}

const limparCookie = (res) => res.clearCookie(COOKIE, { path: '/' });

function lerToken(req) {
  const cabecalho = req.get('authorization');
  if (cabecalho && cabecalho.startsWith('Bearer ')) return cabecalho.slice(7);
  return (req.cookies && req.cookies[COOKIE]) || null;
}

/** Popula req.usuario quando ha sessao valida. Nunca bloqueia. */
function identificar(req, _res, next) {
  const token = lerToken(req);
  if (!token) return next();
  try {
    const dados = jwt.verify(token, SEGREDO);
    const usuario = db
      .prepare('SELECT id, nome, email, perfil, telefone, matricula, ativo FROM usuarios WHERE id = ?')
      .get(dados.id);
    if (usuario && usuario.ativo) req.usuario = usuario;
  } catch (_) { /* token invalido ou expirado: segue sem sessao */ }
  next();
}

const exigirLogin = (req, _res, next) =>
  req.usuario ? next() : next(erro.naoAutenticado());

const exigirAdmin = (req, _res, next) => {
  if (!req.usuario) return next(erro.naoAutenticado());
  if (req.usuario.perfil !== 'admin') {
    return next(erro.semPermissao('Esta área é exclusiva da administração.'));
  }
  next();
};

const ehAdmin = (req) => !!req.usuario && req.usuario.perfil === 'admin';

const gerarTokenRecuperacao = () => crypto.randomBytes(32).toString('hex');
const hashRecuperacao = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

module.exports = {
  criarHash, conferirSenha, validarForcaSenha, gerarToken, definirCookie, limparCookie,
  identificar, exigirLogin, exigirAdmin, ehAdmin, gerarTokenRecuperacao, hashRecuperacao, COOKIE,
};
