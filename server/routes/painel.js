'use strict';
/** Indicadores dos dashboards, atividades recentes e alertas. */
const express = require('express');
const { db } = require('../db');
const { rota } = require('../lib/http');
const { exigirLogin, ehAdmin } = require('../lib/auth');
const { placaBR, dataBR } = require('../lib/formato');

const router = express.Router();
router.use(exigirLogin);

const contar = (sql, ...params) => db.prepare(sql).get(...params).t;

router.get('/', rota((req, res) => {
  const admin = ehAdmin(req);
  const eu = req.usuario.id;

  const indicadores = admin ? {
    caminhoes_manutencao: contar(
      `SELECT COUNT(DISTINCT caminhao_id) AS t FROM fichas WHERE status NOT IN ('concluida','cancelada','rascunho')`),
    fichas_abertas: contar(
      `SELECT COUNT(*) AS t FROM fichas WHERE status NOT IN ('concluida','cancelada','rascunho')`),
    fichas_aguardando_analise: contar(
      `SELECT COUNT(*) AS t FROM fichas WHERE status = 'aguardando_analise'`),
    pecas_aguardando_cotacao: contar(
      `SELECT COUNT(*) AS t FROM pecas_solicitadas WHERE status IN ('aguardando_cotacao','aguardando_analise')`),
    cotacoes_aguardando_aprovacao: contar(
      `SELECT COUNT(*) AS t FROM cotacoes WHERE status = 'aguardando_aprovacao'`),
    ordens_abertas: contar(
      `SELECT COUNT(*) AS t FROM ordens_compra WHERE status NOT IN ('recebida','cancelada')`),
    compras_atrasadas: contar(
      `SELECT COUNT(*) AS t FROM ordens_compra WHERE status NOT IN ('recebida','cancelada')
         AND previsao_entrega IS NOT NULL AND date(previsao_entrega) < date('now')`),
    pecas_recebidas: contar(
      `SELECT COUNT(*) AS t FROM pecas_solicitadas WHERE status IN ('recebida','entregue')`),
    servicos_concluidos: contar(
      `SELECT COUNT(*) AS t FROM fichas WHERE status IN ('concluida','servico_concluido')
         AND date(IFNULL(finalizada_em, servico_finalizado_em)) >= date('now','-30 days')`),
  } : {
    caminhoes_manutencao: contar(
      `SELECT COUNT(DISTINCT caminhao_id) AS t FROM fichas WHERE mecanico_id = ?
         AND status NOT IN ('concluida','cancelada')`, eu),
    minhas_fichas_abertas: contar(
      `SELECT COUNT(*) AS t FROM fichas WHERE mecanico_id = ? AND status NOT IN ('concluida','cancelada')`, eu),
    rascunhos: contar(`SELECT COUNT(*) AS t FROM fichas WHERE mecanico_id = ? AND status = 'rascunho'`, eu),
    devolvidas: contar(`SELECT COUNT(*) AS t FROM fichas WHERE mecanico_id = ? AND status = 'devolvida'`, eu),
    aguardando_analise: contar(
      `SELECT COUNT(*) AS t FROM fichas WHERE mecanico_id = ? AND status = 'aguardando_analise'`, eu),
    pecas_solicitadas: contar(
      `SELECT COUNT(*) AS t FROM pecas_solicitadas ps JOIN fichas f ON f.id = ps.ficha_id
        WHERE f.mecanico_id = ? AND ps.status NOT IN ('instalada','cancelada')`, eu),
    pecas_disponiveis: contar(
      `SELECT COUNT(*) AS t FROM pecas_solicitadas ps JOIN fichas f ON f.id = ps.ficha_id
        WHERE f.mecanico_id = ? AND ps.status IN ('recebida','entregue')`, eu),
    pecas_instaladas: contar(
      `SELECT COUNT(*) AS t FROM pecas_solicitadas ps JOIN fichas f ON f.id = ps.ficha_id
        WHERE f.mecanico_id = ? AND ps.status = 'instalada'`, eu),
    servicos_concluidos: contar(
      `SELECT COUNT(*) AS t FROM fichas WHERE mecanico_id = ? AND status IN ('concluida','servico_concluido')
         AND date(IFNULL(finalizada_em, servico_finalizado_em)) >= date('now','-30 days')`, eu),
  };

  // Alertas de urgencia
  const alertas = [];
  const criticas = db.prepare(
    `SELECT ps.id, ps.nome, ps.urgencia, f.id AS ficha_id, f.numero, c.placa
       FROM pecas_solicitadas ps JOIN fichas f ON f.id = ps.ficha_id JOIN caminhoes c ON c.id = f.caminhao_id
      WHERE ps.urgencia = 'critica' AND ps.status NOT IN ('instalada','cancelada','entregue')
        ${admin ? '' : 'AND f.mecanico_id = @eu'}
      ORDER BY ps.criado_em LIMIT 10`
  ).all(admin ? {} : { eu });
  for (const p of criticas) {
    alertas.push({
      tipo: 'peca_critica', titulo: `Peça crítica: ${p.nome}`,
      detalhe: `${p.numero} — ${placaBR(p.placa)}`, link: `/#/fichas/${p.ficha_id}`,
    });
  }
  const impeditivos = db.prepare(
    `SELECT p.titulo, f.id AS ficha_id, f.numero, c.placa FROM problemas p
       JOIN fichas f ON f.id = p.ficha_id JOIN caminhoes c ON c.id = f.caminhao_id
      WHERE p.impede_uso = 1 AND p.resolvido = 0 AND f.status NOT IN ('concluida','cancelada')
        ${admin ? '' : 'AND f.mecanico_id = @eu'} LIMIT 10`
  ).all(admin ? {} : { eu });
  for (const p of impeditivos) {
    alertas.push({
      tipo: 'caminhao_parado', titulo: `Caminhão impedido de rodar: ${placaBR(p.placa)}`,
      detalhe: `${p.numero} — ${p.titulo}`, link: `/#/fichas/${p.ficha_id}`,
    });
  }
  if (admin) {
    const atrasadas = db.prepare(
      `SELECT o.id, o.numero, o.previsao_entrega, fo.nome AS fornecedor_nome FROM ordens_compra o
         JOIN fornecedores fo ON fo.id = o.fornecedor_id
        WHERE o.status NOT IN ('recebida','cancelada') AND o.previsao_entrega IS NOT NULL
          AND date(o.previsao_entrega) < date('now') ORDER BY o.previsao_entrega LIMIT 10`
    ).all();
    for (const o of atrasadas) {
      alertas.push({
        tipo: 'compra_atrasada', titulo: `Compra atrasada: ${o.numero}`,
        detalhe: `${o.fornecedor_nome} — prevista para ${dataBR(o.previsao_entrega)}`, link: `/#/ordens/${o.id}`,
      });
    }
  }

  const atividades = db.prepare(
    `SELECT h.entidade, h.entidade_id, h.acao, h.descricao, h.usuario_nome, h.criado_em
       FROM historico h
      WHERE h.entidade IN ('ficha','cotacao','ordem_compra','caminhao')
        ${admin ? '' : "AND h.usuario_id = @eu"}
      ORDER BY h.id DESC LIMIT 20`
  ).all(admin ? {} : { eu });

  const fichasRecentes = db.prepare(
    `SELECT f.id, f.numero, f.status, f.prioridade, f.aberta_em, c.placa, c.codigo_frota,
            u.nome AS mecanico_nome, e.nome AS empresa_nome
       FROM fichas f JOIN caminhoes c ON c.id = f.caminhao_id JOIN usuarios u ON u.id = f.mecanico_id
       LEFT JOIN empresas e ON e.id = c.empresa_id
      WHERE f.status NOT IN ('concluida','cancelada') ${admin ? '' : 'AND f.mecanico_id = @eu'}
      ORDER BY CASE f.prioridade WHEN 'critica' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END,
               f.aberta_em DESC LIMIT 8`
  ).all(admin ? {} : { eu });

  const resposta = { perfil: req.usuario.perfil, indicadores, alertas, atividades, fichas_recentes: fichasRecentes };

  if (admin) {
    resposta.financeiro = {
      comprado_mes: db.prepare(
        `SELECT IFNULL(SUM(total),0) AS t FROM ordens_compra
          WHERE status <> 'cancelada' AND strftime('%Y-%m', data_emissao) = strftime('%Y-%m','now')`
      ).get().t,
      comprado_ano: db.prepare(
        `SELECT IFNULL(SUM(total),0) AS t FROM ordens_compra
          WHERE status <> 'cancelada' AND strftime('%Y', data_emissao) = strftime('%Y','now')`
      ).get().t,
      em_aprovacao: db.prepare(
        `SELECT IFNULL(SUM(p.valor_total),0) AS t FROM propostas p JOIN cotacoes co ON co.id = p.cotacao_id
          WHERE p.selecionada = 1 AND co.status = 'aguardando_aprovacao'`
      ).get().t,
    };
    resposta.fila = db.prepare(
      `SELECT f.id, f.numero, f.prioridade, f.enviada_em, c.placa, u.nome AS mecanico_nome,
              (SELECT COUNT(*) FROM pecas_solicitadas ps WHERE ps.ficha_id = f.id AND ps.status <> 'cancelada') AS total_pecas
         FROM fichas f JOIN caminhoes c ON c.id = f.caminhao_id JOIN usuarios u ON u.id = f.mecanico_id
        WHERE f.status = 'aguardando_analise'
        ORDER BY CASE f.prioridade WHEN 'critica' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END,
                 f.enviada_em LIMIT 10`
    ).all();
  }
  res.json(resposta);
}));

module.exports = router;
