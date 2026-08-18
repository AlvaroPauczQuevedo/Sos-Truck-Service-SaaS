'use strict';
/** Central de cotacoes: propostas manuais, comparacao e aprovacao. */
const express = require('express');
const { db, gerarNumero } = require('../db');
const { rota, erro } = require('../lib/http');
const v = require('../lib/validacao');
const { exigirLogin, exigirAdmin } = require('../lib/auth');
const { registrar, diferencas, notificarUsuario } = require('../lib/registro');
const L = require('../lib/fichas');
const { moeda } = require('../lib/formato');
const D = require('../lib/dominio');

const router = express.Router();
router.use(exigirLogin, exigirAdmin);

const arredondar = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Total da proposta = (unitario x quantidade) - desconto + frete. */
function calcularTotal({ quantidade, valor_unitario, desconto, frete }) {
  const bruto = arredondar((Number(quantidade) || 0) * (Number(valor_unitario) || 0));
  return {
    subtotal: bruto,
    valor_total: arredondar(bruto - (Number(desconto) || 0) + (Number(frete) || 0)),
  };
}

/** Monta a comparacao de propostas por peca, destacando a de menor valor. */
function montarComparativo(cotacao_id) {
  const cotacao = db.prepare('SELECT * FROM cotacoes WHERE id = ?').get(cotacao_id);
  if (!cotacao) throw erro.naoEncontrado('Cotação não encontrada.');

  const pecas = db.prepare(
    `SELECT ps.*, cat.nome AS categoria_nome, sub.nome AS subcategoria_nome
       FROM pecas_solicitadas ps
       LEFT JOIN categorias_pecas cat ON cat.id = ps.categoria_id
       LEFT JOIN categorias_pecas sub ON sub.id = ps.subcategoria_id
      WHERE ps.ficha_id = ? AND ps.status <> 'cancelada'
      ORDER BY CASE ps.urgencia WHEN 'critica' THEN 0 WHEN 'alta' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, ps.id`
  ).all(cotacao.ficha_id);

  const propostas = db.prepare(
    `SELECT p.*, f.nome AS fornecedor_nome, f.whatsapp AS fornecedor_whatsapp, f.telefone AS fornecedor_telefone
       FROM propostas p JOIN fornecedores f ON f.id = p.fornecedor_id
      WHERE p.cotacao_id = ? ORDER BY p.valor_total`
  ).all(cotacao_id);

  const itens = pecas.map((peca) => {
    const doItem = propostas.filter((p) => p.peca_id === peca.id);
    const valores = doItem.map((p) => p.valor_total).filter((n) => Number.isFinite(n));
    const menor = valores.length ? Math.min(...valores) : null;
    const maior = valores.length ? Math.max(...valores) : null;
    return {
      ...peca,
      propostas: doItem.map((p) => ({
        ...p,
        menor_valor: menor !== null && p.valor_total === menor,
        diferenca_menor: menor === null ? 0 : arredondar(p.valor_total - menor),
        diferenca_percentual: menor ? arredondar(((p.valor_total - menor) / menor) * 100) : 0,
      })),
      menor_valor: menor,
      maior_valor: maior,
      economia_possivel: menor !== null && maior !== null ? arredondar(maior - menor) : 0,
      selecionada: doItem.find((p) => p.selecionada) || null,
      total_propostas: doItem.length,
    };
  });

  // Consolidacao por fornecedor considerando apenas as propostas escolhidas.
  const porFornecedor = new Map();
  for (const item of itens) {
    const sel = item.selecionada;
    if (!sel) continue;
    const atual = porFornecedor.get(sel.fornecedor_id) || {
      fornecedor_id: sel.fornecedor_id, fornecedor_nome: sel.fornecedor_nome,
      itens: 0, subtotal: 0, desconto: 0, frete: 0, total: 0,
      forma_pagamento: sel.forma_pagamento, prazo_entrega_dias: sel.prazo_entrega_dias,
    };
    atual.itens += 1;
    atual.subtotal = arredondar(atual.subtotal + sel.quantidade * sel.valor_unitario);
    atual.desconto = arredondar(atual.desconto + (sel.desconto || 0));
    atual.frete = arredondar(atual.frete + (sel.frete || 0));
    atual.total = arredondar(atual.total + sel.valor_total);
    atual.prazo_entrega_dias = Math.max(atual.prazo_entrega_dias || 0, sel.prazo_entrega_dias || 0);
    porFornecedor.set(sel.fornecedor_id, atual);
  }

  const resumo = {
    total_pecas: itens.length,
    pecas_com_proposta: itens.filter((i) => i.total_propostas > 0).length,
    pecas_selecionadas: itens.filter((i) => i.selecionada).length,
    total_geral: arredondar([...porFornecedor.values()].reduce((s, f) => s + f.total, 0)),
    total_menor_valor: arredondar(itens.reduce((s, i) => s + (i.menor_valor || 0), 0)),
    economia_total: arredondar(itens.reduce((s, i) => s + i.economia_possivel, 0)),
    fornecedores: [...porFornecedor.values()].sort((a, b) => b.total - a.total),
  };

  const ficha = L.buscarFicha(cotacao.ficha_id);
  return { cotacao, ficha, itens, resumo };
}

// ------------------------------------------------------------------ Listagem
router.get('/', rota((req, res) => {
  const { busca, status, de, ate } = req.query;
  const filtros = [];
  const params = {};
  if (status) { filtros.push('co.status = @status'); params.status = status; }
  if (busca) {
    params.busca = `%${String(busca).trim()}%`;
    filtros.push(`(co.numero LIKE @busca OR f.numero LIKE @busca OR REPLACE(c.placa,'-','') LIKE @busca OR e.nome LIKE @busca)`);
  }
  if (de) { filtros.push('date(co.criado_em) >= @de'); params.de = v.data(de, 'período inicial'); }
  if (ate) { filtros.push('date(co.criado_em) <= @ate'); params.ate = v.data(ate, 'período final'); }
  const onde = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';

  const itens = db.prepare(
    `SELECT co.*, f.numero AS ficha_numero, f.prioridade, c.placa, c.codigo_frota, e.nome AS empresa_nome,
            u.nome AS criado_por_nome,
            (SELECT COUNT(*) FROM pecas_solicitadas ps WHERE ps.ficha_id = co.ficha_id AND ps.status <> 'cancelada') AS total_pecas,
            (SELECT COUNT(*) FROM propostas p WHERE p.cotacao_id = co.id) AS total_propostas,
            (SELECT COUNT(*) FROM propostas p WHERE p.cotacao_id = co.id AND p.selecionada = 1) AS total_selecionadas,
            (SELECT IFNULL(SUM(p.valor_total),0) FROM propostas p WHERE p.cotacao_id = co.id AND p.selecionada = 1) AS total_geral
       FROM cotacoes co
       JOIN fichas f ON f.id = co.ficha_id
       JOIN caminhoes c ON c.id = f.caminhao_id
       LEFT JOIN empresas e ON e.id = c.empresa_id
       LEFT JOIN usuarios u ON u.id = co.criado_por
       ${onde} ORDER BY co.id DESC LIMIT 200`
  ).all(params);
  res.json({ itens, total: itens.length });
}));

/** Fichas aceitas que ainda nao possuem cotacao aberta. */
router.get('/pendentes', rota((_req, res) => {
  const itens = db.prepare(
    `SELECT f.id, f.numero, f.prioridade, f.enviada_em, c.placa, c.codigo_frota, e.nome AS empresa_nome,
            u.nome AS mecanico_nome,
            (SELECT COUNT(*) FROM pecas_solicitadas ps WHERE ps.ficha_id = f.id AND ps.status = 'aguardando_cotacao') AS pecas_aguardando
       FROM fichas f
       JOIN caminhoes c ON c.id = f.caminhao_id
       JOIN usuarios u ON u.id = f.mecanico_id
       LEFT JOIN empresas e ON e.id = c.empresa_id
      WHERE f.status = 'em_cotacao'
        AND NOT EXISTS (SELECT 1 FROM cotacoes co WHERE co.ficha_id = f.id AND co.status IN ('aberta','aguardando_aprovacao'))
      ORDER BY CASE f.prioridade WHEN 'critica' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END, f.enviada_em`
  ).all();
  res.json({ itens, total: itens.length });
}));

router.get('/:id', rota((req, res) => res.json(montarComparativo(req.params.id))));

// ------------------------------------------------------------------ Criacao
router.post('/', rota((req, res) => {
  const ficha_id = v.numero(req.body.ficha_id, 'Ficha', { obrigatorio: true, inteiro: true, min: 1 });
  const ficha = L.buscarFicha(ficha_id);
  if (['rascunho', 'cancelada'].includes(ficha.status)) {
    throw erro.conflito('Não é possível cotar uma ficha em rascunho ou cancelada.');
  }
  const pecas = db.prepare(
    `SELECT COUNT(*) AS t FROM pecas_solicitadas WHERE ficha_id = ? AND status <> 'cancelada'`
  ).get(ficha_id).t;
  if (!pecas) throw erro.conflito('Esta ficha não possui peças para cotar.');

  const aberta = db.prepare(
    `SELECT id, numero FROM cotacoes WHERE ficha_id = ? AND status IN ('aberta','aguardando_aprovacao')`
  ).get(ficha_id);
  if (aberta) throw erro.conflito(`A ficha já possui a cotação ${aberta.numero} em andamento.`, { cotacao_id: aberta.id });

  const numero = gerarNumero('COT');
  const info = db.transaction(() => {
    const r = db.prepare(
      `INSERT INTO cotacoes (numero, ficha_id, status, observacoes, criado_por)
       VALUES (?, ?, 'aberta', ?, ?)`
    ).run(numero, ficha_id, v.texto(req.body.observacoes, 'Observações', { max: 2000 }), req.usuario.id);
    db.prepare(
      `UPDATE pecas_solicitadas SET status='em_cotacao', atualizado_em=datetime('now')
        WHERE ficha_id=? AND status IN ('aguardando_analise','aguardando_cotacao','devolvida')`
    ).run(ficha_id);
    db.prepare("UPDATE fichas SET status='em_cotacao', atualizado_em=datetime('now') WHERE id=? AND status <> 'em_cotacao'").run(ficha_id);
    return r;
  })();

  registrar(req, {
    entidade: 'cotacao', entidade_id: info.lastInsertRowid, acao: 'criada',
    descricao: `Cotação ${numero} aberta a partir da ficha ${ficha.numero}`,
  });
  registrar(req, {
    entidade: 'ficha', entidade_id: ficha_id, acao: 'cotacao_aberta',
    descricao: `Cotação ${numero} iniciada`,
  });
  res.status(201).json(montarComparativo(info.lastInsertRowid));
}));

// ------------------------------------------------------------------ Propostas
function dadosProposta(body) {
  const dados = {
    fornecedor_id: v.numero(body.fornecedor_id, 'Fornecedor', { obrigatorio: true, inteiro: true, min: 1 }),
    marca_oferecida: v.texto(body.marca_oferecida, 'Marca oferecida', { max: 80 }),
    codigo_peca: v.texto(body.codigo_peca, 'Código da peça', { max: 80 }),
    quantidade: v.numero(body.quantidade, 'Quantidade', { obrigatorio: true, min: 0.01, max: 99999 }),
    valor_unitario: v.numero(body.valor_unitario, 'Valor unitário', { obrigatorio: true, min: 0, max: 9999999 }),
    desconto: v.numero(body.desconto, 'Desconto', { min: 0, max: 9999999 }) || 0,
    frete: v.numero(body.frete, 'Frete', { min: 0, max: 9999999 }) || 0,
    prazo_entrega_dias: v.numero(body.prazo_entrega_dias, 'Prazo de entrega', { inteiro: true, min: 0, max: 365 }),
    forma_pagamento: v.texto(body.forma_pagamento, 'Forma de pagamento', { max: 80 }),
    garantia: v.texto(body.garantia, 'Garantia', { max: 120 }),
    disponibilidade: v.opcao(body.disponibilidade, 'Disponibilidade', D.DISPONIBILIDADES, { padrao: 'A confirmar' }),
    data_cotacao: v.data(body.data_cotacao, 'Data da cotação') || new Date().toISOString().slice(0, 10),
    validade: v.data(body.validade, 'Validade da proposta'),
    vendedor_nome: v.texto(body.vendedor_nome, 'Nome do vendedor', { max: 120 }),
    vendedor_telefone: v.digitos(body.vendedor_telefone),
    observacoes: v.texto(body.observacoes, 'Observações', { max: 2000 }),
  };
  const bruto = dados.quantidade * dados.valor_unitario;
  if (dados.desconto > bruto) {
    throw erro.requisicao('O desconto não pode ser maior que o valor das peças.', { campo: 'desconto' });
  }
  return { ...dados, ...calcularTotal(dados) };
}

router.post('/:id/propostas', rota((req, res) => {
  const cotacao = db.prepare('SELECT * FROM cotacoes WHERE id = ?').get(req.params.id);
  if (!cotacao) throw erro.naoEncontrado('Cotação não encontrada.');
  if (cotacao.status !== 'aberta') throw erro.conflito('Esta cotação não aceita novas propostas.');

  const peca_id = v.numero(req.body.peca_id, 'Peça', { obrigatorio: true, inteiro: true, min: 1 });
  const peca = db.prepare('SELECT * FROM pecas_solicitadas WHERE id = ? AND ficha_id = ?').get(peca_id, cotacao.ficha_id);
  if (!peca) throw erro.requisicao('A peça informada não pertence a esta cotação.', { campo: 'peca_id' });
  if (peca.status === 'cancelada') throw erro.conflito('Esta peça foi cancelada.');

  const dados = dadosProposta({ quantidade: peca.quantidade, ...req.body });
  const fornecedor = db.prepare('SELECT id, nome, vendedor, telefone, whatsapp FROM fornecedores WHERE id = ? AND ativo = 1')
    .get(dados.fornecedor_id);
  if (!fornecedor) throw erro.requisicao('Fornecedor inválido ou inativo.', { campo: 'fornecedor_id' });

  const info = db.prepare(
    `INSERT INTO propostas (cotacao_id, peca_id, fornecedor_id, marca_oferecida, codigo_peca, quantidade,
       valor_unitario, desconto, frete, valor_total, prazo_entrega_dias, forma_pagamento, garantia,
       disponibilidade, data_cotacao, validade, vendedor_nome, vendedor_telefone, observacoes, criado_por)
     VALUES (@cotacao_id, @peca_id, @fornecedor_id, @marca_oferecida, @codigo_peca, @quantidade,
       @valor_unitario, @desconto, @frete, @valor_total, @prazo_entrega_dias, @forma_pagamento, @garantia,
       @disponibilidade, @data_cotacao, @validade, @vendedor_nome, @vendedor_telefone, @observacoes, @criado_por)`
  ).run({
    ...dados, cotacao_id: cotacao.id, peca_id, criado_por: req.usuario.id,
    vendedor_nome: dados.vendedor_nome || fornecedor.vendedor,
    vendedor_telefone: dados.vendedor_telefone || fornecedor.whatsapp || fornecedor.telefone,
  });

  registrar(req, {
    entidade: 'cotacao', entidade_id: cotacao.id, acao: 'proposta_adicionada',
    descricao: `Proposta de ${fornecedor.nome} para "${peca.nome}" — total ${moeda(dados.valor_total)}`,
    detalhes: { peca_id, fornecedor_id: fornecedor.id, valor_total: dados.valor_total },
  });
  res.status(201).json({ id: info.lastInsertRowid, ...montarComparativo(cotacao.id) });
}));

router.put('/propostas/:propostaId', rota((req, res) => {
  const proposta = db.prepare('SELECT * FROM propostas WHERE id = ?').get(req.params.propostaId);
  if (!proposta) throw erro.naoEncontrado('Proposta não encontrada.');
  const cotacao = db.prepare('SELECT * FROM cotacoes WHERE id = ?').get(proposta.cotacao_id);
  if (cotacao.status === 'aprovada') throw erro.conflito('A cotação já foi aprovada e não pode ser alterada.');

  const peca = db.prepare('SELECT quantidade FROM pecas_solicitadas WHERE id = ?').get(proposta.peca_id);
  const dados = dadosProposta({ quantidade: peca.quantidade, ...req.body });

  db.prepare(
    `UPDATE propostas SET fornecedor_id=@fornecedor_id, marca_oferecida=@marca_oferecida, codigo_peca=@codigo_peca,
       quantidade=@quantidade, valor_unitario=@valor_unitario, desconto=@desconto, frete=@frete,
       valor_total=@valor_total, prazo_entrega_dias=@prazo_entrega_dias, forma_pagamento=@forma_pagamento,
       garantia=@garantia, disponibilidade=@disponibilidade, data_cotacao=@data_cotacao, validade=@validade,
       vendedor_nome=@vendedor_nome, vendedor_telefone=@vendedor_telefone, observacoes=@observacoes,
       atualizado_em=datetime('now')
     WHERE id=@id`
  ).run({ ...dados, id: proposta.id });

  registrar(req, {
    entidade: 'cotacao', entidade_id: cotacao.id, acao: 'proposta_atualizada',
    descricao: `Proposta #${proposta.id} atualizada`, detalhes: diferencas(proposta, dados),
  });
  res.json(montarComparativo(cotacao.id));
}));

router.delete('/propostas/:propostaId', rota((req, res) => {
  const proposta = db.prepare('SELECT * FROM propostas WHERE id = ?').get(req.params.propostaId);
  if (!proposta) throw erro.naoEncontrado('Proposta não encontrada.');
  const cotacao = db.prepare('SELECT * FROM cotacoes WHERE id = ?').get(proposta.cotacao_id);
  if (cotacao.status === 'aprovada') throw erro.conflito('A cotação já foi aprovada.');
  if (req.query.confirmar !== '1') throw erro.conflito('Confirme a exclusão da proposta.', { requer_confirmacao: true });

  db.prepare('DELETE FROM propostas WHERE id = ?').run(proposta.id);
  registrar(req, {
    entidade: 'cotacao', entidade_id: cotacao.id, acao: 'proposta_removida',
    descricao: `Proposta #${proposta.id} removida`, detalhes: { dados_anteriores: proposta },
  });
  res.json(montarComparativo(cotacao.id));
}));

/** Escolhe a proposta vencedora de uma peca (nunca automatico). */
router.post('/propostas/:propostaId/selecionar', rota((req, res) => {
  const proposta = db.prepare('SELECT * FROM propostas WHERE id = ?').get(req.params.propostaId);
  if (!proposta) throw erro.naoEncontrado('Proposta não encontrada.');
  const cotacao = db.prepare('SELECT * FROM cotacoes WHERE id = ?').get(proposta.cotacao_id);
  if (cotacao.status === 'aprovada') throw erro.conflito('A cotação já foi aprovada.');

  const fornecedor = db.prepare('SELECT nome FROM fornecedores WHERE id = ?').get(proposta.fornecedor_id);
  const peca = db.prepare('SELECT nome FROM pecas_solicitadas WHERE id = ?').get(proposta.peca_id);
  const jaSelecionada = proposta.selecionada === 1;

  db.transaction(() => {
    db.prepare('UPDATE propostas SET selecionada = 0 WHERE peca_id = ?').run(proposta.peca_id);
    if (!jaSelecionada) db.prepare('UPDATE propostas SET selecionada = 1 WHERE id = ?').run(proposta.id);
  })();

  registrar(req, {
    entidade: 'cotacao', entidade_id: cotacao.id,
    acao: jaSelecionada ? 'proposta_desmarcada' : 'proposta_selecionada',
    descricao: jaSelecionada
      ? `Seleção removida da peça "${peca.nome}"`
      : `Fornecedor ${fornecedor.nome} escolhido para "${peca.nome}" — ${moeda(proposta.valor_total)}`,
  });
  res.json(montarComparativo(cotacao.id));
}));

// ------------------------------------------------------------------ Aprovacao
router.post('/:id/enviar-aprovacao', rota((req, res) => {
  const { cotacao, itens } = montarComparativo(req.params.id);
  if (cotacao.status !== 'aberta') throw erro.conflito('Esta cotação já saiu da fase de coleta de propostas.');
  const semProposta = itens.filter((i) => !i.total_propostas);
  if (semProposta.length) {
    throw erro.requisicao('Existem peças sem nenhuma proposta cadastrada.', {
      pendencias: semProposta.map((i) => i.nome),
    });
  }
  db.transaction(() => {
    db.prepare("UPDATE cotacoes SET status='aguardando_aprovacao', atualizado_em=datetime('now') WHERE id=?").run(cotacao.id);
    db.prepare(
      `UPDATE pecas_solicitadas SET status='aguardando_aprovacao', atualizado_em=datetime('now')
        WHERE ficha_id=? AND status IN ('em_cotacao','aguardando_cotacao')`
    ).run(cotacao.ficha_id);
    db.prepare("UPDATE fichas SET status='aguardando_aprovacao', atualizado_em=datetime('now') WHERE id=?").run(cotacao.ficha_id);
  })();
  registrar(req, {
    entidade: 'cotacao', entidade_id: cotacao.id, acao: 'enviada_aprovacao',
    descricao: `Cotação ${cotacao.numero} enviada para aprovação`,
  });
  res.json(montarComparativo(cotacao.id));
}));

router.post('/:id/aprovar', rota((req, res) => {
  const { cotacao, ficha, itens, resumo } = montarComparativo(req.params.id);
  if (cotacao.status === 'aprovada') throw erro.conflito('Esta cotação já foi aprovada.');
  if (cotacao.status === 'cancelada') throw erro.conflito('Esta cotação foi cancelada.');

  const semSelecao = itens.filter((i) => !i.selecionada && i.total_propostas > 0);
  if (semSelecao.length && !req.body.confirmar) {
    throw erro.conflito(
      `${semSelecao.length} peça(s) ainda estão sem fornecedor escolhido. Confirme para aprovar apenas as selecionadas.`,
      { requer_confirmacao: true, pendencias: semSelecao.map((i) => i.nome) }
    );
  }
  if (!resumo.pecas_selecionadas) throw erro.requisicao('Escolha ao menos uma proposta antes de aprovar.');

  db.transaction(() => {
    db.prepare(
      `UPDATE cotacoes SET status='aprovada', aprovada_por=?, aprovada_em=datetime('now'),
         atualizado_em=datetime('now') WHERE id=?`
    ).run(req.usuario.id, cotacao.id);
    const selecionadas = itens.filter((i) => i.selecionada).map((i) => i.id);
    if (selecionadas.length) {
      db.prepare(
        `UPDATE pecas_solicitadas SET status='aprovada', atualizado_em=datetime('now')
          WHERE id IN (${selecionadas.map(() => '?').join(',')})`
      ).run(...selecionadas);
    }
    db.prepare("UPDATE fichas SET status='aprovada', atualizado_em=datetime('now') WHERE id=?").run(cotacao.ficha_id);
  })();

  registrar(req, {
    entidade: 'cotacao', entidade_id: cotacao.id, acao: 'aprovada',
    descricao: `Cotação ${cotacao.numero} aprovada — total ${moeda(resumo.total_geral)}`,
    detalhes: { total_geral: resumo.total_geral, fornecedores: resumo.fornecedores.map((f) => f.fornecedor_nome) },
  });
  registrar(req, {
    entidade: 'ficha', entidade_id: cotacao.ficha_id, acao: 'cotacao_aprovada',
    descricao: `Cotação ${cotacao.numero} aprovada`,
  });
  notificarUsuario(ficha.mecanico_id, {
    titulo: 'Peças aprovadas para compra',
    mensagem: `${ficha.numero} — ${resumo.pecas_selecionadas} peça(s) aprovadas.`,
    tipo: 'sucesso', link: `/#/fichas/${ficha.id}`,
  });
  res.json(montarComparativo(cotacao.id));
}));

router.post('/:id/cancelar', rota((req, res) => {
  const cotacao = db.prepare('SELECT * FROM cotacoes WHERE id = ?').get(req.params.id);
  if (!cotacao) throw erro.naoEncontrado('Cotação não encontrada.');
  if (cotacao.status === 'cancelada') throw erro.conflito('Esta cotação já está cancelada.');
  if (req.body.confirmar !== true && req.body.confirmar !== 'true') {
    throw erro.conflito('Confirme o cancelamento da cotação.', { requer_confirmacao: true });
  }
  const motivo = v.texto(req.body.motivo, 'Motivo do cancelamento', { obrigatorio: true, min: 5, max: 1000 });

  db.transaction(() => {
    db.prepare(
      `UPDATE cotacoes SET status='cancelada', cancelada_em=datetime('now'), cancelada_motivo=?,
         atualizado_em=datetime('now') WHERE id=?`
    ).run(motivo, cotacao.id);
    db.prepare(
      `UPDATE pecas_solicitadas SET status='aguardando_cotacao', atualizado_em=datetime('now')
        WHERE ficha_id=? AND status IN ('em_cotacao','aguardando_aprovacao')`
    ).run(cotacao.ficha_id);
    db.prepare("UPDATE fichas SET status='em_cotacao', atualizado_em=datetime('now') WHERE id=?").run(cotacao.ficha_id);
  })();

  registrar(req, {
    entidade: 'cotacao', entidade_id: cotacao.id, acao: 'cancelada',
    descricao: `Cotação ${cotacao.numero} cancelada`, detalhes: { motivo },
  });
  res.json({ ok: true });
}));

router.put('/:id', rota((req, res) => {
  const cotacao = db.prepare('SELECT * FROM cotacoes WHERE id = ?').get(req.params.id);
  if (!cotacao) throw erro.naoEncontrado('Cotação não encontrada.');
  const observacoes = v.texto(req.body.observacoes, 'Observações', { max: 2000 });
  db.prepare("UPDATE cotacoes SET observacoes=?, atualizado_em=datetime('now') WHERE id=?").run(observacoes, cotacao.id);
  registrar(req, { entidade: 'cotacao', entidade_id: cotacao.id, acao: 'atualizada', descricao: 'Observações da cotação atualizadas' });
  res.json(montarComparativo(cotacao.id));
}));

module.exports = { router, montarComparativo, calcularTotal, arredondar };
