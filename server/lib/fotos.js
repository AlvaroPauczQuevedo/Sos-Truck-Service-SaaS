'use strict';
/** Helpers de fotos compartilhados entre as rotas. */
const { db } = require('../db');
const { caminhoRelativo } = require('./upload');
const { registrar } = require('./registro');

const listar = (entidade, entidade_id) =>
  db.prepare(
    `SELECT f.id, f.entidade, f.entidade_id, f.arquivo, f.nome_original, f.mime, f.tamanho,
            f.legenda, f.criado_em, u.nome AS enviado_por
       FROM fotos f LEFT JOIN usuarios u ON u.id = f.criado_por
      WHERE f.entidade = ? AND f.entidade_id = ?
      ORDER BY f.id`
  ).all(entidade, entidade_id);

/** Registra no banco os arquivos recebidos pelo multer. */
function salvar(req, entidade, entidade_id, arquivos, legenda = null) {
  const lista = arquivos || [];
  if (!lista.length) return [];
  const inserir = db.prepare(
    `INSERT INTO fotos (entidade, entidade_id, arquivo, nome_original, mime, tamanho, legenda, criado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const ids = [];
  const lote = db.transaction(() => {
    for (const arq of lista) {
      const info = inserir.run(
        entidade, entidade_id, caminhoRelativo(arq.path), arq.originalname,
        arq.mimetype, arq.size, legenda, req.usuario ? req.usuario.id : null
      );
      ids.push(info.lastInsertRowid);
    }
  });
  lote();
  registrar(req, {
    entidade, entidade_id, acao: 'fotos_adicionadas',
    descricao: `${lista.length} foto(s) anexada(s)`,
  });
  return ids;
}

/**
 * Remove o vinculo da foto mantendo o arquivo original em disco.
 * Nenhuma imagem enviada e apagada fisicamente.
 */
function desvincular(req, id) {
  const foto = db.prepare('SELECT * FROM fotos WHERE id = ?').get(id);
  if (!foto) return null;
  db.prepare('DELETE FROM fotos WHERE id = ?').run(id);
  registrar(req, {
    entidade: foto.entidade, entidade_id: foto.entidade_id, acao: 'foto_removida',
    descricao: `Foto "${foto.nome_original || foto.arquivo}" removida da visualização`,
    detalhes: { arquivo: foto.arquivo, preservado_em_disco: true },
  });
  return foto;
}

module.exports = { listar, salvar, desvincular };
