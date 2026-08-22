'use strict';
/** Autenticacao: senha com bcrypt, sessao via JWT em cookie httpOnly. */
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db, DB_PATH } = require('../db');
const { erro } = require('./http');

// ------------------------------------------------------------------ Segredo da sessao
/**
 * O segredo que assina os tokens NUNCA pode ser um valor conhecido: quem o tiver
 * fabrica uma sessao de administrador sem saber nenhuma senha. Por isso aqui nao
 * existe valor padrao no codigo. A ordem e:
 *   1. JWT_SECRET do ambiente, se for proprio e longo o bastante;
 *   2. um segredo aleatorio gerado uma vez e guardado em data/.segredo-sessao.
 * O item 2 mantem a oficina funcionando mesmo se o .env for esquecido, sem abrir
 * mao da seguranca - o arquivo fica fora do repositorio (veja o .gitignore).
 */
const ARQUIVO_SEGREDO = path.join(path.dirname(DB_PATH), '.segredo-sessao');
const TAMANHO_MINIMO = 32;

/** Valores que ja circularam publicamente (README, .env.example, historico do git). */
const SEGREDOS_PUBLICOS = new Set([
  'troque-este-segredo-em-producao',
  'sos-truck-service-dev-secret-troque-em-producao',
]);

function alertar(motivo) {
  console.warn(
    `\n[ATENÇÃO] ${motivo}\n` +
    `          Usando o segredo de sessão guardado em ${ARQUIVO_SEGREDO}.\n` +
    `          Defina um JWT_SECRET próprio (mínimo ${TAMANHO_MINIMO} caracteres) no .env.\n` +
    '          Ao trocar o segredo, todas as sessões abertas caem e cada um faz login de novo.\n'
  );
}

/** Le o segredo do arquivo; cria um aleatorio na primeira vez. */
function segredoGuardado() {
  try {
    const salvo = fs.readFileSync(ARQUIVO_SEGREDO, 'utf8').trim();
    if (salvo.length >= TAMANHO_MINIMO) return salvo;
  } catch { /* ainda nao existe: gera abaixo */ }

  const novo = crypto.randomBytes(48).toString('base64');
  try {
    fs.mkdirSync(path.dirname(ARQUIVO_SEGREDO), { recursive: true });
    fs.writeFileSync(ARQUIVO_SEGREDO, novo, { mode: 0o600 });
  } catch (err) {
    console.warn(
      `[ATENÇÃO] Não foi possível gravar ${ARQUIVO_SEGREDO} (${err.message}).\n` +
      '          O segredo desta vez é temporário: ao reiniciar, todos terão de entrar de novo.\n' +
      '          Defina JWT_SECRET no .env para resolver.'
    );
  }
  return novo;
}

function resolverSegredo() {
  const doAmbiente = String(process.env.JWT_SECRET || '').trim();
  if (!doAmbiente) {
    alertar('JWT_SECRET não foi definido.');
    return segredoGuardado();
  }
  if (SEGREDOS_PUBLICOS.has(doAmbiente)) {
    alertar('JWT_SECRET está com o valor de exemplo, que é público e não protege nada.');
    return segredoGuardado();
  }
  if (doAmbiente.length < TAMANHO_MINIMO) {
    alertar(`JWT_SECRET tem apenas ${doAmbiente.length} caracteres — curto demais para resistir a força bruta.`);
    return segredoGuardado();
  }
  return doAmbiente;
}

const SEGREDO = resolverSegredo();
const EXPIRA = process.env.JWT_EXPIRES || '12h';
const COOKIE = 'sos_sessao';
const ROUNDS = 10;

const criarHash = (senha) => bcrypt.hashSync(senha, ROUNDS);
const conferirSenha = (senha, hash) => bcrypt.compareSync(String(senha || ''), String(hash || ''));

/**
 * Regra de senha guiada por tamanho, nao por "obrigue um simbolo": exigencias de
 * simbolo empurram todo mundo para Senha@123, que os ataques testam primeiro.
 * O que barra de verdade e o comprimento minimo mais uma lista das senhas obvias.
 */
const SENHA_MINIMA = 8;

const SENHAS_OBVIAS = new Set([
  'sos12345', 'sostruck', '12345678', '123456789', '1234567890', 'senha123',
  'senha1234', 'password', 'password1', 'qwertyui', 'abc12345', '11111111',
  'mecanico', 'admin123', 'administrador', 'caminhao', 'oficina1', 'sostruck1',
]);

function validarForcaSenha(senha, { email } = {}) {
  const s = String(senha || '');
  if (s.length < SENHA_MINIMA) {
    throw erro.requisicao(`A senha deve ter pelo menos ${SENHA_MINIMA} caracteres.`, { campo: 'senha' });
  }
  if (s.length > 100) throw erro.requisicao('A senha deve ter no máximo 100 caracteres.', { campo: 'senha' });

  const simples = s.toLowerCase();
  if (SENHAS_OBVIAS.has(simples)) {
    throw erro.requisicao('Esta senha é conhecida demais. Escolha outra.', { campo: 'senha' });
  }
  if (/^(.)\1+$/.test(s)) {
    throw erro.requisicao('A senha não pode ser um único caractere repetido.', { campo: 'senha' });
  }
  if (/^\d+$/.test(s) && /^(0123456789|1234567890|9876543210)/.test(s)) {
    throw erro.requisicao('A senha não pode ser uma sequência de números.', { campo: 'senha' });
  }
  // O comeco do proprio e-mail e a primeira coisa que alguem tenta.
  const usuarioDoEmail = String(email || '').split('@')[0].toLowerCase();
  if (usuarioDoEmail.length >= 4 && simples.includes(usuarioDoEmail)) {
    throw erro.requisicao('A senha não pode conter o seu e-mail.', { campo: 'senha' });
  }
  return s;
}

// ------------------------------------------------------------------ Sessoes
/**
 * Um JWT nao pode ser "apagado" do aparelho de ninguem, entao ha dois freios:
 *
 *  - jti: identificador unico do token. Ao sair do sistema ele entra em
 *    `sessoes_revogadas` e aquele aparelho especifico para de valer na hora.
 *  - sessao_epoca: contador do usuario. Trocar a senha (ou ser inativado) sobe
 *    o contador e derruba TODAS as sessoes daquele usuario de uma vez.
 */
function gerarToken(usuario) {
  return jwt.sign(
    {
      id: usuario.id,
      perfil: usuario.perfil,
      nome: usuario.nome,
      ep: Number(usuario.sessao_epoca || 0),
    },
    SEGREDO,
    { expiresIn: EXPIRA, jwtid: crypto.randomBytes(16).toString('hex') }
  );
}

/** Encerra apenas a sessao deste token (o aparelho que pediu para sair). */
function revogarSessao(dados) {
  if (!dados || !dados.jti) return;
  // `exp` vem em segundos; guardar ate la basta - depois disso o token morre sozinho.
  const expira = new Date((dados.exp || Math.floor(Date.now() / 1000) + 43200) * 1000).toISOString();
  db.prepare(
    `INSERT INTO sessoes_revogadas (jti, usuario_id, expira_em) VALUES (?, ?, ?)
     ON CONFLICT(jti) DO NOTHING`
  ).run(dados.jti, dados.id || null, expira);
  db.prepare("DELETE FROM sessoes_revogadas WHERE expira_em < datetime('now')").run();
}

/** Derruba todas as sessoes de um usuario (troca de senha, inativacao). */
function encerrarSessoes(usuario_id) {
  db.prepare('UPDATE usuarios SET sessao_epoca = sessao_epoca + 1 WHERE id = ?').run(usuario_id);
}

const sessaoRevogada = (jti) =>
  !!jti && !!db.prepare('SELECT 1 AS x FROM sessoes_revogadas WHERE jti = ?').get(jti);

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
    if (sessaoRevogada(dados.jti)) return next(); // saiu do sistema neste aparelho
    const usuario = db
      .prepare('SELECT id, nome, email, perfil, telefone, matricula, ativo, sessao_epoca FROM usuarios WHERE id = ?')
      .get(dados.id);
    if (!usuario || !usuario.ativo) return next();
    // Token emitido antes da ultima troca de senha/inativacao nao vale mais.
    if (Number(dados.ep || 0) !== Number(usuario.sessao_epoca || 0)) return next();
    // A epoca e detalhe interno: nao vai junto nas respostas da API.
    const { sessao_epoca: _epoca, ...publico } = usuario;
    req.usuario = publico;
    req.sessao = dados;
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
  revogarSessao, encerrarSessoes,
};
