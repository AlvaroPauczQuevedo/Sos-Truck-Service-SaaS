const { chromium } = require('playwright');
const fs = require('fs');
const SAIDA = process.argv[2] || '/tmp/tiros';
const BASE = 'http://localhost:3311';
fs.mkdirSync(SAIDA, { recursive: true });

const erros = [];
let passos = 0;
const ok = (m) => { passos++; console.log('  ok  ', m); };
const falha = (m, d) => { erros.push(m); console.log('  FALHA', m, d ? `— ${String(d).slice(0,200)}` : ''); };

(async () => {
  const navegador = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const contexto = await navegador.newContext({
    viewport: { width: 390, height: 844 },       // iPhone-ish: teste mobile primeiro
    deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    locale: 'pt-BR', timezoneId: 'America/Sao_Paulo',
  });
  const pagina = await contexto.newPage();
  const console_erros = [];
  pagina.on('console', (m) => { if (m.type() === 'error') console_erros.push(m.text()); });
  pagina.on('pageerror', (e) => console_erros.push('pageerror: ' + e.message));

  const tiro = async (nome) => pagina.screenshot({ path: `${SAIDA}/${nome}.png`, fullPage: true });
  const esperar = async (sel, ms = 8000) => pagina.waitForSelector(sel, { timeout: ms });

  try {
    // ---------------------------------------------------------- Login
    console.log('\n== Login (celular) ==');
    await pagina.goto(BASE, { waitUntil: 'networkidle' });
    await esperar('.tela-acesso');
    ok('tela de login carregada');
    await tiro('01-login');

    await pagina.click('[data-demo="mecanico@sostruck.com.br"]');
    await pagina.click('#form-login [type=submit]');
    await esperar('.aplicativo .corpo .indicadores', 12000);
    ok('login do mecânico');
    await pagina.waitForTimeout(600);
    await tiro('02-painel-mecanico');

    const titulo = await pagina.textContent('h1.titulo');
    if (/bom dia|boa tarde|boa noite/i.test(titulo)) ok('saudação no painel: ' + titulo.trim());
    else falha('saudação do painel', titulo);

    // Menu inferior visível no celular
    if (await pagina.isVisible('.rodape-menu')) ok('menu inferior visível no celular');
    else falha('menu inferior');

    // ---------------------------------------------------------- Fichas
    console.log('\n== Fichas ==');
    await pagina.click('.rodape-menu a[data-rota="#/fichas"]');
    await esperar('#lista-fichas .cartao', 8000);
    ok('lista de fichas');
    await tiro('03-fichas-lista');

    await pagina.click('#lista-fichas .cartao');
    await esperar('.colunas-detalhe', 8000);
    const numeroFicha = await pagina.textContent('.numero-doc');
    ok('detalhe da ficha ' + numeroFicha.trim());
    await pagina.waitForTimeout(400);
    await tiro('04-ficha-detalhe');

    // O mecânico não pode ver valores
    const corpo = await pagina.textContent('body');
    if (!/Total aprovado|Observações internas/i.test(corpo)) ok('mecânico não vê valores nem notas internas');
    else falha('vazamento de dados administrativos para o mecânico');

    // ---------------------------------------------------------- Nova ficha + problema + peça
    console.log('\n== Nova ficha ==');
    await pagina.goto(BASE + '/#/ficha/nova', { waitUntil: 'networkidle' });
    await esperar('#form-ficha');
    await pagina.fill('#busca-caminhao', 'DEF');
    await esperar('[data-escolher]', 6000);
    await pagina.click('[data-escolher]');
    ok('caminhão selecionado pela busca rápida');
    await pagina.fill('#motivo_entrada', 'Teste automatizado de navegador');
    await pagina.fill('#diagnostico', 'Diagnóstico registrado pelo teste automatizado de interface.');
    await pagina.click('#prio-alta + label');
    await tiro('05-ficha-nova');
    await pagina.click('#form-ficha [type=submit]');
    await esperar('.colunas-detalhe', 10000);
    const url = pagina.url();
    const fichaId = url.match(/fichas\/(\d+)/)[1];
    ok('ficha criada (id ' + fichaId + ')');

    // Adicionar problema
    await pagina.click('[data-novo-problema]');
    await esperar('#form-problema');
    await pagina.fill('#p-titulo', 'Vazamento de óleo no motor');
    await pagina.selectOption('#p-sistema', 'Motor');
    await pagina.fill('#p-descricao', 'Vazamento constante pelo retentor dianteiro do virabrequim.');
    await pagina.click('#p-grav-alta + label');
    await pagina.click('.interruptor input[name=impede_uso]');
    await tiro('06-problema-modal');
    await pagina.click('[data-salvar]');
    await esperar('[data-lista-problemas] .cartao', 8000);
    ok('problema adicionado pela interface');

    // Solicitar peça
    await pagina.click('[data-nova-peca]');
    await esperar('#form-peca');
    await pagina.selectOption('#pc-categoria', { label: 'Motor' });
    await pagina.waitForTimeout(250);
    await pagina.selectOption('#pc-subcategoria', { label: 'Juntas e retentores' });
    await pagina.fill('#pc-nome', 'Retentor dianteiro do virabrequim');
    await pagina.fill('#pc-quantidade', '2');
    await pagina.fill('#pc-motivo', 'Retentor ressecado provocando vazamento de óleo.');
    await pagina.click('#pc-urg-alta + label');
    await tiro('07-peca-modal');
    await pagina.click('#form-peca ~ * [data-salvar], [data-salvar]');
    await esperar('[data-lista-pecas] .cartao', 8000);
    ok('peça solicitada pela interface');
    await pagina.waitForTimeout(400);
    await tiro('08-ficha-com-itens');

    // Enviar ficha
    await pagina.click('[data-enviar-ficha]');
    await esperar('#form-enviar');
    await tiro('09-envio-ficha');
    await pagina.click('[data-enviar]');
    await pagina.waitForTimeout(1600);
    const statusApos = await pagina.textContent('.selo-grande');
    if (/aguardando análise/i.test(statusApos)) ok('ficha enviada — status: ' + statusApos.trim());
    else falha('status após envio', statusApos);

    // ---------------------------------------------------------- Administração
    console.log('\n== Administração (tablet/desktop) ==');
    await pagina.click('[data-notificacoes]');
    await pagina.waitForTimeout(500);
    await tiro('10-notificacoes');
    await pagina.keyboard.press('Escape');

    const contexto2 = await navegador.newContext({
      viewport: { width: 1440, height: 960 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo',
    });
    const p2 = await contexto2.newPage();
    p2.on('pageerror', (e) => console_erros.push('admin pageerror: ' + e.message));
    p2.on('console', (m) => { if (m.type() === 'error') console_erros.push('admin: ' + m.text()); });
    const tiro2 = async (n) => p2.screenshot({ path: `${SAIDA}/${n}.png`, fullPage: true });

    await p2.goto(BASE, { waitUntil: 'networkidle' });
    await p2.click('[data-demo="admin@sostruck.com.br"]');
    await p2.click('#form-login [type=submit]');
    await p2.waitForSelector('.lateral', { timeout: 12000 });
    ok('login da administração (menu lateral no desktop)');
    await p2.waitForTimeout(800);
    await tiro2('11-painel-admin');

    if (await p2.isVisible('.faixa-financeira')) ok('painel administrativo mostra os números financeiros');
    else falha('faixa financeira ausente no painel admin');

    // Fila
    await p2.click('.lateral-menu a[data-rota="#/fila"]');
    await p2.waitForSelector('#conteudo .cartao, .vazio', { timeout: 8000 });
    ok('fila de fichas aguardando análise');
    await tiro2('12-fila');

    // Abre a ficha criada no teste
    await p2.goto(`${BASE}/#/fichas/${fichaId}`, { waitUntil: 'networkidle' });
    await p2.waitForSelector('[data-aceitar-ficha]', { timeout: 8000 });
    await tiro2('13-ficha-admin');
    await p2.click('[data-aceitar-ficha]');
    await p2.waitForSelector('[data-confirmar]', { timeout: 5000 });
    await p2.click('[data-confirmar]');
    await p2.waitForTimeout(1600);
    ok('ficha aceita pela administração');

    // Cotação
    await p2.waitForSelector('[data-criar-cotacao]', { timeout: 8000 });
    await p2.click('[data-criar-cotacao]');
    await p2.waitForSelector('.peca-cotacao', { timeout: 10000 });
    ok('cotação criada a partir da ficha');
    await tiro2('14-cotacao-vazia');

    // Propostas de dois fornecedores
    await p2.click('[data-nova-proposta]');
    await p2.waitForSelector('#form-proposta');
    await p2.selectOption('#pr-fornecedor', { index: 1 });
    await p2.fill('#pr-unitario', '480,00');
    await p2.fill('#pr-frete', '60');
    await p2.fill('#pr-prazo', '5');
    await p2.waitForTimeout(200);
    const previaTotal = await p2.textContent('[data-p-total]');
    if (/1\.020,00/.test(previaTotal)) ok('cálculo automático na tela: ' + previaTotal.trim());
    else falha('prévia do total da proposta', previaTotal);
    await tiro2('15-proposta-modal');
    await p2.click('[data-salvar]');
    await p2.waitForSelector('.proposta', { timeout: 8000 });
    ok('proposta 1 registrada');

    await p2.click('[data-nova-proposta]');
    await p2.waitForSelector('#form-proposta');
    await p2.selectOption('#pr-fornecedor', { index: 2 });
    await p2.fill('#pr-unitario', '395,50');
    await p2.fill('#pr-desconto', '20');
    await p2.fill('#pr-prazo', '3');
    await p2.click('[data-salvar]');
    await p2.waitForSelector('.proposta.menor', { timeout: 8000 });
    ok('proposta 2 registrada e menor valor destacado');
    await p2.waitForTimeout(400);
    await tiro2('16-comparacao-fornecedores');

    const selecionadasAntes = await p2.locator('.proposta.escolhida').count();
    if (selecionadasAntes === 0) ok('nenhuma proposta foi escolhida automaticamente');
    else falha('proposta selecionada sem ação do usuário');

    await p2.click('.proposta.menor [data-selecionar]');
    await p2.waitForSelector('.proposta.escolhida', { timeout: 8000 });
    ok('fornecedor escolhido manualmente');

    await p2.click('[data-aprovar]');
    await p2.waitForSelector('[data-confirmar]', { timeout: 5000 });
    await p2.click('[data-confirmar]');
    await p2.waitForSelector('[data-gerar-oc]', { timeout: 10000 });
    ok('cotação aprovada');
    await tiro2('17-cotacao-aprovada');

    // Ordem de compra
    await p2.click('[data-gerar-oc]');
    await p2.waitForSelector('[data-emitir]', { timeout: 8000 });
    await tiro2('18-gerar-ordem');
    await p2.click('[data-emitir]');
    await p2.waitForSelector('.tabela', { timeout: 12000 });
    const numeroOC = await p2.textContent('.numero-doc');
    ok('ordem de compra emitida: ' + numeroOC.trim());
    await p2.waitForTimeout(500);
    await tiro2('19-ordem-detalhe');

    // Recebimento
    await p2.click('[data-receber]');
    await p2.waitForSelector('[data-item]', { timeout: 6000 });
    await tiro2('20-recebimento');
    await p2.click('[data-confirmar]');
    await p2.waitForTimeout(2000);
    const statusOC = await p2.textContent('.selo-grande');
    if (/recebida/i.test(statusOC)) ok('recebimento confirmado — ' + statusOC.trim());
    else falha('status da ordem após recebimento', statusOC);

    // Demais telas administrativas
    for (const [rota, seletor, nome] of [
      ['#/cotacoes', '#lista-cotacoes', '21-cotacoes'],
      ['#/ordens', '#lista-ordens', '22-ordens'],
      ['#/recebimento', '#conteudo h2', '23-recebimento'],
      ['#/fornecedores', '#lista-fornecedores', '24-fornecedores'],
      ['#/caminhoes', '#lista-caminhoes', '25-caminhoes'],
      ['#/relatorios', '#conteudo-relatorio', '26-relatorios'],
      ['#/usuarios', '#lista-usuarios', '27-usuarios'],
      ['#/configuracoes', '#form-config', '28-configuracoes'],
    ]) {
      await p2.goto(BASE + '/' + rota, { waitUntil: 'networkidle' });
      await p2.waitForSelector(seletor, { timeout: 10000 });
      await p2.waitForTimeout(500);
      await tiro2(nome);
      ok('tela ' + rota);
    }

    // Detalhe do caminhão
    await p2.goto(BASE + '/#/caminhoes/1', { waitUntil: 'networkidle' });
    await p2.waitForSelector('.dados-grade', { timeout: 8000 });
    await p2.waitForTimeout(400);
    await tiro2('29-caminhao-detalhe');
    ok('detalhe e histórico do caminhão');

    // PDF acessível
    const respostaPdf = await p2.request.get(`${BASE}/api/ordens/1/pdf`);
    if (respostaPdf.ok() && respostaPdf.headers()['content-type'].includes('pdf')) ok('PDF da ordem servido pelo navegador');
    else falha('PDF da ordem', respostaPdf.status());

    // Mecânico bloqueado em área administrativa
    await pagina.goto(BASE + '/#/cotacoes', { waitUntil: 'networkidle' });
    await pagina.waitForTimeout(900);
    const bloqueio = await pagina.textContent('#conteudo');
    if (/exclusiva da administração/i.test(bloqueio)) ok('mecânico bloqueado na central de cotações');
    else falha('bloqueio de rota administrativa', bloqueio.slice(0, 120));
    await tiro('30-mecanico-bloqueado');

    // Recuperação de senha
    await pagina.goto(BASE + '/#/recuperar-senha', { waitUntil: 'networkidle' });
    await pagina.waitForTimeout(400);
    await tiro('31-recuperar-senha');
    ok('tela de recuperação de senha');

  } catch (e) {
    falha('exceção durante o teste', e.message);
    try { await pagina.screenshot({ path: `${SAIDA}/erro.png`, fullPage: true }); } catch (_) {}
  }

  // Duas mensagens são esperadas e não indicam defeito:
  //  - 401 em /api/auth/sessao: verificação de sessão feita antes do login;
  //  - falha ao buscar a fonte Inter: ambiente de teste sem acesso externo
  //    (a interface cai para a fonte do sistema, que já está no CSS).
  const esperado = /401 \(Unauthorized\)|ERR_CONNECTION_RESET|fonts\.googleapis|fonts\.gstatic|favicon|manifest/i;
  const reais = console_erros.filter((e) => !esperado.test(e));
  const ignorados = console_erros.filter((e) => esperado.test(e));

  console.log('\n== Erros de console ==');
  console.log(reais.length ? reais.slice(0, 12).join('\n') : '  nenhum');
  if (ignorados.length) console.log(`  (${ignorados.length} mensagem(ns) esperada(s) do ambiente de teste ignorada(s))`);

  console.log(`\n=================================\n Passos ok: ${passos}   Falhas: ${erros.length + reais.length}\n=================================`);
  await navegador.close();
  process.exit(erros.length + reais.length ? 1 : 0);
})();
