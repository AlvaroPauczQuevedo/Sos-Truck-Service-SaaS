'use strict';
/** Armazenamento de fotos - os arquivos originais sao preservados sem reprocessamento. */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { erro } = require('./http');

const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(__dirname, '..', '..', 'data', 'uploads');

const LIMITE = Number(process.env.MAX_UPLOAD_BYTES || 15 * 1024 * 1024);

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const PERMITIDOS = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif']);
const EXTENSOES = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
  'image/heic': '.heic', 'image/heif': '.heif', 'image/gif': '.gif',
};

const armazenamento = multer.diskStorage({
  destination: (_req, _file, cb) => {
    // Uma pasta por mes mantem o diretorio saudavel conforme o volume cresce.
    const agora = new Date();
    const pasta = path.join(UPLOAD_DIR, `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`);
    fs.mkdirSync(pasta, { recursive: true });
    cb(null, pasta);
  },
  filename: (_req, file, cb) => {
    const ext = EXTENSOES[file.mimetype] || path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage: armazenamento,
  limits: { fileSize: LIMITE, files: 12 },
  fileFilter: (_req, file, cb) => {
    if (!PERMITIDOS.has(file.mimetype)) {
      return cb(erro.requisicao('Formato de imagem não suportado. Envie JPG, PNG, WEBP ou HEIC.'));
    }
    cb(null, true);
  },
});

/**
 * Assinaturas reais dos formatos aceitos. O `mimetype` do multer vem do que o
 * navegador DIZ que esta enviando - o fileFilter acima confia nisso. Aqui os
 * primeiros bytes do arquivo sao conferidos de verdade, depois da gravacao.
 */
const ASSINATURAS = [
  { mime: 'image/jpeg', teste: (b) => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF },
  { mime: 'image/png', teste: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) },
  { mime: 'image/gif', teste: (b) => b.subarray(0, 6).toString('ascii') === 'GIF87a' || b.subarray(0, 6).toString('ascii') === 'GIF89a' },
  { mime: 'image/webp', teste: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
  // HEIC/HEIF: caixa ftyp comecando no byte 4.
  { mime: 'image/heic', teste: (b) => b.subarray(4, 8).toString('ascii') === 'ftyp' },
  { mime: 'image/heif', teste: (b) => b.subarray(4, 8).toString('ascii') === 'ftyp' },
];

/** Devolve o formato reconhecido pelo conteudo, ou null se nao for imagem. */
function formatoReal(caminho) {
  let cabecalho;
  try {
    const fd = fs.openSync(caminho, 'r');
    cabecalho = Buffer.alloc(16);
    try { fs.readSync(fd, cabecalho, 0, 16, 0); } finally { fs.closeSync(fd); }
  } catch { return null; }
  const achado = ASSINATURAS.find((a) => { try { return a.teste(cabecalho); } catch { return false; } });
  return achado ? achado.mime : null;
}

/**
 * Confere os arquivos recebidos e descarta os que nao sao imagem de verdade.
 * Devolve { aceitos, recusados } - quem chama decide se avisa o usuario.
 */
function conferirEnviados(arquivos) {
  const aceitos = [];
  const recusados = [];
  for (const arq of arquivos || []) {
    const real = formatoReal(arq.path);
    if (real) {
      arq.mimetype = real; // vale o conteudo, nao o que o cliente declarou
      aceitos.push(arq);
    } else {
      recusados.push(arq);
      try { fs.unlinkSync(arq.path); } catch { /* ja sumiu */ }
    }
  }
  return { aceitos, recusados };
}

/** Caminho relativo gravado no banco (independente da pasta base). */
const caminhoRelativo = (arquivoAbsoluto) =>
  path.relative(UPLOAD_DIR, arquivoAbsoluto).split(path.sep).join('/');

const caminhoAbsoluto = (relativo) => path.join(UPLOAD_DIR, relativo);

module.exports = { upload, UPLOAD_DIR, LIMITE, caminhoRelativo, caminhoAbsoluto, conferirEnviados, formatoReal };
