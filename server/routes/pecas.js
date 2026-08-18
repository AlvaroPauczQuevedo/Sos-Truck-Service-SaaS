'use strict';
/** Solicitacao de pecas, fila da administracao, recebimento e instalacao. */
const express = require('express');
const { db } = require('../db');
const { rota, erro } = require('../lib/http');
const v = require('../lib/validacao');
const { exigirLogin, exigirAdmin, ehAdmin } = require('../lib/auth');
const { registrar, diferencas, notificarUsuario, notificarPerfil } = require('../lib/registro');
const { upload } = require('../lib/upload');
const fotosLib = require('../lib/fotos');
const L = require('../lib/fichas');
const D = require('../lib/dominio');

const router = express.Router();          // montado em /api/pecas
const rotasFicha = express.Router();      // montado em /api (rotas por ficha)
router.use(exigirLogin);


// ------------------------------------------------------------------ Categorias
router.get('/categorias', rota((_req, res) => {
  const todas = db.prepare('SELECT id, nome, pai_id, nivel FROM categorias_pecas WHERE ativo = 1 ORDER BY ordem, nome').all();
  const raizes = todas.filter((c) => !c.pai_id);
  res.json({
    itens: raizes.map((r) => ({ ...r, subcategorias: todas.filter((c) => c.pai_id === r.id) })),
  });
}));

// ------------------------------------------------------------------ Fila / listagem
router.get('/', rota((req, res) => {
  const { busca, status, urgencia, categoria_id, ficha_id, mecanico_id, empresa_id, de, ate } = req.query;
  const pagina = Math.max(1, Number(req.query.pagina) || 1);
  const porPagina = Math.min(200, Math.max(5, Number(req.query.por_pagina) || 30));
  const admin = ehAdmin(req);

  const filtros = [];
  const params = {};
  if (!admin) { filtros.push('(f.mecanico_id = @eu)'); params.eu = req.usuario.id; }
  if (busca) {
    params.busca = `%${String(busca).trim()}%`;
    filtros.push(`(ps.nome LIKE @busca OR ps.codigo_referencia LIKE @busca OR ps.marca_preferencial LIKE @busca
                   OR f.numero LIKE @busca OR REPLACE(c.placa,'-','') LIKE @busca OR c.codigo_frota LIKE @busca)`);
  }
  if (status) {
    const lista = String(status).split(',').map((s) => s.trim()).filter(Boolean);
    filtros.push(`ps.status IN (${lista.map((_, i) => `@st${i}`).join(',')})`);
    lista.forEach((s, i) => { params[`st${i}`] = s; });
  }
  if (urgencia) { filtros.push('ps.urgencia = @urgencia'); params.urgencia = urgencia; }
  if (categoria_id) { filtros.push('(ps.categoria_id = @categoria_id OR ps.subcategoria_id = @categoria_id)'); params.categoria_id = Number(categoria_id); }
  if (ficha_id) { filtros.push('ps.ficha_id = @ficha_id'); params.ficha_id = Number(ficha_id); }
  if (mecanico_id) { filtros.push('f.mecanico_id = @mecanico_id'); params.mecanico_id = Number(mecanico_id); }
  if (empresa_id) { filtros.push('c.empresa_id = @empresa_id'); params.empresa_id = Number(empresa_id); }
  if (de) { filtros.push('date(ps.criado_em) >= @de'); params.de = v.data(de, 'período inicial'); }
  if (ate) { filtros.push('date(ps.criado_em) <= @ate'); params.ate = v.data(ate, 'período final'); }

  const onde = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
  const juncoes = `FROM pecas_solicitadas ps
      JOIN fichas f ON f.id = ps.ficha_id
      JOIN caminhoes c ON c.id = f.caminhao_id
      LEFT JOIN empresas e ON e.id = c.empresa_id
      LEFT JOIN categorias_pecas cat ON cat.id = ps.categoria_id
      LEFT JOIN categorias_pecas sub ON sub.id = ps.subcategoria_id
      LEFT JOIN usuarios u ON u.id = f.mecanico_id`;

  const total = db.prepare(`SELECT COUNT(*) AS t ${juncoes} ${onde}`).get(params).t;
  const extra = admin
    ? `, (SELECT p.valor_total FROM propostas p WHERE p.peca_id = ps.id AND p.selecionada = 1 LIMIT 1) AS valor_aprovado,
         (SELECT COUNT(*) FROM propostas p WHERE p.peca_id = ps.id) AS total_propostas`
    : '';

  const itens = db.prepare(
    `SELECT ps.*, f.numero AS ficha_numero, f.status AS ficha_status, c.placa, c.codigo_frota,
            c.marca AS caminhao_marca, c.modelo AS caminhao_modelo, e.nome AS empresa_nome,
            cat.nome AS categoria_nome, sub.nome AS subcategoria_nome, u.nome AS mecanico_nome,
            (SELECT COUNT(*) FROM fotos fo WHERE fo.entidade='peca' AND fo.entidade_id=ps.id) AS total_fotos
            ${extra}
       ${juncoes} ${onde}
      ORDER BY CASE ps.urgencia WHEN 'critica' THEN 0 WHEN 'alta' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
               ps.criado_em
      LIMIT @limite OFFSET @deslocamento`
  ).all({ ...params, limite: porPagina, deslocamento: (pagina - 1) * porPagina });

  res.json({ itens, total, pagina, por_pagina: porPagina, paginas: Math.max(1, Math.ceil(total / porPagina)) });
}));

// ------------------------------------------------------------------ Criacao / edicao
function dadosPeca(body) {
  const dados = {
    categoria_id: v.numero(body.categoria_id, 'Categoria', { obrigatorio: true, inteiro: true, min: 1 }),
    subcategoria_id: v.numero(body.subcategoria_id, 'Subcategoria', { inteiro: true, min: 1 }),
    nome: v.texto(body.nome, 'Nome da peça', { obrigatorio: true, min: 2, max: 160 }),
    descricao: v.texto(body.descricao, 'Descrição detalhada', { max: 3000 }),
    codigo_referencia: v.texto(body.codigo_referencia, 'Código ou referência', { max: 80 }),
    marca_preferencial: v.texto(body.marca_preferencial, 'Marca preferencial', { max: 80 }),
    quantidade: v.numero(body.quantidade, 'Quantidade', { obrigatorio: true, min: 0.01, max: 99999 }),
    unidade: v.opcao(body.unidade, 'Unidade de medida', D.UNIDADES, { padrao: 'UN' }),
    posicao: v.opcao(body.posicao, 'Lado ou posição', D.POSICOES, { padrao: null }),
    tipo_peca: v.opcao(body.tipo_peca, 'Tipo da peça', D.TIPOS_PECA, { padrao: 'indiferente' }),
    urgencia: v.opcao(body.urgencia, 'Urgência', D.URGENCIAS, { padrao: 'normal' }),
    motivo_troca: v.texto(body.motivo_troca, 'Motivo da troca', { obrigatorio: true, min: 3, max: 2000 }),
    observacoes_mecanico: v.texto(body.observacoes_mecanico, 'Observações do mecânico', { max: 2000 }),
    problema_id: v.numero(body.problema_id, 'Problema relacionado', { inteiro: true, min: 1 }),
  };
  const categoria = db.prepare('SELECT id, pai_id FROM categorias_pecas WHERE id = ?').get(dados.categoria_id);
  if (!categoria || categoria.pai_id) throw erro.requisicao('Selecione uma categoria principal válida.', { campo: 'categoria_id' });
  if (dados.subcategoria_id) {
    const sub = db.prepare('SELECT id, pai_id FROM categorias_pecas WHERE id = ?').get(dados.subcategoria_id);
    if (!sub || sub.pai_id !== dados.categoria_id) {
      throw erro.requisicao('A subcategoria não pertence à categoria escolhida.', { campo: 'subcategoria_id' });
    }
  }
  return dados;
}

rotasFicha.post('/fichas/:fichaId/pecas', exigirLogin, upload.array('fotos', 12), rota((req, res) => {
  const ficha = L.buscarFicha(req.params.fichaId);
  L.exigirEdicaoMecanico(req, ficha);
  const dados = dadosPeca(req.body);

  if (dados.problema_id) {
    const p = db.prepare('SELECT id FROM problemas WHERE id = ? AND ficha_id = ?').get(dados.problema_id, ficha.id);
    if (!p) throw erro.requisicao('O problema selecionado não pertence a esta ficha.', { campo: 'problema_id' });
  }

  const info = db.prepare(
    `INSERT INTO pecas_solicitadas (ficha_id, problema_id, categoria_id, subcategoria_id, nome, descricao,
       codigo_referencia, marca_preferencial, quantidade, unidade, posicao, tipo_peca, urgencia,
       motivo_troca, observacoes_mecanico, status, criado_por)
     VALUES (@ficha_id, @problema_id, @categoria_id, @subcategoria_id, @nome, @descricao,
       @codigo_referencia, @marca_preferencial, @quantidade, @unidade, @posicao, @tipo_peca, @urgencia,
       @motivo_troca, @observacoes_mecanico, @status, @criado_por)`
  ).run({
    ...dados, ficha_id: ficha.id, criado_por: req.usuario.id,
    status: ficha.status === 'rascunho' ? 'rascunho' : 'aguardando_analise',
  });

  const id = info.lastInsertRowid;
  registrar(req, {
    entidade: 'ficha', entidade_id: ficha.id, acao: 'peca_solicitada',
    descricao: `Peça "${dados.nome}" solicitada (${dados.quantidade} ${dados.unidade}, urgência ${D.URGENCIAS[dados.urgencia].rotulo})`,
  });
  fotosLib.salvar(req, 'peca', id, req.files);

  if (dados.urgencia === 'critica' && ficha.status !== 'rascunho') {
    notificarPerfil('admin', {
      titulo: 'Peça crítica solicitada',
      mensagem: `${ficha.numero} — ${dados.nome} (${ficha.placa})`,
      tipo: 'alerta', link: `/#/fichas/${ficha.id}`,
    });
  }
  const peca = L.listarPecas(ficha.id, ehAdmin(req)).find((p) => p.id === Number(id));
  res.status(201).json({ ...peca, fotos: fotosLib.listar('peca', id) });
}));

router.put('/:id', upload.array('fotos', 12), rota((req, res) => {
  const peca = db.prepare('SELECT * FROM pecas_solicitadas WHERE id = ?').get(req.params.id);
  if (!peca) throw erro.naoEncontrado('Peça não encontrada.');
  const ficha = L.buscarFicha(peca.ficha_id);

  if (!ehAdmin(req)) {
    L.exigirEdicaoMecanico(req, ficha);
  } else if (['comprada', 'recebida', 'entregue', 'instalada'].includes(peca.status)) {
    throw erro.conflito('Esta peça já foi comprada e não pode mais ser alterada.');
  }
  const dados = dadosPeca(req.body);

  db.prepare(
    `UPDATE pecas_solicitadas SET categoria_id=@categoria_id, subcategoria_id=@subcategoria_id, nome=@nome,
       descricao=@descricao, codigo_referencia=@codigo_referencia, marca_preferencial=@marca_preferencial,
       quantidade=@quantidade, unidade=@unidade, posicao=@posicao, tipo_peca=@tipo_peca, urgencia=@urgencia,
       motivo_troca=@motivo_troca, observacoes_mecanico=@observacoes_mecanico, problema_id=@problema_id,
       atualizado_em=datetime('now')
     WHERE id=@id`
  ).run({ ...dados, id: peca.id });

  registrar(req, {
    entidade: 'ficha', entidade_id: ficha.id, acao: 'peca_atualizada',
    descricao: `Peça "${dados.nome}" atualizada`, detalhes: diferencas(peca, dados),
  });
  fotosLib.salvar(req, 'peca', peca.id, req.files);

  const atualizada = L.listarPecas(ficha.id, ehAdmin(req)).find((p) => p.id === peca.id);
  res.json({ ...atualizada, fotos: fotosLib.listar('peca', peca.id) });
}));

router.post('/:id/fotos', upload.array('fotos', 12), rota((req, res) => {
  const peca = db.prepare('SELECT * FROM pecas_solicitadas WHERE id = ?').get(req.params.id);
  if (!peca) throw erro.naoEncontrado('Peça não encontrada.');
  if (!req.files || !req.files.length) throw erro.requisicao('Selecione ao menos uma foto.');
  if (!ehAdmin(req) && L.buscarFicha(peca.ficha_id).mecanico_id !== req.usuario.id) {
    throw erro.semPermissao('Esta peça pertence à ficha de outro mecânico.');
  }
  fotosLib.salvar(req, 'peca', peca.id, req.files, v.texto(req.body.legenda, 'Legenda', { max: 200 }));
  res.status(201).json({ ok: true, fotos: fotosLib.listar('peca', peca.id) });
}));

/** Cancelamento da peca - nunca ha exclusao definitiva. */
router.post('/:id/cancelar', rota((req, res) => {
  const peca = db.prepare('SELECT * FROM pecas_solicitadas WHERE id = ?').get(req.params.id);
  if (!peca) throw erro.naoEncontrado('Peça não encontrada.');
  const ficha = L.buscarFicha(peca.ficha_id);
  if (!ehAdmin(req)) L.exigirEdicaoMecanico(req, ficha);
  if (peca.status === 'cancelada') throw erro.conflito('Esta peça já está cancelada.');
  if (peca.status === 'instalada') throw erro.conflito('Uma peça já instalada não pode ser cancelada.');
  if (req.body.confirmar !== true && req.body.confirmar !== 'true') {
    throw erro.conflito('Confirme o cancelamento da peça.', { requer_confirmacao: true });
  }
  const motivo = v.texto(req.body.motivo, 'Motivo do cancelamento', { obrigatorio: true, min: 3, max: 1000 });

  db.prepare(
    `UPDATE pecas_solicitadas SET status='cancelada', cancelada_em=datetime('now'),
       cancelada_motivo=?, atualizado_em=datetime('now') WHERE id=?`
  ).run(motivo, peca.id);
  registrar(req, {
    entidade: 'ficha', entidade_id: ficha.id, acao: 'peca_cancelada',
    descricao: `Peça "${peca.nome}" cancelada`, detalhes: { motivo },
  });
  L.recalcularStatusFicha(ficha.id);
  res.json({ ok: true });
}));

// ------------------------------------------------------------------ Recebimento e instalacao
/** A administracao confirma o recebimento fisico da peca. */
router.post('/:id/receber', exigirAdmin, rota((req, res) => {
  const peca = db.prepare('SELECT * FROM pecas_solicitadas WHERE id = ?').get(req.params.id);
  if (!peca) throw erro.naoEncontrado('Peça não encontrada.');
  if (!['oc_emitida', 'comprada', 'aprovada'].includes(peca.status)) {
    throw erro.conflito('Só é possível receber peças com compra emitida.');
  }
  const ficha = L.buscarFicha(peca.ficha_id);
  const observacao = v.texto(req.body.observacao, 'Observação', { max: 1000 });

  db.transaction(() => {
    db.prepare(
      `UPDATE pecas_solicitadas SET status='recebida', recebida_em=datetime('now'), atualizado_em=datetime('now') WHERE id=?`
    ).run(peca.id);
    db.prepare(
      `UPDATE ordens_itens SET quantidade_recebida = quantidade, recebida_em = datetime('now')
        WHERE peca_id = ? AND recebida_em IS NULL`
    ).run(peca.id);
  })();

  registrar(req, {
    entidade: 'ficha', entidade_id: ficha.id, acao: 'peca_recebida',
    descricao: `Peça "${peca.nome}" recebida`, detalhes: { observacao },
  });
  notificarUsuario(ficha.mecanico_id, {
    titulo: 'Peça recebida',
    mensagem: `${peca.nome} chegou para a ficha ${ficha.numero} (${ficha.placa}).`,
    tipo: 'sucesso', link: `/#/fichas/${ficha.id}`,
  });
  L.recalcularStatusFicha(ficha.id);
  res.json({ ok: true, status: 'recebida' });
}));

/** Entrega da peca ao mecanico. */
router.post('/:id/entregar', exigirAdmin, rota((req, res) => {
  const peca = db.prepare('SELECT * FROM pecas_solicitadas WHERE id = ?').get(req.params.id);
  if (!peca) throw erro.naoEncontrado('Peça não encontrada.');
  if (peca.status !== 'recebida') throw erro.conflito('A peça precisa estar recebida para ser entregue ao mecânico.');
  const ficha = L.buscarFicha(peca.ficha_id);

  db.prepare(
    `UPDATE pecas_solicitadas SET status='entregue', entregue_em=datetime('now'), atualizado_em=datetime('now') WHERE id=?`
  ).run(peca.id);
  registrar(req, {
    entidade: 'ficha', entidade_id: ficha.id, acao: 'peca_entregue',
    descricao: `Peça "${peca.nome}" entregue ao mecânico`,
  });
  notificarUsuario(ficha.mecanico_id, {
    titulo: 'Peça disponível para instalação',
    mensagem: `${peca.nome} — ficha ${ficha.numero}.`,
    tipo: 'info', link: `/#/fichas/${ficha.id}`,
  });
  L.recalcularStatusFicha(ficha.id);
  res.json({ ok: true, status: 'entregue' });
}));

/** O mecanico confirma o recebimento ou a instalacao da peca. */
router.post('/:id/instalar', rota((req, res) => {
  const peca = db.prepare('SELECT * FROM pecas_solicitadas WHERE id = ?').get(req.params.id);
  if (!peca) throw erro.naoEncontrado('Peça não encontrada.');
  const ficha = L.buscarFicha(peca.ficha_id);
  if (!ehAdmin(req) && ficha.mecanico_id !== req.usuario.id) {
    throw erro.semPermissao('Somente o mecânico responsável pode confirmar a instalação.');
  }
  if (!['recebida', 'entregue', 'comprada', 'oc_emitida'].includes(peca.status)) {
    throw erro.conflito('A peça ainda não está disponível para instalação.');
  }
  const observacao = v.texto(req.body.observacao, 'Observação', { max: 1000 });

  db.prepare(
    `UPDATE pecas_solicitadas SET status='instalada', instalada_em=datetime('now'),
       entregue_em = IFNULL(entregue_em, datetime('now')), atualizado_em=datetime('now') WHERE id=?`
  ).run(peca.id);
  registrar(req, {
    entidade: 'ficha', entidade_id: ficha.id, acao: 'peca_instalada',
    descricao: `Peça "${peca.nome}" instalada`, detalhes: { observacao },
  });
  const novoStatus = L.recalcularStatusFicha(ficha.id);
  if (novoStatus === 'servico_concluido') {
    notificarPerfil('admin', {
      titulo: 'Todas as peças instaladas',
      mensagem: `${ficha.numero} — ${ficha.placa}. A ficha pode ser finalizada.`,
      tipo: 'sucesso', link: `/#/fichas/${ficha.id}`,
    });
  }
  res.json({ ok: true, status: 'instalada', ficha_status: novoStatus });
}));

/** Confirmacao do mecanico de que recebeu a peca em maos. */
router.post('/:id/confirmar-recebimento', rota((req, res) => {
  const peca = db.prepare('SELECT * FROM pecas_solicitadas WHERE id = ?').get(req.params.id);
  if (!peca) throw erro.naoEncontrado('Peça não encontrada.');
  const ficha = L.buscarFicha(peca.ficha_id);
  if (!ehAdmin(req) && ficha.mecanico_id !== req.usuario.id) {
    throw erro.semPermissao('Somente o mecânico responsável pode confirmar o recebimento.');
  }
  if (!['recebida', 'comprada', 'oc_emitida'].includes(peca.status)) {
    throw erro.conflito('Esta peça ainda não está disponível na oficina.');
  }
  db.prepare(
    `UPDATE pecas_solicitadas SET status='entregue', entregue_em=datetime('now'),
       recebida_em = IFNULL(recebida_em, datetime('now')), atualizado_em=datetime('now') WHERE id=?`
  ).run(peca.id);
  registrar(req, {
    entidade: 'ficha', entidade_id: ficha.id, acao: 'peca_confirmada_mecanico',
    descricao: `Mecânico confirmou o recebimento da peça "${peca.nome}"`,
  });
  L.recalcularStatusFicha(ficha.id);
  res.json({ ok: true, status: 'entregue' });
}));

module.exports = { router, rotasFicha };
