'use strict';
/** Cadastro, consulta e historico de caminhoes. */
const express = require('express');
const { db } = require('../db');
const { rota, erro } = require('../lib/http');
const v = require('../lib/validacao');
const { exigirLogin, ehAdmin } = require('../lib/auth');
const { registrar, diferencas } = require('../lib/registro');
const { upload } = require('../lib/upload');
const fotos = require('../lib/fotos');
const { STATUS_CAMINHAO } = require('../lib/dominio');

const router = express.Router();
router.use(exigirLogin);

const SELECT_BASE = `
  SELECT c.*, e.nome AS empresa_nome,
         (SELECT arquivo FROM fotos f WHERE f.entidade='caminhao' AND f.entidade_id=c.id ORDER BY f.id LIMIT 1) AS foto_capa,
         (SELECT COUNT(*) FROM fichas fi WHERE fi.caminhao_id = c.id) AS total_fichas,
         (SELECT COUNT(*) FROM fichas fi WHERE fi.caminhao_id = c.id
            AND fi.status NOT IN ('concluida','cancelada')) AS fichas_abertas
    FROM caminhoes c
    LEFT JOIN empresas e ON e.id = c.empresa_id`;

// ------------------------------------------------------------------ Listagem
router.get('/', rota((req, res) => {
  const { busca, empresa_id, status, tipo, marca } = req.query;
  const pagina = Math.max(1, Number(req.query.pagina) || 1);
  const porPagina = Math.min(100, Math.max(5, Number(req.query.por_pagina) || 20));

  const filtros = [];
  const params = {};
  if (req.query.inativos !== '1') filtros.push('c.ativo = 1');
  if (busca && String(busca).trim()) {
    params.busca = `%${String(busca).trim().replace(/[^A-Za-z0-9À-ÿ ]/g, '')}%`;
    filtros.push(`(REPLACE(c.placa,'-','') LIKE @busca OR c.chassi LIKE @busca OR c.codigo_frota LIKE @busca
                   OR c.marca LIKE @busca OR c.modelo LIKE @busca OR c.motorista_nome LIKE @busca OR e.nome LIKE @busca)`);
  }
  if (empresa_id) { filtros.push('c.empresa_id = @empresa_id'); params.empresa_id = Number(empresa_id); }
  if (status) { filtros.push('c.status = @status'); params.status = status; }
  if (tipo) { filtros.push('c.tipo = @tipo'); params.tipo = tipo; }
  if (marca) { filtros.push('c.marca = @marca'); params.marca = marca; }

  const onde = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
  const total = db.prepare(
    `SELECT COUNT(*) AS t FROM caminhoes c LEFT JOIN empresas e ON e.id = c.empresa_id ${onde}`
  ).get(params).t;

  const itens = db.prepare(
    `${SELECT_BASE} ${onde} ORDER BY c.codigo_frota IS NULL, c.codigo_frota, c.placa
     LIMIT @limite OFFSET @deslocamento`
  ).all({ ...params, limite: porPagina, deslocamento: (pagina - 1) * porPagina });

  res.json({ itens, total, pagina, por_pagina: porPagina, paginas: Math.max(1, Math.ceil(total / porPagina)) });
}));

/** Consulta rapida usada pelos campos de selecao no celular. */
router.get('/busca-rapida', rota((req, res) => {
  const termo = String(req.query.termo || '').trim();
  if (termo.length < 1) return res.json({ itens: [] });
  const like = `%${termo}%`;
  const itens = db.prepare(
    `SELECT c.id, c.placa, c.codigo_frota, c.marca, c.modelo, c.km_atual, c.status, e.nome AS empresa_nome
       FROM caminhoes c LEFT JOIN empresas e ON e.id = c.empresa_id
      WHERE c.ativo = 1 AND (REPLACE(c.placa,'-','') LIKE ? OR c.codigo_frota LIKE ? OR c.chassi LIKE ?
            OR c.modelo LIKE ? OR c.marca LIKE ?)
      ORDER BY c.codigo_frota, c.placa LIMIT 15`
  ).all(like, like, like, like, like);
  res.json({ itens });
}));

/** Verifica duplicidade antes de o mecanico terminar o cadastro. */
router.get('/verificar-duplicidade', rota((req, res) => {
  const resposta = { placa: null, chassi: null };
  if (req.query.placa) {
    try {
      const p = v.placa(req.query.placa);
      resposta.placa = db.prepare(
        'SELECT id, placa, codigo_frota, marca, modelo FROM caminhoes WHERE placa = ?'
      ).get(p) || null;
    } catch (_) { /* placa incompleta durante a digitacao */ }
  }
  if (req.query.chassi) {
    try {
      const ch = v.chassi(req.query.chassi, { obrigatorio: true });
      resposta.chassi = db.prepare(
        'SELECT id, placa, codigo_frota, marca, modelo FROM caminhoes WHERE chassi = ?'
      ).get(ch) || null;
    } catch (_) { /* chassi incompleto durante a digitacao */ }
  }
  res.json(resposta);
}));

// ------------------------------------------------------------------ Detalhe
router.get('/:id', rota((req, res) => {
  const caminhao = db.prepare(`${SELECT_BASE} WHERE c.id = ?`).get(req.params.id);
  if (!caminhao) throw erro.naoEncontrado('Caminhão não encontrado.');

  caminhao.empresa = caminhao.empresa_id
    ? db.prepare('SELECT * FROM empresas WHERE id = ?').get(caminhao.empresa_id)
    : null;
  caminhao.fotos = fotos.listar('caminhao', caminhao.id);
  caminhao.fichas = db.prepare(
    `SELECT f.id, f.numero, f.status, f.prioridade, f.aberta_em, f.km, f.motivo_entrada,
            f.finalizada_em, u.nome AS mecanico_nome,
            (SELECT COUNT(*) FROM problemas p WHERE p.ficha_id = f.id) AS total_problemas,
            (SELECT COUNT(*) FROM pecas_solicitadas ps WHERE ps.ficha_id = f.id) AS total_pecas
       FROM fichas f JOIN usuarios u ON u.id = f.mecanico_id
      WHERE f.caminhao_id = ? ORDER BY f.aberta_em DESC`
  ).all(caminhao.id);

  caminhao.historico = db.prepare(
    `SELECT acao, descricao, usuario_nome, criado_em FROM historico
      WHERE entidade = 'caminhao' AND entidade_id = ? ORDER BY id DESC LIMIT 60`
  ).all(caminhao.id);

  if (ehAdmin(req)) {
    caminhao.total_investido = db.prepare(
      `SELECT IFNULL(SUM(oc.total), 0) AS t FROM ordens_compra oc
        WHERE oc.caminhao_id = ? AND oc.status <> 'cancelada'`
    ).get(caminhao.id).t;
  }
  res.json(caminhao);
}));

// ------------------------------------------------------------------ Gravacao
function dadosCaminhao(body) {
  return {
    codigo_frota: v.texto(body.codigo_frota, 'Código da frota', { max: 40 }),
    placa: v.placa(body.placa),
    chassi: v.chassi(body.chassi),
    marca: v.texto(body.marca, 'Marca', { max: 60 }),
    modelo: v.texto(body.modelo, 'Modelo', { max: 80 }),
    versao: v.texto(body.versao, 'Versão', { max: 80 }),
    ano_fabricacao: v.numero(body.ano_fabricacao, 'Ano de fabricação', { inteiro: true, min: 1950, max: new Date().getFullYear() + 1 }),
    ano_modelo: v.numero(body.ano_modelo, 'Ano do modelo', { inteiro: true, min: 1950, max: new Date().getFullYear() + 2 }),
    km_atual: v.numero(body.km_atual, 'Quilometragem', { inteiro: true, min: 0, max: 9999999 }) || 0,
    tipo: v.texto(body.tipo, 'Tipo de caminhão', { max: 60 }),
    cor: v.texto(body.cor, 'Cor', { max: 40 }),
    empresa_id: v.numero(body.empresa_id, 'Empresa', { inteiro: true, min: 1 }),
    motorista_nome: v.texto(body.motorista_nome, 'Nome do motorista', { max: 120 }),
    motorista_telefone: v.digitos(body.motorista_telefone),
    data_entrada: v.data(body.data_entrada, 'Data de entrada'),
    observacoes: v.texto(body.observacoes, 'Observações gerais', { max: 4000 }),
    status: v.opcao(body.status, 'Situação', STATUS_CAMINHAO, { padrao: 'disponivel' }),
  };
}

router.post('/', upload.array('fotos', 12), rota((req, res) => {
  const dados = dadosCaminhao(req.body);

  const porPlaca = db.prepare('SELECT id, placa, codigo_frota FROM caminhoes WHERE placa = ?').get(dados.placa);
  if (porPlaca) {
    throw erro.conflito(
      `Já existe um caminhão cadastrado com a placa ${dados.placa}${porPlaca.codigo_frota ? ` (frota ${porPlaca.codigo_frota})` : ''}.`,
      { campo: 'placa', caminhao_id: porPlaca.id }
    );
  }
  if (dados.chassi) {
    const porChassi = db.prepare('SELECT id, placa FROM caminhoes WHERE chassi = ?').get(dados.chassi);
    if (porChassi) {
      throw erro.conflito(
        `Este chassi já pertence ao caminhão de placa ${porChassi.placa}.`,
        { campo: 'chassi', caminhao_id: porChassi.id }
      );
    }
  }
  if (dados.empresa_id && !db.prepare('SELECT id FROM empresas WHERE id = ?').get(dados.empresa_id)) {
    throw erro.requisicao('Empresa selecionada não existe.', { campo: 'empresa_id' });
  }

  const info = db.prepare(
    `INSERT INTO caminhoes (codigo_frota, placa, chassi, marca, modelo, versao, ano_fabricacao, ano_modelo,
       km_atual, tipo, cor, empresa_id, motorista_nome, motorista_telefone, data_entrada, observacoes, status, criado_por)
     VALUES (@codigo_frota, @placa, @chassi, @marca, @modelo, @versao, @ano_fabricacao, @ano_modelo,
       @km_atual, @tipo, @cor, @empresa_id, @motorista_nome, @motorista_telefone, @data_entrada,
       @observacoes, @status, @criado_por)`
  ).run({ ...dados, criado_por: req.usuario.id });

  const id = info.lastInsertRowid;
  registrar(req, { entidade: 'caminhao', entidade_id: id, acao: 'criado', descricao: `Caminhão ${dados.placa} cadastrado` });
  fotos.salvar(req, 'caminhao', id, req.files);

  res.status(201).json(db.prepare(`${SELECT_BASE} WHERE c.id = ?`).get(id));
}));

router.put('/:id', upload.array('fotos', 12), rota((req, res) => {
  const atual = db.prepare('SELECT * FROM caminhoes WHERE id = ?').get(req.params.id);
  if (!atual) throw erro.naoEncontrado('Caminhão não encontrado.');
  const dados = dadosCaminhao(req.body);

  const porPlaca = db.prepare('SELECT id FROM caminhoes WHERE placa = ? AND id <> ?').get(dados.placa, atual.id);
  if (porPlaca) throw erro.conflito(`A placa ${dados.placa} já pertence a outro caminhão.`, { campo: 'placa' });
  if (dados.chassi) {
    const porChassi = db.prepare('SELECT id FROM caminhoes WHERE chassi = ? AND id <> ?').get(dados.chassi, atual.id);
    if (porChassi) throw erro.conflito('Este chassi já pertence a outro caminhão.', { campo: 'chassi' });
  }
  if (dados.km_atual && atual.km_atual && dados.km_atual < atual.km_atual && !req.body.confirmar_km) {
    throw erro.conflito(
      `A quilometragem informada (${dados.km_atual}) é menor que a registrada (${atual.km_atual}). Confirme para prosseguir.`,
      { campo: 'km_atual', requer_confirmacao: true }
    );
  }

  db.prepare(
    `UPDATE caminhoes SET codigo_frota=@codigo_frota, placa=@placa, chassi=@chassi, marca=@marca,
       modelo=@modelo, versao=@versao, ano_fabricacao=@ano_fabricacao, ano_modelo=@ano_modelo,
       km_atual=@km_atual, tipo=@tipo, cor=@cor, empresa_id=@empresa_id, motorista_nome=@motorista_nome,
       motorista_telefone=@motorista_telefone, data_entrada=@data_entrada, observacoes=@observacoes,
       status=@status, atualizado_em=datetime('now')
     WHERE id=@id`
  ).run({ ...dados, id: atual.id });

  registrar(req, {
    entidade: 'caminhao', entidade_id: atual.id, acao: 'atualizado',
    descricao: `Caminhão ${dados.placa} atualizado`, detalhes: diferencas(atual, dados),
  });
  fotos.salvar(req, 'caminhao', atual.id, req.files);

  res.json(db.prepare(`${SELECT_BASE} WHERE c.id = ?`).get(atual.id));
}));

/** Inativa o caminhao. O registro e o historico permanecem no sistema. */
router.post('/:id/inativar', rota((req, res) => {
  if (!ehAdmin(req)) throw erro.semPermissao('Somente a administração pode inativar caminhões.');
  const caminhao = db.prepare('SELECT * FROM caminhoes WHERE id = ?').get(req.params.id);
  if (!caminhao) throw erro.naoEncontrado('Caminhão não encontrado.');
  const motivo = v.texto(req.body.motivo, 'Motivo', { obrigatorio: caminhao.ativo === 1, max: 500 });

  if (caminhao.ativo) {
    const abertas = db.prepare(
      `SELECT COUNT(*) AS t FROM fichas WHERE caminhao_id = ? AND status NOT IN ('concluida','cancelada')`
    ).get(caminhao.id).t;
    if (abertas > 0) {
      throw erro.conflito(`Este caminhão possui ${abertas} ficha(s) em andamento. Finalize ou cancele antes de inativar.`);
    }
  }
  const ativo = caminhao.ativo ? 0 : 1;
  db.prepare("UPDATE caminhoes SET ativo = ?, atualizado_em = datetime('now') WHERE id = ?").run(ativo, caminhao.id);
  registrar(req, {
    entidade: 'caminhao', entidade_id: caminhao.id, acao: ativo ? 'reativado' : 'inativado',
    descricao: `Caminhão ${caminhao.placa} ${ativo ? 'reativado' : 'inativado'}${motivo ? ` — ${motivo}` : ''}`,
  });
  res.json({ ok: true, ativo });
}));

router.post('/:id/fotos', upload.array('fotos', 12), rota((req, res) => {
  const caminhao = db.prepare('SELECT id FROM caminhoes WHERE id = ?').get(req.params.id);
  if (!caminhao) throw erro.naoEncontrado('Caminhão não encontrado.');
  if (!req.files || !req.files.length) throw erro.requisicao('Selecione ao menos uma foto.');
  fotos.salvar(req, 'caminhao', caminhao.id, req.files, v.texto(req.body.legenda, 'Legenda', { max: 200 }));
  res.status(201).json({ ok: true, fotos: fotos.listar('caminhao', caminhao.id) });
}));

module.exports = router;
