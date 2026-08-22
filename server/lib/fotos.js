'use strict';
/** Helpers de fotos compartilhados entre as rotas. */
const { db } = require('../db');
const { caminhoRelativo, conferirEnviados } = require('./upload');
const { registrar } = require('./registro');
const imagem = require('./imagem');

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
  // O tipo declarado pelo navegador nao vale nada: so entra o que for imagem
  // de verdade pelos primeiros bytes. O que nao for e apagado do disco.
  const { aceitos: lista, recusados } = conferirEnviados(arquivos);
  if (recusados.length) {
    console.warn(`[foto] ${recusados.length} arquivo(s) recusado(s): conteúdo não é imagem.`);
    // Nao lanca: uma foto ruim nao pode desfazer a ficha que acabou de ser criada.
    // Quem so anexa foto confere isto e avisa o usuario.
    if (req) req.fotosRecusadas = (req.fotosRecusadas || 0) + recusados.length;
  }
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

  // Prepara desde ja a copia reduzida usada na impressao. Reduzir uma foto de
  // celular leva cerca de um segundo: pago aqui, logo apos o envio, o PDF sai
  // na hora quando alguem mandar imprimir a ficha ou a ordem de compra.
  for (const arq of lista) {
    const relativo = caminhoRelativo(arq.path);
    setImmediate(() => imagem.paraImpressao({ arquivo: relativo, mime: arq.mimetype }));
  }
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

/** Usado pelas rotas que so anexam foto: reclama se nada valido sobrou. */
function exigirAlgumaFotoValida(req) {
  if (req.fotosRecusadas) {
    const { erro } = require('./http');
    throw erro.requisicao(
      req.fotosRecusadas === 1
        ? 'O arquivo enviado não é uma imagem válida. Envie JPG, PNG, WEBP ou HEIC.'
        : `${req.fotosRecusadas} arquivos não são imagens válidas. Envie JPG, PNG, WEBP ou HEIC.`
    );
  }
}

module.exports = { listar, salvar, desvincular, exigirAlgumaFotoValida };
