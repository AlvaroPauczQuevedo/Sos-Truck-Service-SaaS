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

/** Caminho relativo gravado no banco (independente da pasta base). */
const caminhoRelativo = (arquivoAbsoluto) =>
  path.relative(UPLOAD_DIR, arquivoAbsoluto).split(path.sep).join('/');

const caminhoAbsoluto = (relativo) => path.join(UPLOAD_DIR, relativo);

module.exports = { upload, UPLOAD_DIR, LIMITE, caminhoRelativo, caminhoAbsoluto };
