/**
 * Defesas de acesso do sistema. Cada bloco corresponde a uma forma concreta de
 * invadir a conta de alguém — o teste existe para provar que ela está fechada:
 *
 *  1. Segredo da sessão nunca é um valor público (senão qualquer um forja um
 *     token de administrador sem saber senha nenhuma).
 *  2. A recuperação anônima nunca devolve o link (senão bastaria saber o e-mail
 *     do administrador para trocar a senha dele).
 *  3. O bloqueio de força bruta não é contornável forjando X-Forwarded-For.
 *  4. Sair do sistema e trocar a senha invalidam os tokens de verdade.
 *  5. Senhas curtas, óbvias ou repetitivas são recusadas.
 *  6. CSP, nosniff e a checagem de origem estão no lugar.
 *
 * Sobe o próprio servidor num banco temporário. Nada toca em data/.
 *
 *   node scripts/teste-seguranca.js
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const BASE_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sos-seg-'));
process.env.DB_PATH = path.join(BASE_TMP, 'teste.db');
process.env.UPLOAD_DIR = path.join(BASE_TMP, 'uploads');
delete process.env.JWT_SECRET;

const RAIZ = path.join(__dirname, '..');
const ADMIN = 'admin@sostruck.com.br';
const SENHA = 'sos12345';

let ok = 0;
let falha = 0;
const checar = (nome, cond, extra = '') => {
  if (cond) { ok++; console.log('  ok   ', nome, extra); }
  else { falha++; console.log('  FALHA', nome, extra); }
};

const json = async (resposta) => {
  try { return await resposta.json(); } catch { return {}; }
};

(async () => {
  console.log('\n== Preparando banco temporário ==');
  execFileSync(process.execPath, [path.join(RAIZ, 'server', 'seed.js')], {
    cwd: RAIZ, env: process.env, stdio: 'ignore',
  });
  console.log('  banco semeado em', process.env.DB_PATH);

  // ---------------------------------------------------------------- Segredo
  console.log('\n== Segredo da sessão ==');
  const auth = require(path.join(RAIZ, 'server', 'lib', 'auth.js'));
  const jwt = require(path.join(RAIZ, 'node_modules', 'jsonwebtoken'));
  const arquivo = path.join(path.dirname(process.env.DB_PATH), '.segredo-sessao');

  checar('gera e guarda um segredo quando JWT_SECRET falta', fs.existsSync(arquivo));
  const guardado = fs.readFileSync(arquivo, 'utf8').trim();
  checar('segredo guardado é longo', guardado.length >= 32, `${guardado.length} caracteres`);

  const tokenReal = auth.gerarToken({ id: 1, perfil: 'admin', nome: 'Teste' });
  checar('token assinado abre com o segredo guardado',
    jwt.verify(tokenReal, guardado).perfil === 'admin');

  // O ataque que a correção fecha: assinar um token de admin com um valor conhecido.
  for (const publico of [
    'sos-truck-service-dev-secret-troque-em-producao',
    'troque-este-segredo-em-producao',
  ]) {
    let aceito = false;
    try { jwt.verify(jwt.sign({ id: 1, perfil: 'admin' }, publico), guardado); aceito = true; } catch { /* rejeitado */ }
    checar(`token forjado com "${publico.slice(0, 24)}…" é rejeitado`, !aceito);
  }

  // O segredo é resolvido uma vez, quando o módulo carrega — então cada caso
  // precisa de um processo próprio.
  console.log('\n== JWT_SECRET vindo do ambiente ==');
  const assinarEm = (valor) => {
    const env = { ...process.env };
    if (valor === null) delete env.JWT_SECRET; else env.JWT_SECRET = valor;
    return execFileSync(process.execPath, ['-e',
      'process.on("warning",()=>{});'
      + 'const a=require("./server/lib/auth.js");'
      + 'process.stdout.write(a.gerarToken({id:1,perfil:"admin",nome:"T"}))',
    ], { cwd: RAIZ, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  };
  const assinadoCom = (token, segredo) => {
    try { jwt.verify(token, segredo); return true; } catch { return false; }
  };

  const forte = 'x7Qp' + 'a'.repeat(40) + 'Z9';
  checar('JWT_SECRET próprio e longo é usado', assinadoCom(assinarEm(forte), forte));

  for (const [rotulo, valor] of [
    ['valor de exemplo público', 'troque-este-segredo-em-producao'],
    ['segredo curto demais', 'curto123'],
  ]) {
    const token = assinarEm(valor);
    checar(`${rotulo} é recusado`, !assinadoCom(token, valor));
    checar(`${rotulo} cai no segredo guardado`, assinadoCom(token, guardado));
  }

  // ---------------------------------------------------------------- Servidor
  console.log('\n== Recuperação de senha (endpoint anônimo) ==');
  const app = require(path.join(RAIZ, 'server', 'index.js'));
  const { db } = require(path.join(RAIZ, 'server', 'db.js'));
  await db.ready;

  const servidor = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const B = `http://127.0.0.1:${servidor.address().port}`;

  const pedir = (email) => fetch(`${B}/api/auth/recuperar-senha`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  }).then(json);

  const antes = db.prepare('SELECT reset_token FROM usuarios WHERE email = ?').get(ADMIN);
  const resposta = await pedir(ADMIN);
  const depois = db.prepare('SELECT reset_token FROM usuarios WHERE email = ?').get(ADMIN);

  // A mensagem cita a palavra "link" (manda procurar a administração); o que não
  // pode aparecer é o endereço de redefinição ou o token em si.
  const corpo = JSON.stringify(resposta);
  checar('resposta NÃO traz a URL de redefinição', !/redefinir-senha/i.test(corpo), corpo.slice(0, 80));
  checar('resposta NÃO traz nenhum token', !/[0-9a-f]{32,}/i.test(corpo) && !/token/i.test(corpo));
  checar('resposta NÃO traz o campo link_recuperacao', resposta.link_recuperacao === undefined);
  checar('o pedido foi registrado mesmo assim', !!depois.reset_token && depois.reset_token !== antes.reset_token);

  const inexistente = await pedir('ninguem-existe@sostruck.com.br');
  checar('resposta idêntica para e-mail inexistente (não revela cadastro)',
    inexistente.mensagem === resposta.mensagem);

  // ---------------------------------------------------------------- Limite
  console.log('\n== Limite de tentativas ==');
  for (let i = 0; i < 6; i++) await pedir(ADMIN);
  const tokenAntesDoExcesso = db.prepare('SELECT reset_token FROM usuarios WHERE email = ?').get(ADMIN).reset_token;
  await pedir(ADMIN);
  const tokenDepoisDoExcesso = db.prepare('SELECT reset_token FROM usuarios WHERE email = ?').get(ADMIN).reset_token;
  checar('para de gerar token após o limite', tokenAntesDoExcesso === tokenDepoisDoExcesso);

  // ---------------------------------------------------------------- Rota da administração
  console.log('\n== Link pela administração ==');
  const semSessao = await fetch(`${B}/api/usuarios/2/link-recuperacao`, { method: 'POST' });
  checar('sem sessão devolve 401', semSessao.status === 401, `http=${semSessao.status}`);

  const login = await fetch(`${B}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'mecanico@sostruck.com.br', senha: SENHA }),
  });
  const cookieMec = (login.headers.getSetCookie() || []).join('; ');
  const comoMecanico = await fetch(`${B}/api/usuarios/1/link-recuperacao`, {
    method: 'POST', headers: { cookie: cookieMec },
  });
  checar('mecânico não gera link de ninguém (403)', comoMecanico.status === 403, `http=${comoMecanico.status}`);

  const loginAdm = await fetch(`${B}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN, senha: SENHA }),
  });
  const cookieAdm = (loginAdm.headers.getSetCookie() || []).join('; ');
  const comoAdmin = await fetch(`${B}/api/usuarios/2/link-recuperacao`, {
    method: 'POST', headers: { cookie: cookieAdm },
  });
  const dadosAdmin = await json(comoAdmin);
  checar('administração gera o link', comoAdmin.status === 200 && /token=/.test(dadosAdmin.link || ''));

  // O link entregue pela administração precisa funcionar de verdade.
  const token = String(dadosAdmin.link || '').split('token=')[1];
  const trocou = await fetch(`${B}/api/auth/redefinir-senha`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, senha: 'novasenha123', confirmacao: 'novasenha123' }),
  });
  checar('o link entregue redefine a senha', trocou.status === 200, `http=${trocou.status}`);

  const reusar = await fetch(`${B}/api/auth/redefinir-senha`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, senha: 'outrasenha123', confirmacao: 'outrasenha123' }),
  });
  checar('o mesmo link não serve duas vezes', reusar.status === 400, `http=${reusar.status}`);

  // ---------------------------------------------------------------- Força bruta
  console.log('\n== Bloqueio de força bruta ==');
  const tentarLogin = (cabecalhos = {}) => fetch(`${B}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...cabecalhos },
    body: JSON.stringify({ email: 'jonas@sostruck.com.br', senha: 'senha-errada' }),
  });

  // Senha errada devolve 401; ao estourar o limite passa a devolver 400.
  let bloqueouNoMesmoIp = false;
  for (let i = 0; i < 12; i++) {
    if ((await tentarLogin()).status === 400) bloqueouNoMesmoIp = true;
  }
  checar('mesmo IP é bloqueado após o limite', bloqueouNoMesmoIp);

  // O ponto central: o atacante NÃO pode escolher a própria chave do limite.
  let passaramComCabecalhoForjado = 0;
  for (let i = 0; i < 25; i++) {
    const r = await tentarLogin({ 'X-Forwarded-For': `10.0.${i}.${i + 1}` });
    if (r.status !== 400) passaramComCabecalhoForjado++;
  }
  checar('X-Forwarded-For forjado NÃO contorna o bloqueio',
    passaramComCabecalhoForjado === 0, `${passaramComCabecalhoForjado} de 25 passaram`);

  // ---------------------------------------------------------------- Sessão
  console.log('\n== Encerramento de sessão ==');
  const entrar = async (email, senha) => {
    const r = await fetch(`${B}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha }),
    });
    return { token: (await json(r)).token, cookie: (r.headers.getSetCookie() || []).join('; ') };
  };
  const sessaoVale = async (token) => (await fetch(`${B}/api/auth/sessao`, {
    headers: { Authorization: `Bearer ${token}` },
  })).status === 200;

  const s1 = await entrar(ADMIN, SENHA);
  checar('token novo funciona', await sessaoVale(s1.token));
  await fetch(`${B}/api/auth/logout`, { method: 'POST', headers: { cookie: s1.cookie } });
  checar('token para de valer após sair do sistema', !(await sessaoVale(s1.token)));

  // Trocar a senha tem de derrubar os OUTROS aparelhos.
  const celular = await entrar(ADMIN, SENHA);
  const desktop = await entrar(ADMIN, SENHA);
  checar('duas sessões simultâneas funcionam',
    (await sessaoVale(celular.token)) && (await sessaoVale(desktop.token)));

  const NOVA = 'chave-da-oficina-2026';
  const trocaSenha = await fetch(`${B}/api/auth/trocar-senha`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: desktop.cookie },
    body: JSON.stringify({ senha_atual: SENHA, senha_nova: NOVA, confirmacao: NOVA }),
  });
  checar('troca de senha aceita', trocaSenha.status === 200, `http=${trocaSenha.status}`);
  checar('trocar a senha derruba o outro aparelho', !(await sessaoVale(celular.token)));

  // ---------------------------------------------------------------- Senha
  console.log('\n== Política de senha ==');
  const cookieAdm2 = (await entrar(ADMIN, NOVA)).cookie;
  const criar = (senha) => fetch(`${B}/api/usuarios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: cookieAdm2 },
    body: JSON.stringify({ nome: 'Fulano de Teste', email: `t${Date.now()}${Math.random()}@sostruck.com.br`, perfil: 'mecanico', senha }),
  });
  checar('senha curta recusada', (await criar('curta1')).status === 400);
  checar('senha óbvia recusada', (await criar('senha123')).status === 400);
  checar('senha repetitiva recusada', (await criar('aaaaaaaaaa')).status === 400);
  checar('senha razoável aceita', (await criar('portao-azul-99')).status === 201);

  // ---------------------------------------------------------------- Cabeçalhos
  console.log('\n== Cabeçalhos e limites ==');
  const cab = await fetch(`${B}/api/saude`);
  const csp = cab.headers.get('content-security-policy') || '';
  checar('CSP presente', csp.includes("script-src 'self'"), csp.slice(0, 60) + '…');
  checar('CSP bloqueia object/base', csp.includes("object-src 'none'") && csp.includes("base-uri 'self'"));
  checar('nosniff presente', cab.headers.get('x-content-type-options') === 'nosniff');

  const cruzado = await fetch(`${B}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://site-malicioso.example' },
    body: JSON.stringify({ email: ADMIN, senha: NOVA }),
  });
  checar('POST de outra origem é recusado', cruzado.status === 403, `http=${cruzado.status}`);

  servidor.close();
  console.log(`\n${ok} ok, ${falha} falha(s)\n`);
  fs.rmSync(BASE_TMP, { recursive: true, force: true });
  process.exit(falha ? 1 : 0);
})();
