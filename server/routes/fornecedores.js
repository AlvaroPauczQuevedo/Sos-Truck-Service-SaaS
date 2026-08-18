'use strict';
/** Cadastro e consulta de fornecedores (acesso exclusivo da administracao). */
const express = require('express');
const { db } = require('../db');
const { rota, erro } = require('../lib/http');
const v = require('../lib/validacao');
const { exigirLogin, exigirAdmin } = require('../lib/auth');
const { registrar, diferencas } = require('../lib/registro');

const router = express.Router();
router.use(exigirLogin, exigirAdmin);

router.get('/', rota((req, res) => {
  const busca = (req.query.busca || '').trim();
  const filtros = [];
  const params = {};
  if (req.query.inativos !== '1') filtros.push('f.ativo = 1');
  if (busca) {
    params.busca = `%${busca}%`;
    filtros.push(`(f.nome LIKE @busca OR f.razao_social LIKE @busca OR f.cnpj LIKE @busca
                   OR f.vendedor LIKE @busca OR f.cidade LIKE @busca OR f.especialidades LIKE @busca)`);
  }
  const onde = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
  const itens = db.prepare(
    `SELECT f.*,
            (SELECT COUNT(*) FROM propostas p WHERE p.fornecedor_id = f.id) AS total_propostas,
            (SELECT COUNT(*) FROM propostas p WHERE p.fornecedor_id = f.id AND p.selecionada = 1) AS propostas_vencedoras,
            (SELECT COUNT(*) FROM ordens_compra o WHERE o.fornecedor_id = f.id AND o.status <> 'cancelada') AS total_ordens,
            (SELECT IFNULL(SUM(o.total),0) FROM ordens_compra o WHERE o.fornecedor_id = f.id AND o.status <> 'cancelada') AS total_comprado
       FROM fornecedores f ${onde} ORDER BY f.nome`
  ).all(params);
  res.json({ itens, total: itens.length });
}));

router.get('/:id', rota((req, res) => {
  const fornecedor = db.prepare('SELECT * FROM fornecedores WHERE id = ?').get(req.params.id);
  if (!fornecedor) throw erro.naoEncontrado('Fornecedor não encontrado.');
  fornecedor.ordens = db.prepare(
    `SELECT o.id, o.numero, o.status, o.total, o.data_emissao, f.numero AS ficha_numero, c.placa
       FROM ordens_compra o
       LEFT JOIN fichas f ON f.id = o.ficha_id
       LEFT JOIN caminhoes c ON c.id = o.caminhao_id
      WHERE o.fornecedor_id = ? ORDER BY o.id DESC LIMIT 50`
  ).all(fornecedor.id);
  fornecedor.desempenho = db.prepare(
    `SELECT COUNT(*) AS propostas, SUM(selecionada) AS vencedoras,
            AVG(prazo_entrega_dias) AS prazo_medio, AVG(valor_unitario) AS ticket_medio
       FROM propostas WHERE fornecedor_id = ?`
  ).get(fornecedor.id);
  res.json(fornecedor);
}));

function dadosFornecedor(body) {
  return {
    nome: v.texto(body.nome, 'Nome do fornecedor', { obrigatorio: true, max: 160 }),
    razao_social: v.texto(body.razao_social, 'Razão social', { max: 160 }),
    cnpj: v.cnpj(body.cnpj),
    telefone: v.digitos(body.telefone),
    whatsapp: v.digitos(body.whatsapp),
    email: body.email ? v.email(body.email, 'e-mail', { obrigatorio: false }) : null,
    vendedor: v.texto(body.vendedor, 'Vendedor', { max: 120 }),
    endereco: v.texto(body.endereco, 'Endereço', { max: 200 }),
    cidade: v.texto(body.cidade, 'Cidade', { max: 80 }),
    estado: v.texto(body.estado, 'Estado', { max: 2 }),
    cep: v.digitos(body.cep),
    prazo_medio_dias: v.numero(body.prazo_medio_dias, 'Prazo médio de entrega', { inteiro: true, min: 0, max: 365 }),
    condicoes_pagamento: v.texto(body.condicoes_pagamento, 'Condições de pagamento', { max: 300 }),
    especialidades: v.texto(body.especialidades, 'Especialidades', { max: 500 }),
    observacoes: v.texto(body.observacoes, 'Observações', { max: 2000 }),
  };
}

router.post('/', rota((req, res) => {
  const dados = dadosFornecedor(req.body);
  if (dados.cnpj) {
    const existe = db.prepare('SELECT id, nome FROM fornecedores WHERE cnpj = ?').get(dados.cnpj);
    if (existe) throw erro.conflito(`Já existe um fornecedor com este CNPJ: ${existe.nome}.`, { id: existe.id });
  }
  const info = db.prepare(
    `INSERT INTO fornecedores (nome, razao_social, cnpj, telefone, whatsapp, email, vendedor, endereco,
       cidade, estado, cep, prazo_medio_dias, condicoes_pagamento, especialidades, observacoes)
     VALUES (@nome, @razao_social, @cnpj, @telefone, @whatsapp, @email, @vendedor, @endereco,
       @cidade, @estado, @cep, @prazo_medio_dias, @condicoes_pagamento, @especialidades, @observacoes)`
  ).run(dados);
  registrar(req, {
    entidade: 'fornecedor', entidade_id: info.lastInsertRowid, acao: 'criado',
    descricao: `Fornecedor "${dados.nome}" cadastrado`,
  });
  res.status(201).json(db.prepare('SELECT * FROM fornecedores WHERE id = ?').get(info.lastInsertRowid));
}));

router.put('/:id', rota((req, res) => {
  const atual = db.prepare('SELECT * FROM fornecedores WHERE id = ?').get(req.params.id);
  if (!atual) throw erro.naoEncontrado('Fornecedor não encontrado.');
  const dados = dadosFornecedor(req.body);
  if (dados.cnpj) {
    const existe = db.prepare('SELECT id, nome FROM fornecedores WHERE cnpj = ? AND id <> ?').get(dados.cnpj, atual.id);
    if (existe) throw erro.conflito(`Já existe outro fornecedor com este CNPJ: ${existe.nome}.`);
  }
  db.prepare(
    `UPDATE fornecedores SET nome=@nome, razao_social=@razao_social, cnpj=@cnpj, telefone=@telefone,
       whatsapp=@whatsapp, email=@email, vendedor=@vendedor, endereco=@endereco, cidade=@cidade,
       estado=@estado, cep=@cep, prazo_medio_dias=@prazo_medio_dias, condicoes_pagamento=@condicoes_pagamento,
       especialidades=@especialidades, observacoes=@observacoes, atualizado_em=datetime('now')
     WHERE id=@id`
  ).run({ ...dados, id: atual.id });
  registrar(req, {
    entidade: 'fornecedor', entidade_id: atual.id, acao: 'atualizado',
    descricao: `Fornecedor "${dados.nome}" atualizado`, detalhes: diferencas(atual, dados),
  });
  res.json(db.prepare('SELECT * FROM fornecedores WHERE id = ?').get(atual.id));
}));

router.post('/:id/inativar', rota((req, res) => {
  const fornecedor = db.prepare('SELECT * FROM fornecedores WHERE id = ?').get(req.params.id);
  if (!fornecedor) throw erro.naoEncontrado('Fornecedor não encontrado.');
  const ativo = fornecedor.ativo ? 0 : 1;
  db.prepare("UPDATE fornecedores SET ativo=?, atualizado_em=datetime('now') WHERE id=?").run(ativo, fornecedor.id);
  registrar(req, {
    entidade: 'fornecedor', entidade_id: fornecedor.id, acao: ativo ? 'reativado' : 'inativado',
    descricao: `Fornecedor "${fornecedor.nome}" ${ativo ? 'reativado' : 'inativado'}`,
  });
  res.json({ ok: true, ativo });
}));

module.exports = router;
