/** Ponto de entrada: sessão, roteamento por hash e montagem das telas. */
import { api, definirTratadorDeSessao } from './api.js';
import { estado, limparEstado, carregarDominios, atualizarNotificacoes, ehAdmin } from './estado.js';
import { montarEstrutura, marcarMenuAtivo } from './navegacao.js';
import { avisar, carregando, icone, abrirModal, confirmar } from './ui.js';
import { esc, quando } from './utils.js';

import { telaLogin, telaRecuperarSenha, telaRedefinirSenha } from './views/acesso.js';
import { telaPainel } from './views/painel.js';
import { telaCaminhoes, telaCaminhaoForm, telaCaminhaoDetalhe } from './views/caminhoes.js';
import { telaFichas, telaFichaNova, telaFichaDetalhe, telaFila } from './views/fichas.js';
import { telaPecas } from './views/pecas.js';
import { telaCotacoes, telaCotacaoDetalhe } from './views/cotacoes.js';
import { telaOrdens, telaOrdemDetalhe, telaRecebimento } from './views/ordens.js';
import { telaFornecedores } from './views/fornecedores.js';
import { telaRelatorios } from './views/relatorios.js';
import { telaUsuarios } from './views/usuarios.js';
import { telaConfiguracoes } from './views/configuracoes.js';

const app = document.getElementById('app');

/** Rotas: padrão → função da tela. */
const ROTAS = [
  { padrao: /^\/?$/,                    tela: telaPainel,          titulo: 'Painel' },
  { padrao: /^\/painel$/,               tela: telaPainel,          titulo: 'Painel' },
  { padrao: /^\/caminhoes$/,            tela: telaCaminhoes,       titulo: 'Caminhões' },
  { padrao: /^\/caminhoes\/novo$/,      tela: telaCaminhaoForm,    titulo: 'Cadastrar caminhão' },
  { padrao: /^\/caminhoes\/(\d+)$/,     tela: telaCaminhaoDetalhe, titulo: 'Caminhão' },
  { padrao: /^\/caminhoes\/(\d+)\/editar$/, tela: telaCaminhaoForm, titulo: 'Editar caminhão' },
  { padrao: /^\/fichas$/,               tela: telaFichas,          titulo: 'Fichas mecânicas' },
  { padrao: /^\/fila$/,                 tela: telaFila,            titulo: 'Fila de análise', somenteAdmin: true },
  { padrao: /^\/ficha\/nova$/,          tela: telaFichaNova,       titulo: 'Nova ficha' },
  { padrao: /^\/fichas\/(\d+)$/,        tela: telaFichaDetalhe,    titulo: 'Ficha mecânica' },
  { padrao: /^\/pecas$/,                tela: telaPecas,           titulo: 'Peças' },
  { padrao: /^\/cotacoes$/,             tela: telaCotacoes,        titulo: 'Central de cotações', somenteAdmin: true },
  { padrao: /^\/cotacoes\/(\d+)$/,      tela: telaCotacaoDetalhe,  titulo: 'Comparação de fornecedores', somenteAdmin: true },
  { padrao: /^\/ordens$/,               tela: telaOrdens,          titulo: 'Ordens de compra', somenteAdmin: true },
  { padrao: /^\/ordens\/(\d+)$/,        tela: telaOrdemDetalhe,    titulo: 'Ordem de compra', somenteAdmin: true },
  { padrao: /^\/recebimento$/,          tela: telaRecebimento,     titulo: 'Controle de recebimento', somenteAdmin: true },
  { padrao: /^\/fornecedores$/,         tela: telaFornecedores,    titulo: 'Fornecedores', somenteAdmin: true },
  { padrao: /^\/relatorios$/,           tela: telaRelatorios,      titulo: 'Relatórios', somenteAdmin: true },
  { padrao: /^\/usuarios$/,             tela: telaUsuarios,        titulo: 'Gestão de usuários', somenteAdmin: true },
  { padrao: /^\/configuracoes$/,        tela: telaConfiguracoes,   titulo: 'Configurações' },
];

export const irPara = (rota) => { window.location.hash = rota.startsWith('#') ? rota : `#${rota}`; };
export const voltar = () => (window.history.length > 1 ? window.history.back() : irPara('#/painel'));

function rotaAtual() {
  const bruta = window.location.hash.replace(/^#/, '') || '/painel';
  const [caminho, consulta] = bruta.split('?');
  return { caminho, consulta: new URLSearchParams(consulta || '') };
}

// ---------------------------------------------------------------- Sessão
definirTratadorDeSessao(() => {
  limparEstado();
  avisar('Sua sessão expirou. Faça login novamente.', 'alerta');
  desenharAcesso();
});

async function sair() {
  const ok = await confirmar({
    titulo: 'Sair do sistema',
    mensagem: 'Deseja encerrar a sessão neste aparelho?',
    confirmarTexto: 'Sair', tipo: 'neutro',
  });
  if (!ok) return;
  try { await api.autenticacao.sair(); } catch (_) { /* encerra mesmo offline */ }
  limparEstado();
  window.location.hash = '';
  desenharAcesso();
}

// ---------------------------------------------------------------- Telas de acesso
function desenharAcesso() {
  app.className = '';
  const { caminho, consulta } = rotaAtual();
  if (caminho === '/recuperar-senha') return telaRecuperarSenha(app, { irPara });
  if (caminho === '/redefinir-senha') return telaRedefinirSenha(app, { irPara, token: consulta.get('token') });
  return telaLogin(app, { aoEntrar: iniciarAplicativo, irPara });
}

// ---------------------------------------------------------------- Aplicativo
async function iniciarAplicativo() {
  app.className = 'aplicativo';
  app.innerHTML = montarEstrutura();

  app.querySelectorAll('[data-sair]').forEach((b) => { b.onclick = sair; });
  const botaoVoltar = app.querySelector('[data-voltar]');
  if (botaoVoltar) botaoVoltar.onclick = voltar;
  const botaoNotificacoes = app.querySelector('[data-notificacoes]');
  if (botaoNotificacoes) botaoNotificacoes.onclick = abrirNotificacoes;

  document.addEventListener('notificacoes-mudaram', atualizarSeloNotificacoes);
  await Promise.all([carregarDominios(), atualizarNotificacoes()]);
  atualizarSeloNotificacoes();

  // Verifica novas notificações periodicamente enquanto a aba está visível.
  clearInterval(window.__timerNotificacoes);
  window.__timerNotificacoes = setInterval(() => {
    if (document.visibilityState === 'visible' && estado.usuario) atualizarNotificacoes();
  }, 60000);

  await desenharRota();
}

function atualizarSeloNotificacoes() {
  const selo = app.querySelector('[data-selo-notificacoes]');
  if (!selo) return;
  const total = estado.notificacoesNaoLidas;
  selo.textContent = total > 99 ? '99+' : String(total);
  selo.classList.toggle('esconder', !total);
}

async function abrirNotificacoes() {
  const { elemento, fechar } = abrirModal({
    titulo: 'Notificações',
    conteudo: carregando(3),
    rodape: `<button class="botao botao-contorno" data-marcar-todas>Marcar todas como lidas</button>`,
  });
  const corpo = elemento.querySelector('.modal-corpo');

  const desenhar = async () => {
    try {
      const { itens } = await api.notificacoes.listar();
      corpo.style.padding = '0';
      corpo.innerHTML = itens.length ? itens.map((n) => `
        <div class="notificacao-item ${n.lida ? '' : 'nao-lida'}" data-notificacao="${n.id}" data-link="${esc(n.link || '')}">
          ${n.lida ? '<span style="width:9px;flex:none"></span>' : '<span class="ponto"></span>'}
          <div class="crescer">
            <div class="negrito" style="font-size:13.5px">${esc(n.titulo)}</div>
            ${n.mensagem ? `<div class="apoio" style="margin-top:2px">${esc(n.mensagem)}</div>` : ''}
            <div class="mini" style="margin-top:4px">${quando(n.criado_em)}</div>
          </div>
        </div>`).join('') : `<div class="vazio" style="padding:34px 20px">${icone('sino', 40)}
          <h3>Nenhuma notificação</h3><p>Você será avisado quando houver novidades nas suas fichas.</p></div>`;

      corpo.querySelectorAll('[data-notificacao]').forEach((item) => {
        item.onclick = async () => {
          try { await api.notificacoes.ler(Number(item.dataset.notificacao)); } catch (_) {}
          await atualizarNotificacoes();
          fechar();
          if (item.dataset.link) window.location.hash = item.dataset.link.replace(/^\/#/, '');
        };
      });
    } catch (_) {
      corpo.innerHTML = '<p class="apoio">Não foi possível carregar as notificações.</p>';
    }
  };
  await desenhar();

  elemento.querySelector('[data-marcar-todas]').onclick = async () => {
    await api.notificacoes.lerTodas();
    await atualizarNotificacoes();
    await desenhar();
  };
}

// ---------------------------------------------------------------- Roteador
let telaAtual = null;

async function desenharRota() {
  const { caminho, consulta } = rotaAtual();
  const conteudo = document.getElementById('conteudo');
  if (!conteudo) return;

  const rota = ROTAS.find((r) => r.padrao.test(caminho));
  const partes = rota ? (caminho.match(rota.padrao) || []).slice(1) : [];

  if (!rota) {
    conteudo.innerHTML = `
      <div class="vazio">${icone('busca', 46)}
        <h3>Página não encontrada</h3>
        <p>O endereço acessado não existe no sistema.</p>
        <a class="botao botao-principal" href="#/painel">Voltar ao painel</a>
      </div>`;
    return;
  }
  if (rota.somenteAdmin && !ehAdmin()) {
    conteudo.innerHTML = `
      <div class="vazio">${icone('alerta', 46)}
        <h3>Acesso restrito</h3>
        <p>Esta área é exclusiva da administração da SOS Truck Service.</p>
        <a class="botao botao-principal" href="#/painel">Voltar ao painel</a>
      </div>`;
    return;
  }

  marcarMenuAtivo(caminho);
  const titulo = app.querySelector('[data-titulo-topo]');
  if (titulo) titulo.textContent = rota.titulo;
  document.title = `${rota.titulo} — SOS Truck Service`;

  const ehInterna = caminho.split('/').filter(Boolean).length > 1;
  const botaoVoltar = app.querySelector('[data-voltar]');
  if (botaoVoltar) botaoVoltar.classList.toggle('esconder', !ehInterna);

  conteudo.innerHTML = carregando(3);
  conteudo.scrollTop = 0;
  window.scrollTo({ top: 0 });

  telaAtual = rota.tela;
  try {
    await rota.tela(conteudo, { partes, consulta, irPara, voltar, recarregar: desenharRota });
  } catch (erro) {
    if (erro && erro.status === 401) return;
    console.error(erro);
    conteudo.innerHTML = `
      <div class="vazio">${icone('alerta', 46)}
        <h3>Não foi possível carregar</h3>
        <p>${esc((erro && erro.message) || 'Erro inesperado.')}</p>
        <button class="botao botao-principal" data-tentar>Tentar novamente</button>
      </div>`;
    const botao = conteudo.querySelector('[data-tentar]');
    if (botao) botao.onclick = desenharRota;
  }
}

window.addEventListener('hashchange', () => {
  if (estado.usuario) desenharRota();
  else desenharAcesso();
});

// ---------------------------------------------------------------- Início
(async function iniciar() {
  try {
    const { usuario } = await api.autenticacao.sessao();
    estado.usuario = usuario;
    await iniciarAplicativo();
  } catch (_) {
    desenharAcesso();
  }
})();

export { iniciarAplicativo, telaAtual };
