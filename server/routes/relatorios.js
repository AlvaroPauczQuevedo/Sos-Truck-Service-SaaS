'use strict';
/** Relatorios gerenciais (administracao) e resumo operacional do mecanico. */
const express = require('express');
const { db } = require('../db');
const { rota } = require('../lib/http');
const v = require('../lib/validacao');
const { exigirLogin, exigirAdmin } = require('../lib/auth');

const router = express.Router();
router.use(exigirLogin, exigirAdmin);

function periodo(req) {
  const de = req.query.de ? v.data(req.query.de, 'período inicial') : new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const ate = req.query.ate ? v.data(req.query.ate, 'período final') : new Date().toISOString().slice(0, 10);
  return { de, ate };
}

/** Visao geral do periodo com os principais numeros. */
router.get('/geral', rota((req, res) => {
  const { de, ate } = periodo(req);
  const p = { de, ate };

  res.json({
    periodo: p,
    fichas: db.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status='concluida' THEN 1 ELSE 0 END) AS concluidas,
              SUM(CASE WHEN status='cancelada' THEN 1 ELSE 0 END) AS canceladas,
              SUM(CASE WHEN status NOT IN ('concluida','cancelada') THEN 1 ELSE 0 END) AS em_andamento,
              SUM(CASE WHEN prioridade='critica' THEN 1 ELSE 0 END) AS criticas
         FROM fichas WHERE date(aberta_em) BETWEEN @de AND @ate`
    ).get(p),
    compras: db.prepare(
      `SELECT COUNT(*) AS ordens, IFNULL(SUM(total),0) AS valor_total, IFNULL(AVG(total),0) AS ticket_medio,
              IFNULL(SUM(frete),0) AS frete_total, IFNULL(SUM(desconto),0) AS desconto_total
         FROM ordens_compra WHERE status <> 'cancelada' AND date(data_emissao) BETWEEN @de AND @ate`
    ).get(p),
    pecas: db.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status='instalada' THEN 1 ELSE 0 END) AS instaladas,
              SUM(CASE WHEN status='cancelada' THEN 1 ELSE 0 END) AS canceladas,
              SUM(CASE WHEN urgencia='critica' THEN 1 ELSE 0 END) AS criticas
         FROM pecas_solicitadas WHERE date(criado_em) BETWEEN @de AND @ate`
    ).get(p),
    tempo_medio_dias: db.prepare(
      `SELECT ROUND(AVG(julianday(finalizada_em) - julianday(aberta_em)), 1) AS t
         FROM fichas WHERE finalizada_em IS NOT NULL AND date(aberta_em) BETWEEN @de AND @ate`
    ).get(p).t,
    por_status: db.prepare(
      `SELECT status, COUNT(*) AS total FROM fichas WHERE date(aberta_em) BETWEEN @de AND @ate
        GROUP BY status ORDER BY total DESC`
    ).all(p),
    por_mes: db.prepare(
      `SELECT strftime('%Y-%m', o.data_emissao) AS mes, COUNT(*) AS ordens, IFNULL(SUM(o.total),0) AS valor
         FROM ordens_compra o WHERE o.status <> 'cancelada' AND date(o.data_emissao) BETWEEN @de AND @ate
        GROUP BY mes ORDER BY mes`
    ).all(p),
  });
}));

/** Gasto por categoria de peca. */
router.get('/categorias', rota((req, res) => {
  const { de, ate } = periodo(req);
  res.json({
    periodo: { de, ate },
    itens: db.prepare(
      `SELECT cat.nome AS categoria, COUNT(DISTINCT ps.id) AS pecas,
              IFNULL(SUM(oi.total), 0) AS valor
         FROM pecas_solicitadas ps
         LEFT JOIN categorias_pecas cat ON cat.id = ps.categoria_id
         LEFT JOIN ordens_itens oi ON oi.peca_id = ps.id
         LEFT JOIN ordens_compra o ON o.id = oi.ordem_id AND o.status <> 'cancelada'
        WHERE date(ps.criado_em) BETWEEN @de AND @ate
        GROUP BY cat.nome ORDER BY valor DESC, pecas DESC`
    ).all({ de, ate }),
  });
}));

/** Custo por caminhao no periodo. */
router.get('/caminhoes', rota((req, res) => {
  const { de, ate } = periodo(req);
  res.json({
    periodo: { de, ate },
    itens: db.prepare(
      `SELECT c.id, c.placa, c.codigo_frota, c.marca, c.modelo, c.km_atual, e.nome AS empresa_nome,
              COUNT(DISTINCT f.id) AS fichas,
              IFNULL((SELECT SUM(o.total) FROM ordens_compra o
                       WHERE o.caminhao_id = c.id AND o.status <> 'cancelada'
                         AND date(o.data_emissao) BETWEEN @de AND @ate), 0) AS gasto,
              (SELECT COUNT(*) FROM problemas p JOIN fichas f2 ON f2.id = p.ficha_id
                WHERE f2.caminhao_id = c.id AND date(f2.aberta_em) BETWEEN @de AND @ate) AS problemas
         FROM caminhoes c
         LEFT JOIN empresas e ON e.id = c.empresa_id
         LEFT JOIN fichas f ON f.caminhao_id = c.id AND date(f.aberta_em) BETWEEN @de AND @ate
        WHERE c.ativo = 1
        GROUP BY c.id HAVING fichas > 0 OR gasto > 0
        ORDER BY gasto DESC, fichas DESC`
    ).all({ de, ate }),
  });
}));

/** Desempenho dos fornecedores. */
router.get('/fornecedores', rota((req, res) => {
  const { de, ate } = periodo(req);
  res.json({
    periodo: { de, ate },
    itens: db.prepare(
      `SELECT fo.id, fo.nome, fo.cidade, fo.estado,
              COUNT(DISTINCT p.id) AS propostas,
              SUM(CASE WHEN p.selecionada = 1 THEN 1 ELSE 0 END) AS vencedoras,
              ROUND(AVG(p.prazo_entrega_dias), 1) AS prazo_medio,
              IFNULL((SELECT SUM(o.total) FROM ordens_compra o WHERE o.fornecedor_id = fo.id
                       AND o.status <> 'cancelada' AND date(o.data_emissao) BETWEEN @de AND @ate), 0) AS comprado,
              (SELECT COUNT(*) FROM ordens_compra o WHERE o.fornecedor_id = fo.id
                 AND o.status NOT IN ('recebida','cancelada') AND o.previsao_entrega IS NOT NULL
                 AND date(o.previsao_entrega) < date('now')) AS atrasos
         FROM fornecedores fo
         LEFT JOIN propostas p ON p.fornecedor_id = fo.id AND date(p.criado_em) BETWEEN @de AND @ate
        GROUP BY fo.id HAVING propostas > 0 OR comprado > 0
        ORDER BY comprado DESC`
    ).all({ de, ate }),
  });
}));

/** Produtividade dos mecanicos. */
router.get('/mecanicos', rota((req, res) => {
  const { de, ate } = periodo(req);
  res.json({
    periodo: { de, ate },
    itens: db.prepare(
      `SELECT u.id, u.nome,
              COUNT(DISTINCT f.id) AS fichas,
              SUM(CASE WHEN f.status='concluida' THEN 1 ELSE 0 END) AS concluidas,
              SUM(CASE WHEN f.status='devolvida' THEN 1 ELSE 0 END) AS devolvidas,
              (SELECT COUNT(*) FROM pecas_solicitadas ps JOIN fichas f2 ON f2.id = ps.ficha_id
                WHERE f2.mecanico_id = u.id AND date(ps.criado_em) BETWEEN @de AND @ate) AS pecas_solicitadas,
              ROUND(AVG(CASE WHEN f.finalizada_em IS NOT NULL
                        THEN julianday(f.finalizada_em) - julianday(f.aberta_em) END), 1) AS tempo_medio_dias
         FROM usuarios u
         LEFT JOIN fichas f ON f.mecanico_id = u.id AND date(f.aberta_em) BETWEEN @de AND @ate
        WHERE u.perfil = 'mecanico'
        GROUP BY u.id ORDER BY fichas DESC, u.nome`
    ).all({ de, ate }),
  });
}));

/** Exportacao em CSV para planilhas. */
router.get('/exportar/:tipo', rota((req, res) => {
  const { de, ate } = periodo(req);
  const consultas = {
    fichas: {
      sql: `SELECT f.numero AS "Ficha", c.placa AS "Placa", c.codigo_frota AS "Frota", e.nome AS "Empresa",
                   u.nome AS "Mecânico", f.status AS "Situação", f.prioridade AS "Prioridade",
                   f.aberta_em AS "Aberta em", f.finalizada_em AS "Finalizada em", f.km AS "KM",
                   (SELECT COUNT(*) FROM problemas p WHERE p.ficha_id=f.id) AS "Problemas",
                   (SELECT COUNT(*) FROM pecas_solicitadas ps WHERE ps.ficha_id=f.id) AS "Peças"
              FROM fichas f JOIN caminhoes c ON c.id=f.caminhao_id JOIN usuarios u ON u.id=f.mecanico_id
              LEFT JOIN empresas e ON e.id=c.empresa_id
             WHERE date(f.aberta_em) BETWEEN @de AND @ate ORDER BY f.id`,
      arquivo: 'fichas',
    },
    ordens: {
      sql: `SELECT o.numero AS "Ordem", f.numero AS "Ficha", c.placa AS "Placa", fo.nome AS "Fornecedor",
                   o.status AS "Situação", o.data_emissao AS "Emissão", o.previsao_entrega AS "Previsão",
                   o.subtotal AS "Subtotal", o.desconto AS "Desconto", o.frete AS "Frete", o.total AS "Total"
              FROM ordens_compra o JOIN fornecedores fo ON fo.id=o.fornecedor_id
              LEFT JOIN fichas f ON f.id=o.ficha_id LEFT JOIN caminhoes c ON c.id=o.caminhao_id
             WHERE date(o.data_emissao) BETWEEN @de AND @ate ORDER BY o.id`,
      arquivo: 'ordens-de-compra',
    },
    pecas: {
      sql: `SELECT ps.nome AS "Peça", cat.nome AS "Categoria", sub.nome AS "Subcategoria",
                   ps.quantidade AS "Qtd", ps.unidade AS "Unidade", ps.urgencia AS "Urgência",
                   ps.status AS "Situação", f.numero AS "Ficha", c.placa AS "Placa", ps.criado_em AS "Solicitada em"
              FROM pecas_solicitadas ps JOIN fichas f ON f.id=ps.ficha_id JOIN caminhoes c ON c.id=f.caminhao_id
              LEFT JOIN categorias_pecas cat ON cat.id=ps.categoria_id
              LEFT JOIN categorias_pecas sub ON sub.id=ps.subcategoria_id
             WHERE date(ps.criado_em) BETWEEN @de AND @ate ORDER BY ps.id`,
      arquivo: 'pecas',
    },
  };
  const consulta = consultas[req.params.tipo];
  if (!consulta) return res.status(404).json({ erro: 'Relatório não disponível para exportação.' });

  const linhas = db.prepare(consulta.sql).all({ de, ate });
  const colunas = linhas.length ? Object.keys(linhas[0]) : [];
  const escapar = (valor) => {
    const texto = valor === null || valor === undefined ? '' : String(valor);
    return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };
  // Ponto e virgula e BOM garantem abertura correta no Excel em pt-BR.
  const csv = '﻿' + [colunas.join(';'), ...linhas.map((l) => colunas.map((c) => escapar(l[c])).join(';'))].join('\r\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${consulta.arquivo}-${de}-a-${ate}.csv"`);
  res.send(csv);
}));

module.exports = router;
