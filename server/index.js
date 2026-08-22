'use strict';
/**
 * SOS Truck Service — Gestão de Fichas e Peças
 * Servidor HTTP: API REST + aplicativo web responsivo.
 */
const path = require('path');
const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');

const { db: bancoDados } = require('./db'); // cria/migra o banco na inicializacao

const { AppError, erro, rota } = require('./lib/http');
const { identificar, exigirLogin } = require('./lib/auth');
const { UPLOAD_DIR } = require('./lib/upload');

const app = express();

/**
 * Só confie no X-Forwarded-For quando existir mesmo um proxy na frente.
 * Com `trust proxy` ligado sem proxy real, qualquer um manda o cabeçalho que
 * quiser e ganha um IP novo a cada requisição - o que zera o bloqueio de força
 * bruta do login. Configure TRUST_PROXY=1 (ou a faixa do seu proxy) apenas se o
 * app estiver atrás de Nginx, Apache, Cloudflare e afins.
 */
const TRUST_PROXY = (() => {
  const bruto = String(process.env.TRUST_PROXY || '').trim();
  if (!bruto || bruto === '0' || bruto === 'false') return false;
  return /^\d+$/.test(bruto) ? Number(bruto) : bruto;
})();
app.set('trust proxy', TRUST_PROXY);
app.disable('x-powered-by');

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

/**
 * Politica de conteudo: rede de protecao caso algum texto do banco escape do
 * esc() um dia. Nao ha <script> embutido no HTML nem handler inline, entao
 * 'self' basta para script. Estilo precisa de 'unsafe-inline' por causa dos
 * atributos style= dos componentes - injecao de estilo e bem menos perigosa.
 * blob: cobre a previa da foto antes do envio; as fontes vem do Google Fonts.
 */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
].join('; ');

// Cabecalhos basicos de seguranca.
app.use((_req, res, next) => {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), geolocation=()');
  next();
});

/**
 * Teto geral de requisicoes por IP. Nao substitui o limite de tentativas do
 * login (que e por e-mail); serve para ninguem martelar a API a vontade.
 * O valor e folgado de proposito: o uso normal da oficina nunca chega perto.
 */
const TETO_POR_MINUTO = Number(process.env.LIMITE_REQ_MINUTO || 300);
const acessos = new Map();
app.use('/api', (req, res, next) => {
  const agora = Date.now();
  const chave = req.ip || 'desconhecido';
  const reg = acessos.get(chave);
  if (!reg || agora - reg.desde > 60000) {
    if (acessos.size > 10000) {
      for (const [k, v] of acessos) if (agora - v.desde > 60000) acessos.delete(k);
    }
    acessos.set(chave, { total: 1, desde: agora });
    return next();
  }
  reg.total += 1;
  if (reg.total > TETO_POR_MINUTO) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ erro: 'Muitas requisições. Aguarde um minuto e tente novamente.' });
  }
  next();
});

/**
 * Reforco contra CSRF. O cookie e SameSite=Lax, o que ja barra POST vindo de
 * outro site; esta checagem fecha o resto. Requisicoes sem Origin (curl, apps,
 * os scripts de teste) passam - o ataque depende justamente de um navegador,
 * que sempre manda o cabecalho.
 */
const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);
app.use('/api', (req, _res, next) => {
  if (METODOS_SEGUROS.has(req.method)) return next();
  const origem = req.get('origin');
  if (!origem) return next();
  let host;
  try { host = new URL(origem).host; } catch { return next(erro.requisicao('Origem inválida.')); }
  if (host !== req.get('host')) {
    return next(erro.semPermissao('Requisição bloqueada por vir de outro endereço.'));
  }
  next();
});

app.use(identificar);

// ------------------------------------------------------------------ API
app.get('/api/saude', (_req, res) => res.json({ ok: true, servico: 'SOS Truck Service', hora: new Date().toISOString() }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/empresas', require('./routes/empresas'));
app.use('/api/caminhoes', require('./routes/caminhoes'));
app.use('/api/fichas', require('./routes/fichas'));
app.use('/api/pecas', require('./routes/pecas').router);
app.use('/api/fornecedores', require('./routes/fornecedores'));
app.use('/api/cotacoes', require('./routes/cotacoes').router);
app.use('/api/ordens', require('./routes/ordens'));
app.use('/api/painel', require('./routes/painel'));
app.use('/api/notificacoes', require('./routes/notificacoes'));
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/relatorios', require('./routes/relatorios'));
app.use('/api/sistema', require('./routes/sistema'));
// Rotas aninhadas por ficha (problemas, peças) e gestão de fotos.
app.use('/api', require('./routes/problemas'));
app.use('/api', require('./routes/pecas').rotasFicha);

// Entrega das fotos somente para usuarios autenticados.
app.get('/arquivos/:pasta/:arquivo', exigirLogin, rota((req, res) => {
  const relativo = `${req.params.pasta}/${req.params.arquivo}`;
  if (!/^[0-9]{4}-[0-9]{2}\/[A-Za-z0-9._-]+$/.test(relativo)) throw erro.requisicao('Caminho de arquivo inválido.');
  const absoluto = path.join(UPLOAD_DIR, relativo);
  if (!absoluto.startsWith(UPLOAD_DIR) || !fs.existsSync(absoluto)) throw erro.naoEncontrado('Foto não encontrada.');
  res.setHeader('Cache-Control', 'private, max-age=604800');
  res.sendFile(absoluto);
}));

// ------------------------------------------------------------------ Aplicativo web
const PUBLICO = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLICO, { maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0, index: false }));

app.get(/^\/(?!api\/|arquivos\/).*/, (_req, res) => res.sendFile(path.join(PUBLICO, 'index.html')));

// ------------------------------------------------------------------ Erros
app.use((_req, res) => res.status(404).json({ erro: 'Endereço não encontrado.' }));

app.use((err, req, res, _next) => {
  if (err instanceof multer.MulterError) {
    const mensagens = {
      LIMIT_FILE_SIZE: 'A foto enviada é muito grande. Reduza a qualidade e tente novamente.',
      LIMIT_FILE_COUNT: 'Você enviou fotos demais de uma vez. Envie no máximo 12 por vez.',
      LIMIT_UNEXPECTED_FILE: 'Campo de envio de foto inesperado.',
    };
    return res.status(400).json({ erro: mensagens[err.code] || 'Falha ao enviar a foto.' });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ erro: err.message, detalhes: err.detalhes });
  }
  if (err && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({ erro: 'Já existe um registro com estes dados.' });
  }
  console.error('[erro]', req.method, req.originalUrl, err);
  res.status(500).json({ erro: 'Erro interno do servidor. Tente novamente em instantes.' });
});

const PORTA = Number(process.env.PORT || 3000);
if (require.main === module) {
  bancoDados.ready.then(() => {
    app.listen(PORTA, '0.0.0.0', () => {
      console.log(`SOS Truck Service rodando em http://localhost:${PORTA}`);
    });
  });
}

module.exports = app;
