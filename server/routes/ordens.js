'use strict';
/** Ordens de compra: geracao a partir da cotacao, acompanhamento e PDF. */
const express = require('express');
const { db, gerarNumero } = require('../db');
const { rota, erro } = require('../lib/http');
const v = require('../lib/validacao');
const { exigirLogin, exigirAdmin } = require('../lib/auth');
const { registrar, notificarUsuario } = require('../lib/registro');
const { moeda } = require('../lib/formato');
const { lerConfiguracoes } = require('../lib/config');
const { ordemCompraPDF } = require('../lib/pdf');
const L = require('../lib/fichas');
const D = require('../lib/dominio');

const router = express.Router();
const arredondar = (n) => Math.round((Number(n) || 0) * 100) / 100;

router.use(exigirLogin, exigirAdmin);

function carregarOrdem(id) {
  const ordem = db.prepare(
    `SELECT o.*, fo.nome AS fornecedor_nome, fo.whatsapp AS fornecedor_whatsapp, fo.telefone AS fornecedor_telefone,
            f.numero AS ficha_numero, c.placa, c.codigo_frota, c.marca, c.modelo, e.nome AS empresa_nome,
            u.nome AS responsavel_nome, co.numero AS cotacao_numero
       FROM ordens_compra o
       JOIN fornecedores fo ON fo.id = o.fornecedor_id
       LEFT JOIN fichas f ON f.id = o.ficha_id
       LEFT JOIN caminhoes c ON c.id = o.caminhao_id
       LEFT JOIN empresas e ON e.id = o.empresa_id
       LEFT JOIN usuarios u ON u.id = o.responsavel_id
       LEFT JOIN cotacoes co ON co.id = o.cotacao_id
      WHERE o.id = ?`
  ).get(id);
  if (!ordem) throw erro.naoEncontrado('Ordem de compra não encontrada.');
  ordem.itens = db.prepare(
    `SELECT oi.*, ps.nome AS peca_nome, ps.status AS peca_status, ps.urgencia
       FROM ordens_itens oi LEFT JOIN pecas_solicitadas ps ON ps.id = oi.peca_id
      WHERE oi.ordem_id = ? ORDER BY oi.id`
  ).all(id);
  ordem.historico = db.prepare(
    `SELECT acao, descricao, usuario_nome, criado_em FROM historico
      WHERE entidade='ordem_compra' AND entidade_id=? ORDER BY id DESC`
  ).all(id);
  return ordem;
}

// ------------------------------------------------------------------ Listagem
router.get('/', rota((req, res) => {
  const { busca, status, fornecedor_id, empresa_id, de, ate, atrasadas } = req.query;
  const filtros = [];
  const params = {};
  if (status) {
    const lista = String(status).split(',').map((s) => s.trim()).filter(Boolean);
    filtros.push(`o.status IN (${lista.map((_, i) => `@st${i}`).join(',')})`);
    lista.forEach((s, i) => { params[`st${i}`] = s; });
  }
  if (fornecedor_id) { filtros.push('o.fornecedor_id = @fornecedor_id'); params.fornecedor_id = Number(fornecedor_id); }
  if (empresa_id) { filtros.push('o.empresa_id = @empresa_id'); params.empresa_id = Number(empresa_id); }
  if (busca) {
    params.busca = `%${String(busca).trim()}%`;
    filtros.push(`(o.numero LIKE @busca OR f.numero LIKE @busca OR REPLACE(c.placa,'-','') LIKE @busca
                   OR fo.nome LIKE @busca OR c.codigo_frota LIKE @busca)`);
  }
  if (de) { filtros.push('date(o.data_emissao) >= @de'); params.de = v.data(de, 'período inicial'); }
  if (ate) { filtros.push('date(o.data_emissao) <= @ate'); params.ate = v.data(ate, 'período final'); }
  if (atrasadas === '1') {
    filtros.push(`o.status NOT IN ('recebida','cancelada') AND o.previsao_entrega IS NOT NULL AND date(o.previsao_entrega) < date('now')`);
  }
  const onde = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';

  const itens = db.prepare(
    `SELECT o.*, fo.nome AS fornecedor_nome, f.numero AS ficha_numero, c.placa, c.codigo_frota,
            e.nome AS empresa_nome, u.nome AS responsavel_nome,
            (SELECT COUNT(*) FROM ordens_itens oi WHERE oi.ordem_id = o.id) AS total_itens,
            (SELECT COUNT(*) FROM ordens_itens oi WHERE oi.ordem_id = o.id AND oi.recebida_em IS NOT NULL) AS itens_recebidos,
            CASE WHEN o.status NOT IN ('recebida','cancelada') AND o.previsao_entrega IS NOT NULL
                      AND date(o.previsao_entrega) < date('now') THEN 1 ELSE 0 END AS atrasada
       FROM ordens_compra o
       JOIN fornecedores fo ON fo.id = o.fornecedor_id
       LEFT JOIN fichas f ON f.id = o.ficha_id
       LEFT JOIN caminhoes c ON c.id = o.caminhao_id
       LEFT JOIN empresas e ON e.id = o.empresa_id
       LEFT JOIN usuarios u ON u.id = o.responsavel_id
       ${onde} ORDER BY o.id DESC LIMIT 300`
  ).all(params);
  res.json({ itens, total: itens.length });
}));

router.get('/:id', rota((req, res) => res.json(carregarOrdem(req.params.id))));

// ------------------------------------------------------------------ Geracao
/** Previa: agrupa as propostas selecionadas por fornecedor. */
router.get('/previa/:cotacaoId', rota((req, res) => {
  const { montarComparativo } = require('./cotacoes');
  const { cotacao, ficha, itens } = montarComparativo(req.params.cotacaoId);
  const grupos = new Map();
  for (const item of itens) {
    const sel = item.selecionada;
    if (!sel) continue;
    if (db.prepare('SELECT COUNT(*) AS t FROM ordens_itens WHERE proposta_id = ?').get(sel.id).t) continue;
    const g = grupos.get(sel.fornecedor_id) || {
      fornecedor_id: sel.fornecedor_id, fornecedor_nome: sel.fornecedor_nome,
      forma_pagamento: sel.forma_pagamento, prazo_entrega_dias: sel.prazo_entrega_dias || 0,
      itens: [], subtotal: 0, desconto: 0, frete: 0, total: 0,
    };
    g.itens.push({
      peca_id: item.id, proposta_id: sel.id, descricao: item.nome, codigo: sel.codigo_peca || item.codigo_referencia,
      marca: sel.marca_oferecida, unidade: item.unidade, quantidade: sel.quantidade,
      valor_unitario: sel.valor_unitario, desconto: sel.desconto, frete: sel.frete,
      total: arredondar(sel.quantidade * sel.valor_unitario - sel.desconto),
    });
    g.subtotal = arredondar(g.subtotal + sel.quantidade * sel.valor_unitario);
    g.desconto = arredondar(g.desconto + (sel.desconto || 0));
    g.frete = arredondar(g.frete + (sel.frete || 0));
    g.total = arredondar(g.subtotal - g.desconto + g.frete);
    g.prazo_entrega_dias = Math.max(g.prazo_entrega_dias, sel.prazo_entrega_dias || 0);
    grupos.set(sel.fornecedor_id, g);
  }
  res.json({ cotacao, ficha, grupos: [...grupos.values()] });
}));

router.post('/', rota((req, res) => {
  const { montarComparativo } = require('./cotacoes');
  const cotacao_id = v.numero(req.body.cotacao_id, 'Cotação', { obrigatorio: true, inteiro: true, min: 1 });
  const fornecedor_id = v.numero(req.body.fornecedor_id, 'Fornecedor', { obrigatorio: true, inteiro: true, min: 1 });
  const { cotacao, ficha, itens } = montarComparativo(cotacao_id);
  if (cotacao.status !== 'aprovada') throw erro.conflito('A cotação precisa estar aprovada para gerar a ordem de compra.');

  const selecionados = itens.filter(
    (i) => i.selecionada && i.selecionada.fornecedor_id === fornecedor_id
      && !db.prepare('SELECT COUNT(*) AS t FROM ordens_itens WHERE proposta_id = ?').get(i.selecionada.id).t
  );
  if (!selecionados.length) {
    throw erro.conflito('Não há peças aprovadas pendentes para este fornecedor nesta cotação.');
  }

  const config = lerConfiguracoes();
  const cabecalho = {
    forma_pagamento: v.texto(req.body.forma_pagamento, 'Forma de pagamento', { max: 80 })
      || selecionados[0].selecionada.forma_pagamento,
    prazo_entrega: v.texto(req.body.prazo_entrega, 'Prazo de entrega', { max: 120 }),
    previsao_entrega: v.data(req.body.previsao_entrega, 'Previsão de entrega'),
    endereco_entrega: v.texto(req.body.endereco_entrega, 'Endereço de entrega', { max: 400 }) || config.endereco_entrega || null,
    observacoes: v.texto(req.body.observacoes, 'Observações', { max: 2000 }),
    frete_extra: v.numero(req.body.frete_extra, 'Frete adicional', { min: 0 }) || 0,
    desconto_extra: v.numero(req.body.desconto_extra, 'Desconto adicional', { min: 0 }) || 0,
  };

  let subtotal = 0, desconto = cabecalho.desconto_extra, frete = cabecalho.frete_extra;
  const linhas = selecionados.map((i) => {
    const p = i.selecionada;
    subtotal = arredondar(subtotal + p.quantidade * p.valor_unitario);
    desconto = arredondar(desconto + (p.desconto || 0));
    frete = arredondar(frete + (p.frete || 0));
    return {
      peca_id: i.id, proposta_id: p.id,
      descricao: i.nome + (i.posicao && i.posicao !== 'Não se aplica' ? ` — ${i.posicao}` : ''),
      codigo: p.codigo_peca || i.codigo_referencia, marca: p.marca_oferecida, unidade: i.unidade,
      quantidade: p.quantidade, valor_unitario: p.valor_unitario, desconto: p.desconto || 0,
      total: arredondar(p.quantidade * p.valor_unitario - (p.desconto || 0)),
    };
  });
  const total = arredondar(subtotal - desconto + frete);
  if (total < 0) throw erro.requisicao('O desconto informado deixa a ordem com valor negativo.');

  const prazoMaximo = Math.max(...selecionados.map((i) => i.selecionada.prazo_entrega_dias || 0), 0);
  if (!cabecalho.previsao_entrega && prazoMaximo) {
    cabecalho.previsao_entrega = new Date(Date.now() + prazoMaximo * 86400000).toISOString().slice(0, 10);
  }
  if (!cabecalho.prazo_entrega && prazoMaximo) cabecalho.prazo_entrega = `${prazoMaximo} dia(s)`;

  const numero = gerarNumero('OC');
  const id = db.transaction(() => {
    const info = db.prepare(
      `INSERT INTO ordens_compra (numero, ficha_id, cotacao_id, fornecedor_id, caminhao_id, empresa_id,
         subtotal, desconto, frete, total, forma_pagamento, prazo_entrega, previsao_entrega,
         endereco_entrega, responsavel_id, observacoes, status)
       VALUES (@numero, @ficha_id, @cotacao_id, @fornecedor_id, @caminhao_id, @empresa_id,
         @subtotal, @desconto, @frete, @total, @forma_pagamento, @prazo_entrega, @previsao_entrega,
         @endereco_entrega, @responsavel_id, @observacoes, 'emitida')`
    ).run({
      numero, ficha_id: cotacao.ficha_id, cotacao_id, fornecedor_id,
      caminhao_id: ficha.caminhao_id, empresa_id: ficha.empresa_id,
      subtotal, desconto, frete, total,
      forma_pagamento: cabecalho.forma_pagamento, prazo_entrega: cabecalho.prazo_entrega,
      previsao_entrega: cabecalho.previsao_entrega, endereco_entrega: cabecalho.endereco_entrega,
      responsavel_id: req.usuario.id, observacoes: cabecalho.observacoes,
    });
    const ordemId = info.lastInsertRowid;
    const inserirItem = db.prepare(
      `INSERT INTO ordens_itens (ordem_id, peca_id, proposta_id, descricao, codigo, marca, unidade,
         quantidade, valor_unitario, desconto, total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const l of linhas) {
      inserirItem.run(ordemId, l.peca_id, l.proposta_id, l.descricao, l.codigo, l.marca, l.unidade,
        l.quantidade, l.valor_unitario, l.desconto, l.total);
      db.prepare("UPDATE pecas_solicitadas SET status='oc_emitida', atualizado_em=datetime('now') WHERE id=?").run(l.peca_id);
    }
    db.prepare("UPDATE fichas SET status='em_compra', atualizado_em=datetime('now') WHERE id=?").run(cotacao.ficha_id);
    return ordemId;
  })();

  const fornecedor = db.prepare('SELECT nome FROM fornecedores WHERE id = ?').get(fornecedor_id);
  registrar(req, {
    entidade: 'ordem_compra', entidade_id: id, acao: 'emitida',
    descricao: `Ordem ${numero} emitida para ${fornecedor.nome} — total ${moeda(total)}`,
    detalhes: { total, itens: linhas.length },
  });
  registrar(req, {
    entidade: 'ficha', entidade_id: cotacao.ficha_id, acao: 'ordem_emitida',
    descricao: `Ordem de compra ${numero} emitida (${fornecedor.nome})`,
  });
  notificarUsuario(ficha.mecanico_id, {
    titulo: 'Peças em compra',
    mensagem: `${ficha.numero} — ordem de compra emitida. Acompanhe a entrega.`,
    tipo: 'info', link: `/#/fichas/${ficha.id}`,
  });
  res.status(201).json(carregarOrdem(id));
}));

// ------------------------------------------------------------------ Acompanhamento
router.put('/:id', rota((req, res) => {
  const ordem = carregarOrdem(req.params.id);
  if (['recebida', 'cancelada'].includes(ordem.status)) {
    throw erro.conflito('Esta ordem já foi encerrada e não pode ser alterada.');
  }
  const dados = {
    forma_pagamento: v.texto(req.body.forma_pagamento, 'Forma de pagamento', { max: 80 }),
    prazo_entrega: v.texto(req.body.prazo_entrega, 'Prazo de entrega', { max: 120 }),
    previsao_entrega: v.data(req.body.previsao_entrega, 'Previsão de entrega'),
    endereco_entrega: v.texto(req.body.endereco_entrega, 'Endereço de entrega', { max: 400 }),
    observacoes: v.texto(req.body.observacoes, 'Observações', { max: 2000 }),
  };
  db.prepare(
    `UPDATE ordens_compra SET forma_pagamento=@forma_pagamento, prazo_entrega=@prazo_entrega,
       previsao_entrega=@previsao_entrega, endereco_entrega=@endereco_entrega, observacoes=@observacoes,
       atualizado_em=datetime('now') WHERE id=@id`
  ).run({ ...dados, id: ordem.id });
  registrar(req, { entidade: 'ordem_compra', entidade_id: ordem.id, acao: 'atualizada', descricao: `Ordem ${ordem.numero} atualizada` });
  res.json(carregarOrdem(ordem.id));
}));

router.post('/:id/status', rota((req, res) => {
  const ordem = carregarOrdem(req.params.id);
  const status = v.opcao(req.body.status, 'Situação', D.STATUS_OC, { obrigatorio: true });
  if (status === 'cancelada') throw erro.requisicao('Use a ação de cancelamento para cancelar a ordem.');
  if (ordem.status === 'cancelada') throw erro.conflito('Esta ordem está cancelada.');

  db.transaction(() => {
    db.prepare(
      `UPDATE ordens_compra SET status=?, recebida_em = CASE WHEN ?='recebida' THEN datetime('now') ELSE recebida_em END,
         atualizado_em=datetime('now') WHERE id=?`
    ).run(status, status, ordem.id);
    if (status === 'confirmada') {
      db.prepare(
        `UPDATE pecas_solicitadas SET status='comprada', atualizado_em=datetime('now')
          WHERE id IN (SELECT peca_id FROM ordens_itens WHERE ordem_id = ? AND peca_id IS NOT NULL)
            AND status IN ('oc_emitida','aprovada')`
      ).run(ordem.id);
    }
  })();
  registrar(req, {
    entidade: 'ordem_compra', entidade_id: ordem.id, acao: 'status_alterado',
    descricao: `Ordem ${ordem.numero}: ${D.STATUS_OC[ordem.status].rotulo} → ${D.STATUS_OC[status].rotulo}`,
  });
  if (ordem.ficha_id) L.recalcularStatusFicha(ordem.ficha_id);
  res.json(carregarOrdem(ordem.id));
}));

/** Recebimento item a item, com atualizacao automatica da ordem e das pecas. */
router.post('/:id/receber', rota((req, res) => {
  const ordem = carregarOrdem(req.params.id);
  if (ordem.status === 'cancelada') throw erro.conflito('Esta ordem está cancelada.');

  const recebidos = Array.isArray(req.body.itens) ? req.body.itens : [];
  if (!recebidos.length) throw erro.requisicao('Selecione ao menos um item recebido.');
  const observacao = v.texto(req.body.observacao, 'Observação', { max: 1000 });
  const nota_fiscal = v.texto(req.body.nota_fiscal, 'Nota fiscal', { max: 60 });

  const ficha = ordem.ficha_id ? L.buscarFicha(ordem.ficha_id) : null;
  const nomes = [];

  db.transaction(() => {
    for (const entrada of recebidos) {
      const item = ordem.itens.find((i) => i.id === Number(entrada.item_id));
      if (!item) continue;
      const qtd = v.numero(entrada.quantidade ?? item.quantidade, 'Quantidade recebida', { min: 0, max: item.quantidade });
      db.prepare(
        `UPDATE ordens_itens SET quantidade_recebida = ?, recebida_em = CASE WHEN ? >= quantidade THEN datetime('now') ELSE NULL END
          WHERE id = ?`
      ).run(qtd, qtd, item.id);
      if (item.peca_id && qtd >= item.quantidade) {
        db.prepare(
          `UPDATE pecas_solicitadas SET status='recebida', recebida_em=datetime('now'), atualizado_em=datetime('now')
            WHERE id=? AND status NOT IN ('instalada','entregue','cancelada')`
        ).run(item.peca_id);
        nomes.push(item.descricao);
      }
    }
    const pendentes = db.prepare(
      'SELECT COUNT(*) AS t FROM ordens_itens WHERE ordem_id = ? AND recebida_em IS NULL'
    ).get(ordem.id).t;
    const novoStatus = pendentes === 0 ? 'recebida' : 'parcial';
    db.prepare(
      `UPDATE ordens_compra SET status=?, recebida_em = CASE WHEN ?='recebida' THEN datetime('now') ELSE NULL END,
         atualizado_em=datetime('now') WHERE id=?`
    ).run(novoStatus, novoStatus, ordem.id);
  })();

  registrar(req, {
    entidade: 'ordem_compra', entidade_id: ordem.id, acao: 'recebimento',
    descricao: `Recebimento registrado na ordem ${ordem.numero}${nota_fiscal ? ` — NF ${nota_fiscal}` : ''}`,
    detalhes: { itens: recebidos.length, observacao, nota_fiscal },
  });
  if (ficha) {
    registrar(req, {
      entidade: 'ficha', entidade_id: ficha.id, acao: 'pecas_recebidas',
      descricao: `Peças recebidas pela ordem ${ordem.numero}`,
    });
    if (nomes.length) {
      notificarUsuario(ficha.mecanico_id, {
        titulo: 'Peças recebidas',
        mensagem: `${ficha.numero} — ${nomes.slice(0, 3).join(', ')}${nomes.length > 3 ? ` e mais ${nomes.length - 3}` : ''}.`,
        tipo: 'sucesso', link: `/#/fichas/${ficha.id}`,
      });
    }
    L.recalcularStatusFicha(ficha.id);
  }
  res.json(carregarOrdem(ordem.id));
}));

router.post('/:id/cancelar', rota((req, res) => {
  const ordem = carregarOrdem(req.params.id);
  if (ordem.status === 'cancelada') throw erro.conflito('Esta ordem já está cancelada.');
  if (req.body.confirmar !== true && req.body.confirmar !== 'true') {
    throw erro.conflito('Confirme o cancelamento da ordem de compra.', { requer_confirmacao: true });
  }
  const motivo = v.texto(req.body.motivo, 'Motivo do cancelamento', { obrigatorio: true, min: 5, max: 1000 });

  db.transaction(() => {
    db.prepare(
      `UPDATE ordens_compra SET status='cancelada', cancelada_em=datetime('now'), cancelada_motivo=?,
         atualizado_em=datetime('now') WHERE id=?`
    ).run(motivo, ordem.id);
    db.prepare(
      `UPDATE pecas_solicitadas SET status='aprovada', atualizado_em=datetime('now')
        WHERE id IN (SELECT peca_id FROM ordens_itens WHERE ordem_id=? AND peca_id IS NOT NULL)
          AND status IN ('oc_emitida','comprada')`
    ).run(ordem.id);
  })();
  registrar(req, {
    entidade: 'ordem_compra', entidade_id: ordem.id, acao: 'cancelada',
    descricao: `Ordem ${ordem.numero} cancelada`, detalhes: { motivo },
  });
  if (ordem.ficha_id) L.recalcularStatusFicha(ordem.ficha_id);
  res.json(carregarOrdem(ordem.id));
}));

// ------------------------------------------------------------------ PDF
router.get('/:id/pdf', rota((req, res) => {
  const ordem = carregarOrdem(req.params.id);
  const dados = {
    ordem, itens: ordem.itens,
    fornecedor: db.prepare('SELECT * FROM fornecedores WHERE id = ?').get(ordem.fornecedor_id),
    caminhao: ordem.caminhao_id ? db.prepare('SELECT * FROM caminhoes WHERE id = ?').get(ordem.caminhao_id) : null,
    empresa: ordem.empresa_id ? db.prepare('SELECT * FROM empresas WHERE id = ?').get(ordem.empresa_id) : null,
    ficha: ordem.ficha_id ? db.prepare('SELECT numero FROM fichas WHERE id = ?').get(ordem.ficha_id) : null,
    responsavel: ordem.responsavel_id ? db.prepare('SELECT nome FROM usuarios WHERE id = ?').get(ordem.responsavel_id) : null,
  };
  registrar(req, { entidade: 'ordem_compra', entidade_id: ordem.id, acao: 'pdf_gerado', descricao: `PDF da ordem ${ordem.numero} gerado` });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${req.query.download === '1' ? 'attachment' : 'inline'}; filename="${ordem.numero}.pdf"`);
  ordemCompraPDF(dados, lerConfiguracoes()).pipe(res);
}));

module.exports = router;
