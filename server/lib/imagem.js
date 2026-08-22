'use strict';
/**
 * Preparo das fotos para a impressao em PDF.
 *
 * O PDFKit so embute JPEG e PNG, e as fotos de celular chegam com 2 a 5 MB cada -
 * embutidas no tamanho original, uma ficha com 15 fotos viraria um PDF de 50 MB,
 * pesado demais para abrir no aparelho da oficina. Aqui a imagem e decodificada,
 * girada conforme o EXIF, reduzida e recodificada como JPEG leve.
 *
 * O arquivo original em disco NUNCA e alterado - a copia reduzida vive numa pasta
 * de cache separada, para que o segundo PDF da mesma ficha saia instantaneo.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jpeg = require('jpeg-js');
const { PNG } = require('pngjs');
const { UPLOAD_DIR, caminhoAbsoluto } = require('./upload');

const LADO_MAX = 1100;            // px no maior lado - nitido em A4 a ~150 dpi
const QUALIDADE = 70;
const BYTES_MAX = 26 * 1024 * 1024;
const MEMORIA_MAX_MB = 512;

// Fora do padrao AAAA-MM das fotos, entao a rota /arquivos nao serve esta pasta.
const CACHE_DIR = path.join(UPLOAD_DIR, '.impressao');

/** Formatos que conseguimos decodificar sem depender de biblioteca nativa. */
const SUPORTADOS = new Set(['image/jpeg', 'image/png']);

const ehSuportado = (mime, arquivo) => {
  if (mime && SUPORTADOS.has(mime)) return true;
  if (mime) return false;
  return /\.(jpe?g|png)$/i.test(String(arquivo || ''));
};

// ------------------------------------------------------------------ EXIF
/** Le a etiqueta Orientation (0x0112) do bloco TIFF de um EXIF. */
function orientacaoTiff(buffer, inicio) {
  if (inicio + 8 > buffer.length) return 1;
  const ordem = buffer.toString('ascii', inicio, inicio + 2);
  if (ordem !== 'II' && ordem !== 'MM') return 1;
  const le = ordem === 'II';
  const u16 = (p) => (le ? buffer.readUInt16LE(p) : buffer.readUInt16BE(p));
  const u32 = (p) => (le ? buffer.readUInt32LE(p) : buffer.readUInt32BE(p));

  const ifd = inicio + u32(inicio + 4);
  if (ifd + 2 > buffer.length) return 1;
  const campos = u16(ifd);
  for (let n = 0; n < campos; n++) {
    const campo = ifd + 2 + n * 12;
    if (campo + 12 > buffer.length) break;
    if (u16(campo) === 0x0112) {
      const valor = u16(campo + 8);
      return valor >= 1 && valor <= 8 ? valor : 1;
    }
  }
  return 1;
}

/**
 * Descobre como o celular segurou a camera. Sem isso as fotos em pe saem
 * deitadas no papel, porque o PDF nao entende EXIF.
 */
function lerOrientacao(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xFF || buffer[1] !== 0xD8) return 1;
  let i = 2;
  while (i + 4 <= buffer.length) {
    if (buffer[i] !== 0xFF) break;
    const marcador = buffer[i + 1];
    if (marcador === 0x01 || (marcador >= 0xD0 && marcador <= 0xD9)) { i += 2; continue; }
    if (marcador === 0xDA) break; // daqui em diante e imagem comprimida
    const tamanho = buffer.readUInt16BE(i + 2);
    if (tamanho < 2) break;
    if (marcador === 0xE1 && i + 10 <= buffer.length
        && buffer.toString('ascii', i + 4, i + 10) === 'Exif\u0000\u0000') {
      return orientacaoTiff(buffer, i + 10);
    }
    i += 2 + tamanho;
  }
  return 1;
}

// ------------------------------------------------------------------ Pixels
function decodificar(buffer, mime, arquivo) {
  const ehPng = mime === 'image/png' || (!mime && /\.png$/i.test(String(arquivo || '')));
  if (ehPng) {
    const png = PNG.sync.read(buffer);
    return { dados: png.data, largura: png.width, altura: png.height };
  }
  const img = jpeg.decode(buffer, { useTArray: true, maxMemoryUsageInMB: MEMORIA_MAX_MB });
  return { dados: img.data, largura: img.width, altura: img.height };
}

/**
 * Reducao por media de blocos (box filter): mais lenta que pegar 1 pixel a cada
 * N, porem sem o serrilhado que estraga foto de peca no papel. A transparencia
 * e composta sobre branco para PNG nao sair escuro na impressao.
 */
function reduzir(origem, largura, altura, novaLargura, novaAltura) {
  const saida = Buffer.alloc(novaLargura * novaAltura * 4);
  const escalaX = largura / novaLargura;
  const escalaY = altura / novaAltura;

  for (let y = 0; y < novaAltura; y++) {
    const y0 = Math.floor(y * escalaY);
    const y1 = Math.min(altura, Math.max(y0 + 1, Math.floor((y + 1) * escalaY)));
    for (let x = 0; x < novaLargura; x++) {
      const x0 = Math.floor(x * escalaX);
      const x1 = Math.min(largura, Math.max(x0 + 1, Math.floor((x + 1) * escalaX)));
      let r = 0, g = 0, b = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) {
        const linha = sy * largura;
        for (let sx = x0; sx < x1; sx++) {
          const i = (linha + sx) * 4;
          const alfa = origem[i + 3] / 255;
          const fundo = 255 * (1 - alfa);
          r += origem[i] * alfa + fundo;
          g += origem[i + 1] * alfa + fundo;
          b += origem[i + 2] * alfa + fundo;
          n++;
        }
      }
      const d = (y * novaLargura + x) * 4;
      saida[d] = Math.round(r / n);
      saida[d + 1] = Math.round(g / n);
      saida[d + 2] = Math.round(b / n);
      saida[d + 3] = 255;
    }
  }
  return { dados: saida, largura: novaLargura, altura: novaAltura };
}

/** Aplica o giro/espelho do EXIF. Roda depois da reducao, entao custa pouco. */
function aplicarOrientacao(origem, largura, altura, orientacao) {
  if (orientacao === 1) return { dados: origem, largura, altura };
  const trocaEixos = orientacao >= 5;
  const nl = trocaEixos ? altura : largura;
  const na = trocaEixos ? largura : altura;
  const saida = Buffer.alloc(nl * na * 4);

  for (let y = 0; y < na; y++) {
    for (let x = 0; x < nl; x++) {
      let sx = x;
      let sy = y;
      switch (orientacao) {
        case 2: sx = largura - 1 - x; break;
        case 3: sx = largura - 1 - x; sy = altura - 1 - y; break;
        case 4: sy = altura - 1 - y; break;
        case 5: sx = y; sy = x; break;
        case 6: sx = y; sy = altura - 1 - x; break;
        case 7: sx = largura - 1 - y; sy = altura - 1 - x; break;
        case 8: sx = largura - 1 - y; sy = x; break;
        default: break;
      }
      const o = (sy * largura + sx) * 4;
      const d = (y * nl + x) * 4;
      saida[d] = origem[o];
      saida[d + 1] = origem[o + 1];
      saida[d + 2] = origem[o + 2];
      saida[d + 3] = 255;
    }
  }
  return { dados: saida, largura: nl, altura: na };
}

// ------------------------------------------------------------------ Cache
function chaveCache(absoluto, tamanho, mtime) {
  return crypto.createHash('sha1')
    .update(`${absoluto}|${tamanho}|${mtime}|${LADO_MAX}|${QUALIDADE}`)
    .digest('hex');
}

// ------------------------------------------------------------------ Publico
/**
 * Devolve o JPEG reduzido pronto para o doc.image() do PDFKit, ou null quando a
 * foto nao pode ser impressa (formato sem suporte, arquivo sumido ou corrompido).
 * Nunca lanca: uma foto problematica nao pode derrubar a emissao do documento.
 */
function paraImpressao(foto) {
  try {
    const relativo = typeof foto === 'string' ? foto : foto.arquivo;
    const mime = typeof foto === 'string' ? null : foto.mime;
    if (!relativo || !ehSuportado(mime, relativo)) return null;

    const absoluto = caminhoAbsoluto(relativo);
    const info = fs.statSync(absoluto);
    if (!info.isFile() || info.size > BYTES_MAX) return null;

    const cache = path.join(CACHE_DIR, `${chaveCache(absoluto, info.size, info.mtimeMs)}.jpg`);
    try {
      return { buffer: fs.readFileSync(cache) };
    } catch { /* ainda nao preparada: segue e gera agora */ }

    const bruto = fs.readFileSync(absoluto);
    const original = decodificar(bruto, mime, relativo);
    if (!original.largura || !original.altura) return null;

    // Sempre passa por `reduzir`, mesmo quando a foto ja e pequena: com escala 1
    // ele so copia os pixels, mas e nele que a transparencia e composta sobre
    // branco - sem isso um PNG transparente sairia preto no papel.
    const escala = Math.min(1, LADO_MAX / Math.max(original.largura, original.altura));
    const menor = reduzir(
      original.dados, original.largura, original.altura,
      Math.max(1, Math.round(original.largura * escala)),
      Math.max(1, Math.round(original.altura * escala))
    );

    const girada = aplicarOrientacao(menor.dados, menor.largura, menor.altura, lerOrientacao(bruto));
    const jpg = jpeg.encode(
      { data: girada.dados, width: girada.largura, height: girada.altura },
      QUALIDADE
    );

    try {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFileSync(cache, jpg.data);
    } catch { /* cache e otimizacao: seguir sem ele nao e erro */ }

    return { buffer: jpg.data };
  } catch (err) {
    console.warn('[foto] não foi possível preparar para impressão:', err.message);
    return null;
  }
}

module.exports = { paraImpressao, LADO_MAX, CACHE_DIR };
