'use strict';
/** Problemas encontrados durante a inspecao. */
const express = require('express');
const { db } = require('../db');
const { rota, erro } = require('../lib/http');
const v = require('../lib/validacao');
const { exigirLogin, ehAdmin } = require('../lib/auth');
const { registrar, diferencas } = require('../lib/registro');
const { upload } = require('../lib/upload');
const fotosLib = require('../lib/fotos');
const L = require('../lib/fichas');
const D = require('../lib/dominio');

// Montado em /api — a autenticação é aplicada rota a rota para não
// interceptar endereços de outros módulos sob o mesmo prefixo.
const router = express.Router();

function dadosProblema(body) {
  return {
    titulo: v.texto(body.titulo, 'Título do problema', { obrigatorio: true, min: 3, max: 160 }),
    descricao: v.texto(body.descricao, 'Descrição detalhada', { max: 4000 }),
    sistema: v.opcao(body.sistema, 'Sistema afetado', D.SISTEMAS_CAMINHAO, { obrigatorio: true }),
    gravidade: v.opcao(body.gravidade, 'Gravidade', D.GRAVIDADES, { padrao: 'media' }),
    servico_necessario: v.texto(body.servico_necessario, 'Serviço necessário', { max: 2000 }),
    impede_uso: v.booleano(body.impede_uso),
  };
}

router.post('/fichas/:fichaId/problemas', exigirLogin, upload.array('fotos', 12), rota((req, res) => {
  const ficha = L.buscarFicha(req.params.fichaId);
  L.exigirEdicaoMecanico(req, ficha);
  const dados = dadosProblema(req.body);

  const categoria = db.prepare('SELECT id FROM categorias_pecas WHERE nome = ? AND pai_id IS NULL').get(dados.sistema);
  const info = db.prepare(
    `INSERT INTO problemas (ficha_id, titulo, descricao, sistema, categoria_id, gravidade, servico_necessario, impede_uso)
     VALUES (@ficha_id, @titulo, @descricao, @sistema, @categoria_id, @gravidade, @servico_necessario, @impede_uso)`
  ).run({ ...dados, ficha_id: ficha.id, categoria_id: categoria ? categoria.id : null });

  const id = info.lastInsertRowid;
  registrar(req, {
    entidade: 'ficha', entidade_id: ficha.id, acao: 'problema_adicionado',
    descricao: `Problema "${dados.titulo}" (${D.GRAVIDADES[dados.gravidade].rotulo}) registrado`,
  });
  fotosLib.salvar(req, 'problema', id, req.files);

  // Um problema que impede o uso deixa o caminhao parado.
  if (dados.impede_uso) {
    db.prepare("UPDATE caminhoes SET status='parado', atualizado_em=datetime('now') WHERE id=?").run(ficha.caminhao_id);
    if (dados.gravidade === 'critica') {
      db.prepare("UPDATE fichas SET prioridade='critica', atualizado_em=datetime('now') WHERE id=?").run(ficha.id);
    }
  }
  const problema = db.prepare('SELECT * FROM problemas WHERE id = ?').get(id);
  problema.fotos = fotosLib.listar('problema', id);
  res.status(201).json(problema);
}));

router.put('/problemas/:id', exigirLogin, upload.array('fotos', 12), rota((req, res) => {
  const problema = db.prepare('SELECT * FROM problemas WHERE id = ?').get(req.params.id);
  if (!problema) throw erro.naoEncontrado('Problema não encontrado.');
  const ficha = L.buscarFicha(problema.ficha_id);
  L.exigirEdicaoMecanico(req, ficha);
  const dados = dadosProblema(req.body);

  db.prepare(
    `UPDATE problemas SET titulo=@titulo, descricao=@descricao, sistema=@sistema, gravidade=@gravidade,
       servico_necessario=@servico_necessario, impede_uso=@impede_uso, atualizado_em=datetime('now')
     WHERE id=@id`
  ).run({ ...dados, id: problema.id });

  registrar(req, {
    entidade: 'ficha', entidade_id: ficha.id, acao: 'problema_atualizado',
    descricao: `Problema "${dados.titulo}" atualizado`, detalhes: diferencas(problema, dados),
  });
  fotosLib.salvar(req, 'problema', problema.id, req.files);

  const atualizado = db.prepare('SELECT * FROM problemas WHERE id = ?').get(problema.id);
  atualizado.fotos = fotosLib.listar('problema', problema.id);
  res.json(atualizado);
}));

/** Marca o problema como resolvido (usado pelo mecanico durante a execucao). */
router.post('/problemas/:id/resolver', exigirLogin, rota((req, res) => {
  const problema = db.prepare('SELECT * FROM problemas WHERE id = ?').get(req.params.id);
  if (!problema) throw erro.naoEncontrado('Problema não encontrado.');
  const ficha = L.buscarFicha(problema.ficha_id);
  if (!ehAdmin(req) && ficha.mecanico_id !== req.usuario.id) {
    throw erro.semPermissao('Somente o mecânico responsável pode alterar este problema.');
  }
  const resolvido = problema.resolvido ? 0 : 1;
  db.prepare(
    `UPDATE problemas SET resolvido=?, resolvido_em=${resolvido ? "datetime('now')" : 'NULL'}, atualizado_em=datetime('now') WHERE id=?`
  ).run(resolvido, problema.id);
  registrar(req, {
    entidade: 'ficha', entidade_id: ficha.id, acao: resolvido ? 'problema_resolvido' : 'problema_reaberto',
    descricao: `Problema "${problema.titulo}" ${resolvido ? 'marcado como resolvido' : 'reaberto'}`,
  });
  res.json({ ok: true, resolvido });
}));

/** Remove o problema da ficha (apenas em rascunho/devolvida, com confirmacao). */
router.delete('/problemas/:id', exigirLogin, rota((req, res) => {
  const problema = db.prepare('SELECT * FROM problemas WHERE id = ?').get(req.params.id);
  if (!problema) throw erro.naoEncontrado('Problema não encontrado.');
  const ficha = L.buscarFicha(problema.ficha_id);
  L.exigirEdicaoMecanico(req, ficha);
  if (req.query.confirmar !== '1') throw erro.conflito('Confirme a exclusão do problema.', { requer_confirmacao: true });

  const vinculadas = db.prepare('SELECT COUNT(*) AS t FROM pecas_solicitadas WHERE problema_id = ?').get(problema.id).t;
  db.transaction(() => {
    db.prepare('UPDATE pecas_solicitadas SET problema_id = NULL WHERE problema_id = ?').run(problema.id);
    db.prepare('DELETE FROM problemas WHERE id = ?').run(problema.id);
  })();
  registrar(req, {
    entidade: 'ficha', entidade_id: ficha.id, acao: 'problema_removido',
    descricao: `Problema "${problema.titulo}" removido da ficha`,
    detalhes: { pecas_desvinculadas: vinculadas, dados_anteriores: problema },
  });
  res.json({ ok: true });
}));

router.delete('/fotos/:id', exigirLogin, rota((req, res) => {
  const foto = db.prepare('SELECT * FROM fotos WHERE id = ?').get(req.params.id);
  if (!foto) throw erro.naoEncontrado('Foto não encontrada.');
  if (req.query.confirmar !== '1') throw erro.conflito('Confirme a remoção da foto.', { requer_confirmacao: true });

  if (!ehAdmin(req)) {
    // O mecanico so remove fotos das proprias fichas ainda editaveis.
    let fichaId = null;
    if (foto.entidade === 'ficha') fichaId = foto.entidade_id;
    else if (foto.entidade === 'problema') {
      const p = db.prepare('SELECT ficha_id FROM problemas WHERE id = ?').get(foto.entidade_id);
      fichaId = p && p.ficha_id;
    } else if (foto.entidade === 'peca') {
      const p = db.prepare('SELECT ficha_id FROM pecas_solicitadas WHERE id = ?').get(foto.entidade_id);
      fichaId = p && p.ficha_id;
    }
    if (fichaId) L.exigirEdicaoMecanico(req, L.buscarFicha(fichaId));
    else if (foto.criado_por !== req.usuario.id) throw erro.semPermissao('Você não pode remover esta foto.');
  }
  fotosLib.desvincular(req, foto.id);
  res.json({ ok: true, arquivo_preservado: true });
}));

module.exports = router;
