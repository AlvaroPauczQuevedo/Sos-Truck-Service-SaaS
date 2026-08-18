'use strict';
/** Consultas e regras compartilhadas das fichas mecanicas. */
const { db } = require('../db');
const { erro } = require('./http');
const { FICHA_EDITAVEL_MECANICO } = require('./dominio');

const SELECT_FICHA = `
  SELECT f.*,
         c.placa, c.codigo_frota, c.marca, c.modelo, c.versao, c.chassi, c.tipo AS caminhao_tipo,
         c.ano_fabricacao, c.ano_modelo, c.cor, c.motorista_nome, c.motorista_telefone,
         c.empresa_id, e.nome AS empresa_nome,
         u.nome AS mecanico_nome, u.telefone AS mecanico_telefone,
         (SELECT COUNT(*) FROM problemas p WHERE p.ficha_id = f.id) AS total_problemas,
         (SELECT COUNT(*) FROM pecas_solicitadas ps WHERE ps.ficha_id = f.id AND ps.status <> 'cancelada') AS total_pecas,
         (SELECT COUNT(*) FROM pecas_solicitadas ps WHERE ps.ficha_id = f.id AND ps.urgencia = 'critica' AND ps.status <> 'cancelada') AS pecas_criticas,
         (SELECT COUNT(*) FROM pecas_solicitadas ps WHERE ps.ficha_id = f.id AND ps.status = 'instalada') AS pecas_instaladas,
         (SELECT COUNT(*) FROM problemas p WHERE p.ficha_id = f.id AND p.impede_uso = 1) AS problemas_impeditivos
    FROM fichas f
    JOIN caminhoes c ON c.id = f.caminhao_id
    JOIN usuarios  u ON u.id = f.mecanico_id
    LEFT JOIN empresas e ON e.id = c.empresa_id`;

function buscarFicha(id) {
  const ficha = db.prepare(`${SELECT_FICHA} WHERE f.id = ?`).get(id);
  if (!ficha) throw erro.naoEncontrado('Ficha não encontrada.');
  return ficha;
}

/** O mecanico edita apenas as proprias fichas em rascunho ou devolvidas. */
function exigirEdicaoMecanico(req, ficha) {
  if (req.usuario.perfil === 'admin') return;
  if (ficha.mecanico_id !== req.usuario.id) {
    throw erro.semPermissao('Esta ficha pertence a outro mecânico.');
  }
  if (!FICHA_EDITAVEL_MECANICO.includes(ficha.status)) {
    throw erro.semPermissao('Esta ficha já foi enviada para a administração e não pode mais ser alterada. Peça a devolução para corrigir.');
  }
}

/** Remove da resposta os dados administrativos que o mecanico nao pode ver. */
function ocultarDadosAdministrativos(ficha) {
  const copia = { ...ficha };
  delete copia.observacoes_internas;
  delete copia.total_aprovado;
  delete copia.total_cotado;
  return copia;
}

const PECA_SEM_VALORES = `
  ps.id, ps.ficha_id, ps.problema_id, ps.categoria_id, ps.subcategoria_id, ps.nome, ps.descricao,
  ps.codigo_referencia, ps.marca_preferencial, ps.quantidade, ps.unidade, ps.posicao, ps.tipo_peca,
  ps.urgencia, ps.motivo_troca, ps.observacoes_mecanico, ps.status, ps.recebida_em, ps.entregue_em,
  ps.instalada_em, ps.cancelada_em, ps.cancelada_motivo, ps.criado_em, ps.atualizado_em`;

/** Lista as pecas de uma ficha; valores so aparecem para a administracao. */
function listarPecas(ficha_id, comValores) {
  const extra = comValores
    ? `, (SELECT p.valor_total FROM propostas p WHERE p.peca_id = ps.id AND p.selecionada = 1 LIMIT 1) AS valor_aprovado,
         (SELECT fo.nome FROM propostas p JOIN fornecedores fo ON fo.id = p.fornecedor_id
            WHERE p.peca_id = ps.id AND p.selecionada = 1 LIMIT 1) AS fornecedor_escolhido,
         (SELECT COUNT(*) FROM propostas p WHERE p.peca_id = ps.id) AS total_propostas`
    : '';
  return db.prepare(
    `SELECT ${PECA_SEM_VALORES},
            cat.nome AS categoria_nome, sub.nome AS subcategoria_nome,
            pr.titulo AS problema_titulo,
            (SELECT COUNT(*) FROM fotos f WHERE f.entidade='peca' AND f.entidade_id=ps.id) AS total_fotos
            ${extra}
       FROM pecas_solicitadas ps
       LEFT JOIN categorias_pecas cat ON cat.id = ps.categoria_id
       LEFT JOIN categorias_pecas sub ON sub.id = ps.subcategoria_id
       LEFT JOIN problemas pr ON pr.id = ps.problema_id
      WHERE ps.ficha_id = ?
      ORDER BY CASE ps.urgencia WHEN 'critica' THEN 0 WHEN 'alta' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, ps.id`
  ).all(ficha_id);
}

function listarProblemas(ficha_id) {
  return db.prepare(
    `SELECT p.*, (SELECT COUNT(*) FROM fotos f WHERE f.entidade='problema' AND f.entidade_id=p.id) AS total_fotos,
            (SELECT COUNT(*) FROM pecas_solicitadas ps WHERE ps.problema_id = p.id) AS total_pecas
       FROM problemas p WHERE p.ficha_id = ?
      ORDER BY CASE p.gravidade WHEN 'critica' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END, p.id`
  ).all(ficha_id);
}

/**
 * Recalcula o status da ficha a partir da situacao das pecas.
 * Mantem a ficha coerente conforme as compras avancam.
 */
function recalcularStatusFicha(ficha_id) {
  const ficha = db.prepare('SELECT * FROM fichas WHERE id = ?').get(ficha_id);
  if (!ficha) return null;
  if (['rascunho', 'devolvida', 'cancelada', 'concluida'].includes(ficha.status)) return ficha.status;

  const pecas = db.prepare(
    `SELECT status FROM pecas_solicitadas WHERE ficha_id = ? AND status <> 'cancelada'`
  ).all(ficha_id).map((p) => p.status);

  if (!pecas.length) return ficha.status;

  const todas = (...alvos) => pecas.every((s) => alvos.includes(s));
  const alguma = (...alvos) => pecas.some((s) => alvos.includes(s));

  let novo = ficha.status;
  if (todas('instalada')) novo = 'servico_concluido';
  else if (alguma('recebida', 'entregue', 'instalada') && !alguma('aguardando_cotacao', 'em_cotacao', 'aguardando_aprovacao')) novo = 'em_execucao';
  else if (alguma('oc_emitida', 'comprada')) novo = 'em_compra';
  else if (todas('aprovada', 'oc_emitida', 'comprada', 'recebida', 'entregue', 'instalada')) novo = 'aprovada';
  else if (alguma('aguardando_aprovacao')) novo = 'aguardando_aprovacao';
  else if (alguma('em_cotacao', 'aguardando_cotacao')) novo = 'em_cotacao';

  if (novo !== ficha.status) {
    db.prepare("UPDATE fichas SET status = ?, atualizado_em = datetime('now') WHERE id = ?").run(novo, ficha_id);
  }
  return novo;
}

module.exports = {
  SELECT_FICHA, buscarFicha, exigirEdicaoMecanico, ocultarDadosAdministrativos,
  listarPecas, listarProblemas, recalcularStatusFicha,
};
