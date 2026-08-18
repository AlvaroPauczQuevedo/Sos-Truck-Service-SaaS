'use strict';
/** Notificacoes internas do usuario. */
const express = require('express');
const { db } = require('../db');
const { rota, erro } = require('../lib/http');
const { exigirLogin } = require('../lib/auth');

const router = express.Router();
router.use(exigirLogin);

router.get('/', rota((req, res) => {
  const somenteNaoLidas = req.query.nao_lidas === '1';
  const itens = db.prepare(
    `SELECT * FROM notificacoes WHERE usuario_id = ? ${somenteNaoLidas ? 'AND lida = 0' : ''}
      ORDER BY id DESC LIMIT 60`
  ).all(req.usuario.id);
  const naoLidas = db.prepare('SELECT COUNT(*) AS t FROM notificacoes WHERE usuario_id = ? AND lida = 0')
    .get(req.usuario.id).t;
  res.json({ itens, nao_lidas: naoLidas });
}));

router.post('/:id/ler', rota((req, res) => {
  const n = db.prepare('SELECT * FROM notificacoes WHERE id = ? AND usuario_id = ?').get(req.params.id, req.usuario.id);
  if (!n) throw erro.naoEncontrado('Notificação não encontrada.');
  db.prepare("UPDATE notificacoes SET lida = 1, lida_em = datetime('now') WHERE id = ?").run(n.id);
  res.json({ ok: true });
}));

router.post('/ler-todas', rota((req, res) => {
  const info = db.prepare("UPDATE notificacoes SET lida = 1, lida_em = datetime('now') WHERE usuario_id = ? AND lida = 0")
    .run(req.usuario.id);
  res.json({ ok: true, atualizadas: info.changes });
}));

module.exports = router;
