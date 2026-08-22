'use strict';
/** Historico de alteracoes e notificacoes internas. */
const { db } = require('../db');

/**
 * Grava uma entrada no historico. Toda acao relevante passa por aqui,
 * registrando usuario, data, hora e IP de origem.
 */
function registrar(req, { entidade, entidade_id, acao, descricao, detalhes }) {
  const usuario = (req && req.usuario) || null;
  // Sempre o IP resolvido pelo Express: o cabecalho cru e escolhido pelo cliente
  // e encheria o historico de origens falsas.
  const ip = req ? String(req.ip || '') : null;
  db.prepare(
    `INSERT INTO historico (entidade, entidade_id, acao, descricao, detalhes, usuario_id, usuario_nome, ip)
     VALUES (@entidade, @entidade_id, @acao, @descricao, @detalhes, @usuario_id, @usuario_nome, @ip)`
  ).run({
    entidade,
    entidade_id: entidade_id ?? null,
    acao,
    descricao: descricao || null,
    detalhes: detalhes ? JSON.stringify(detalhes) : null,
    usuario_id: usuario ? usuario.id : null,
    usuario_nome: usuario ? usuario.nome : 'Sistema',
    ip: ip || null,
  });
}

/** Compara o estado anterior e o novo, devolvendo apenas os campos alterados. */
function diferencas(antes, depois, rotulos = {}) {
  const mudou = {};
  for (const chave of Object.keys(depois)) {
    const a = antes ? antes[chave] : undefined;
    const b = depois[chave];
    const iguais = (a ?? null) === (b ?? null) || String(a ?? '') === String(b ?? '');
    if (!iguais) mudou[rotulos[chave] || chave] = { de: a ?? null, para: b ?? null };
  }
  return mudou;
}

/** Cria notificacao para um usuario especifico. */
function notificarUsuario(usuario_id, { titulo, mensagem, tipo = 'info', link = null }) {
  if (!usuario_id) return;
  db.prepare(
    `INSERT INTO notificacoes (usuario_id, titulo, mensagem, tipo, link)
     VALUES (?, ?, ?, ?, ?)`
  ).run(usuario_id, titulo, mensagem || null, tipo, link);
}

/** Cria notificacao para todos os usuarios ativos de um perfil. */
function notificarPerfil(perfil, { titulo, mensagem, tipo = 'info', link = null }) {
  const destinatarios = db
    .prepare('SELECT id FROM usuarios WHERE perfil = ? AND ativo = 1')
    .all(perfil);
  const inserir = db.prepare(
    `INSERT INTO notificacoes (usuario_id, perfil_destino, titulo, mensagem, tipo, link)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const lote = db.transaction((lista) => {
    for (const u of lista) inserir.run(u.id, perfil, titulo, mensagem || null, tipo, link);
  });
  lote(destinatarios);
}

module.exports = { registrar, diferencas, notificarUsuario, notificarPerfil };
