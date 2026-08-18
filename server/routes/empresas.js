'use strict';
/** Empresas / proprietarios dos caminhoes. */
const express = require('express');
const { db } = require('../db');
const { rota, erro } = require('../lib/http');
const v = require('../lib/validacao');
const { exigirLogin, exigirAdmin } = require('../lib/auth');
const { registrar, diferencas } = require('../lib/registro');

const router = express.Router();
router.use(exigirLogin);

router.get('/', rota((req, res) => {
  const busca = (req.query.busca || '').trim();
  const incluirInativas = req.query.inativas === '1';
  const filtros = [];
  const params = {};
  if (!incluirInativas) filtros.push('e.ativo = 1');
  if (busca) {
    filtros.push('(e.nome LIKE @busca OR e.razao_social LIKE @busca OR e.cnpj LIKE @busca)');
    params.busca = `%${busca}%`;
  }
  const onde = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
  const itens = db.prepare(
    `SELECT e.*, (SELECT COUNT(*) FROM caminhoes c WHERE c.empresa_id = e.id AND c.ativo = 1) AS total_caminhoes
       FROM empresas e ${onde} ORDER BY e.nome`
  ).all(params);
  res.json({ itens, total: itens.length });
}));

router.get('/:id', rota((req, res) => {
  const empresa = db.prepare('SELECT * FROM empresas WHERE id = ?').get(req.params.id);
  if (!empresa) throw erro.naoEncontrado('Empresa não encontrada.');
  empresa.caminhoes = db.prepare(
    'SELECT id, placa, codigo_frota, marca, modelo, status FROM caminhoes WHERE empresa_id = ? AND ativo = 1 ORDER BY codigo_frota, placa'
  ).all(empresa.id);
  res.json(empresa);
}));

function dadosEmpresa(body) {
  return {
    nome: v.texto(body.nome, 'Nome da empresa', { obrigatorio: true, max: 160 }),
    razao_social: v.texto(body.razao_social, 'Razão social', { max: 160 }),
    cnpj: v.cnpj(body.cnpj),
    telefone: v.digitos(body.telefone),
    email: body.email ? v.email(body.email, 'e-mail', { obrigatorio: false }) : null,
    endereco: v.texto(body.endereco, 'Endereço', { max: 200 }),
    cidade: v.texto(body.cidade, 'Cidade', { max: 80 }),
    estado: v.texto(body.estado, 'Estado', { max: 2 }),
    cep: v.digitos(body.cep),
    responsavel: v.texto(body.responsavel, 'Responsável', { max: 120 }),
    observacoes: v.texto(body.observacoes, 'Observações', { max: 2000 }),
  };
}

router.post('/', exigirAdmin, rota((req, res) => {
  const dados = dadosEmpresa(req.body);
  if (dados.cnpj) {
    const existe = db.prepare('SELECT id, nome FROM empresas WHERE cnpj = ?').get(dados.cnpj);
    if (existe) throw erro.conflito(`Já existe uma empresa com este CNPJ: ${existe.nome}.`, { id: existe.id });
  }
  const info = db.prepare(
    `INSERT INTO empresas (nome, razao_social, cnpj, telefone, email, endereco, cidade, estado, cep, responsavel, observacoes)
     VALUES (@nome, @razao_social, @cnpj, @telefone, @email, @endereco, @cidade, @estado, @cep, @responsavel, @observacoes)`
  ).run(dados);
  registrar(req, { entidade: 'empresa', entidade_id: info.lastInsertRowid, acao: 'criada', descricao: `Empresa "${dados.nome}" cadastrada` });
  res.status(201).json(db.prepare('SELECT * FROM empresas WHERE id = ?').get(info.lastInsertRowid));
}));

router.put('/:id', exigirAdmin, rota((req, res) => {
  const atual = db.prepare('SELECT * FROM empresas WHERE id = ?').get(req.params.id);
  if (!atual) throw erro.naoEncontrado('Empresa não encontrada.');
  const dados = dadosEmpresa(req.body);
  if (dados.cnpj) {
    const existe = db.prepare('SELECT id, nome FROM empresas WHERE cnpj = ? AND id <> ?').get(dados.cnpj, atual.id);
    if (existe) throw erro.conflito(`Já existe outra empresa com este CNPJ: ${existe.nome}.`, { id: existe.id });
  }
  db.prepare(
    `UPDATE empresas SET nome=@nome, razao_social=@razao_social, cnpj=@cnpj, telefone=@telefone,
       email=@email, endereco=@endereco, cidade=@cidade, estado=@estado, cep=@cep,
       responsavel=@responsavel, observacoes=@observacoes, atualizado_em=datetime('now')
     WHERE id=@id`
  ).run({ ...dados, id: atual.id });
  registrar(req, {
    entidade: 'empresa', entidade_id: atual.id, acao: 'atualizada',
    descricao: `Empresa "${dados.nome}" atualizada`, detalhes: diferencas(atual, dados),
  });
  res.json(db.prepare('SELECT * FROM empresas WHERE id = ?').get(atual.id));
}));

/** Inativa a empresa (nenhum registro e apagado definitivamente). */
router.post('/:id/inativar', exigirAdmin, rota((req, res) => {
  const empresa = db.prepare('SELECT * FROM empresas WHERE id = ?').get(req.params.id);
  if (!empresa) throw erro.naoEncontrado('Empresa não encontrada.');
  const ativo = empresa.ativo ? 0 : 1;
  db.prepare("UPDATE empresas SET ativo = ?, atualizado_em = datetime('now') WHERE id = ?").run(ativo, empresa.id);
  registrar(req, {
    entidade: 'empresa', entidade_id: empresa.id, acao: ativo ? 'reativada' : 'inativada',
    descricao: `Empresa "${empresa.nome}" ${ativo ? 'reativada' : 'inativada'}`,
  });
  res.json({ ok: true, ativo });
}));

module.exports = router;
