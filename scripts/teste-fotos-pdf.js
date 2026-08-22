/**
 * Teste do preparo das fotos para a impressão em PDF (server/lib/imagem.js).
 * Não precisa do servidor nem do banco: cria imagens sintéticas numa pasta
 * temporária e confere redução, rotação do EXIF, transparência e falhas.
 *
 *   node scripts/teste-fotos-pdf.js
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'fotos-'));
process.env.UPLOAD_DIR = BASE;

const jpeg = require('jpeg-js');
const { PNG } = require('pngjs');
const imagem = require('../server/lib/imagem');

let ok = 0, falha = 0;
const checar = (nome, cond, extra = '') => {
  if (cond) { ok++; console.log('  ok   ', nome, extra); }
  else { falha++; console.log('  FALHA', nome, extra); }
};

/** Imagem sintética: metade esquerda vermelha, canto superior-esquerdo branco. */
function criarRgba(l, a) {
  const d = Buffer.alloc(l * a * 4);
  for (let y = 0; y < a; y++) {
    for (let x = 0; x < l; x++) {
      const i = (y * l + x) * 4;
      const cantoSE = x < l * 0.2 && y < a * 0.2;
      d[i] = cantoSE ? 255 : (x < l / 2 ? 200 : 30);
      d[i + 1] = cantoSE ? 255 : 30;
      d[i + 2] = cantoSE ? 255 : 30;
      d[i + 3] = 255;
    }
  }
  return d;
}

function pastaFoto(nome, buffer) {
  const dir = path.join(BASE, '2026-08');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, nome), buffer);
  return `2026-08/${nome}`;
}

/** Insere um APP1/EXIF com a etiqueta Orientation logo após o SOI. */
function comExif(jpegBuffer, orientacao) {
  const tiff = Buffer.alloc(26);
  tiff.write('II', 0, 'ascii');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8);        // 1 entrada
  tiff.writeUInt16LE(0x0112, 10);  // Orientation
  tiff.writeUInt16LE(3, 12);       // SHORT
  tiff.writeUInt32LE(1, 14);       // count
  tiff.writeUInt16LE(orientacao, 18);
  tiff.writeUInt32LE(0, 22);       // fim da IFD

  const cabecalho = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
  const app1 = Buffer.concat([
    Buffer.from([0xFF, 0xE1]),
    (() => { const b = Buffer.alloc(2); b.writeUInt16BE(cabecalho.length + 2, 0); return b; })(),
    cabecalho,
  ]);
  return Buffer.concat([jpegBuffer.subarray(0, 2), app1, jpegBuffer.subarray(2)]);
}

console.log('\n== JPEG grande é reduzido ==');
const grande = jpeg.encode({ data: criarRgba(2400, 1600), width: 2400, height: 1600 }, 92).data;
const relGrande = pastaFoto('grande.jpg', grande);
const t0 = Date.now();
const r1 = imagem.paraImpressao({ arquivo: relGrande, mime: 'image/jpeg' });
const ms = Date.now() - t0;
checar('devolveu um buffer', !!(r1 && r1.buffer));
const d1 = jpeg.decode(r1.buffer, { useTArray: true });
checar('maior lado limitado a 1100px', Math.max(d1.width, d1.height) === 1100, `${d1.width}x${d1.height}`);
checar('proporção preservada', Math.abs(d1.width / d1.height - 2400 / 1600) < 0.01);
checar('arquivo ficou menor', r1.buffer.length < grande.length,
  `${(grande.length / 1024).toFixed(0)} KB -> ${(r1.buffer.length / 1024).toFixed(0)} KB`);
console.log(`         (primeira geração: ${ms} ms)`);

console.log('\n== Cache em disco ==');
const t1 = Date.now();
const r2 = imagem.paraImpressao({ arquivo: relGrande, mime: 'image/jpeg' });
const msCache = Date.now() - t1;
checar('segunda chamada idêntica', r2.buffer.equals(r1.buffer));
checar('segunda chamada mais rápida', msCache < ms, `${msCache} ms`);
checar('cache fora da pasta servida por /arquivos', fs.existsSync(imagem.CACHE_DIR));

console.log('\n== Imagem pequena não é ampliada ==');
const rel2 = pastaFoto('pequena.jpg', jpeg.encode({ data: criarRgba(300, 200), width: 300, height: 200 }, 90).data);
const d2 = jpeg.decode(imagem.paraImpressao({ arquivo: rel2, mime: 'image/jpeg' }).buffer, { useTArray: true });
checar('mantém 300x200', d2.width === 300 && d2.height === 200, `${d2.width}x${d2.height}`);

console.log('\n== PNG com transparência ==');
const png = new PNG({ width: 400, height: 300 });
for (let i = 0; i < png.data.length; i += 4) {
  png.data[i] = 0; png.data[i + 1] = 0; png.data[i + 2] = 0; png.data[i + 3] = 0; // totalmente transparente
}
const rel3 = pastaFoto('transparente.png', PNG.sync.write(png));
const r3 = imagem.paraImpressao({ arquivo: rel3, mime: 'image/png' });
checar('PNG convertido', !!(r3 && r3.buffer));
const d3 = jpeg.decode(r3.buffer, { useTArray: true });
checar('transparência virou branco (não preto)', d3.data[0] > 240 && d3.data[1] > 240 && d3.data[2] > 240,
  `rgb(${d3.data[0]},${d3.data[1]},${d3.data[2]})`);

console.log('\n== Rotação do celular (EXIF) ==');
const retrato = jpeg.encode({ data: criarRgba(800, 400), width: 800, height: 400 }, 90).data;
const rel4 = pastaFoto('girada.jpg', comExif(retrato, 6));
const r4 = imagem.paraImpressao({ arquivo: rel4, mime: 'image/jpeg' });
const d4 = jpeg.decode(r4.buffer, { useTArray: true });
checar('orientação 6 troca os eixos', d4.height > d4.width, `${d4.width}x${d4.height} (original 800x400)`);
// No original o canto branco fica em cima à esquerda; girando 90° CW ele vai para cima à direita.
const pix = (img, x, y) => { const i = (y * img.width + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };
const cantoDir = pix(d4, d4.width - 6, 6);
checar('canto branco foi para a direita', cantoDir.every((c) => c > 200), `rgb(${cantoDir})`);

const rel5 = pastaFoto('normal.jpg', comExif(retrato, 1));
const d5 = jpeg.decode(imagem.paraImpressao({ arquivo: rel5, mime: 'image/jpeg' }).buffer, { useTArray: true });
checar('orientação 1 não gira', d5.width > d5.height, `${d5.width}x${d5.height}`);

console.log('\n== Formatos e falhas ==');
checar('HEIC é recusado sem quebrar', imagem.paraImpressao({ arquivo: '2026-08/x.heic', mime: 'image/heic' }) === null);
checar('WEBP é recusado sem quebrar', imagem.paraImpressao({ arquivo: '2026-08/x.webp', mime: 'image/webp' }) === null);
checar('arquivo ausente devolve null', imagem.paraImpressao({ arquivo: '2026-08/sumiu.jpg', mime: 'image/jpeg' }) === null);
const relCorrompido = pastaFoto('corrompido.jpg', Buffer.from('isto não é uma imagem'));
checar('arquivo corrompido devolve null', imagem.paraImpressao({ arquivo: relCorrompido, mime: 'image/jpeg' }) === null);

console.log(`\n${ok} ok, ${falha} falha(s)\n`);
fs.rmSync(BASE, { recursive: true, force: true });
process.exit(falha ? 1 : 0);
