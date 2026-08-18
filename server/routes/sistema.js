'use strict';
/** Configuracoes, listas de dominio e historico geral. */
const express = require('express');
const { db } = require('../db');
const { rota } = require('../lib/http');
const v = require('../lib/validacao');
const { exigirLogin, exigirAdmin, ehAdmin } = require('../lib/auth');
const { registrar, diferencas } = require('../lib/registro');
const { lerConfiguracoes, gravarConfiguracoes, PADRAO } = require('../lib/config');
const D = require('../lib/dominio');

const router = express.Router();

/** Listas usadas pelos formularios do aplicativo. */
router.get('/dominios', rota((_req, res) => {
  res.json({
    status_ficha: D.STATUS_FICHA, status_peca: D.STATUS_PECA, status_cotacao: D.STATUS_COTACAO,
    status_oc: D.STATUS_OC, status_caminhao: D.STATUS_CAMINHAO, prioridades: D.PRIORIDADES,
    gravidades: D.GRAVIDADES, urgencias: D.URGENCIAS, tipos_peca: D.TIPOS_PECA, posicoes: D.POSICOES,
    unidades: D.UNIDADES, tipos_caminhao: D.TIPOS_CAMINHAO, formas_pagamento: D.FORMAS_PAGAMENTO,
    disponibilidades: D.DISPONIBILIDADES, sistemas: D.SISTEMAS_CAMINHAO,
  });
}));

router.use(exigirLogin);

router.get('/configuracoes', rota((req, res) => {
  const config = lerConfiguracoes();
  if (!ehAdmin(req)) {
    res.json({ empresa_nome: config.empresa_nome, moeda: config.moeda, fuso: config.fuso });
    return;
  }
  res.json(config);
}));

router.put('/configuracoes', exigirAdmin, rota((req, res) => {
  const anterior = lerConfiguracoes();
  const pares = {};
  for (const chave of Object.keys(PADRAO)) {
    if (req.body[chave] !== undefined) {
      pares[chave] = v.texto(req.body[chave], chave, { max: 400 }) || '';
    }
  }
  const atualizado = gravarConfiguracoes(pares);
  registrar(req, {
    entidade: 'configuracao', entidade_id: null, acao: 'atualizada',
    descricao: 'Configurações do sistema atualizadas', detalhes: diferencas(anterior, pares),
  });
  res.json(atualizado);
}));

/** Historico geral com filtros - somente administracao. */
router.get('/historico', exigirAdmin, rota((req, res) => {
  const { entidade, entidade_id, usuario_id, acao, de, ate } = req.query;
  const filtros = [];
  const params = {};
  if (entidade) { filtros.push('h.entidade = @entidade'); params.entidade = entidade; }
  if (entidade_id) { filtros.push('h.entidade_id = @entidade_id'); params.entidade_id = Number(entidade_id); }
  if (usuario_id) { filtros.push('h.usuario_id = @usuario_id'); params.usuario_id = Number(usuario_id); }
  if (acao) { filtros.push('h.acao = @acao'); params.acao = acao; }
  if (de) { filtros.push('date(h.criado_em) >= @de'); params.de = v.data(de, 'período inicial'); }
  if (ate) { filtros.push('date(h.criado_em) <= @ate'); params.ate = v.data(ate, 'período final'); }
  const onde = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
  const pagina = Math.max(1, Number(req.query.pagina) || 1);
  const porPagina = Math.min(200, Number(req.query.por_pagina) || 50);

  const total = db.prepare(`SELECT COUNT(*) AS t FROM historico h ${onde}`).get(params).t;
  const itens = db.prepare(
    `SELECT h.* FROM historico h ${onde} ORDER BY h.id DESC LIMIT @limite OFFSET @deslocamento`
  ).all({ ...params, limite: porPagina, deslocamento: (pagina - 1) * porPagina });
  res.json({ itens, total, pagina, por_pagina: porPagina, paginas: Math.max(1, Math.ceil(total / porPagina)) });
}));

module.exports = router;
