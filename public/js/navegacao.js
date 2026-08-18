/** Estrutura de navegação: menu lateral no computador e menu inferior no celular. */
import { estado, ehAdmin } from './estado.js';
import { icone } from './ui.js';
import { esc, iniciais } from './utils.js';

const MENU_ADMIN = [
  { grupo: 'Operação' },
  { rota: '#/painel',       nome: 'Painel',        icone: 'painel' },
  { rota: '#/fila',         nome: 'Fila de fichas', icone: 'relogio' },
  { rota: '#/fichas',       nome: 'Fichas',        icone: 'ficha' },
  { rota: '#/caminhoes',    nome: 'Caminhões',     icone: 'caminhao' },
  { grupo: 'Compras' },
  { rota: '#/cotacoes',     nome: 'Cotações',      icone: 'cotacao' },
  { rota: '#/ordens',       nome: 'Ordens de compra', icone: 'ordem' },
  { rota: '#/recebimento',  nome: 'Recebimento',   icone: 'caixa' },
  { rota: '#/fornecedores', nome: 'Fornecedores',  icone: 'loja' },
  { grupo: 'Gestão' },
  { rota: '#/relatorios',   nome: 'Relatórios',    icone: 'grafico' },
  { rota: '#/usuarios',     nome: 'Usuários',      icone: 'usuarios' },
  { rota: '#/configuracoes', nome: 'Configurações', icone: 'engrenagem' },
];

const MENU_MECANICO = [
  { grupo: 'Oficina' },
  { rota: '#/painel',    nome: 'Painel',     icone: 'painel' },
  { rota: '#/fichas',    nome: 'Minhas fichas', icone: 'ficha' },
  { rota: '#/caminhoes', nome: 'Caminhões',  icone: 'caminhao' },
  { rota: '#/pecas',     nome: 'Minhas peças', icone: 'peca' },
  { grupo: 'Conta' },
  { rota: '#/configuracoes', nome: 'Meus dados', icone: 'engrenagem' },
];

const ATALHOS_ADMIN = [
  { rota: '#/painel',    nome: 'Painel',   icone: 'painel' },
  { rota: '#/fila',      nome: 'Fila',     icone: 'relogio' },
  { rota: '#/cotacoes',  nome: 'Cotações', icone: 'cotacao' },
  { rota: '#/ordens',    nome: 'Compras',  icone: 'ordem' },
  { rota: '#/caminhoes', nome: 'Frota',    icone: 'caminhao' },
];

const ATALHOS_MECANICO = [
  { rota: '#/painel',    nome: 'Painel',   icone: 'painel' },
  { rota: '#/fichas',    nome: 'Fichas',   icone: 'ficha' },
  { rota: '#/ficha/nova', nome: 'Nova',    icone: 'mais', destaque: true },
  { rota: '#/pecas',     nome: 'Peças',    icone: 'peca' },
  { rota: '#/caminhoes', nome: 'Frota',    icone: 'caminhao' },
];

export const itensMenu = () => (ehAdmin() ? MENU_ADMIN : MENU_MECANICO);
export const itensAtalho = () => (ehAdmin() ? ATALHOS_ADMIN : ATALHOS_MECANICO);

export function montarEstrutura() {
  const menu = itensMenu();
  const atalhos = itensAtalho();
  return `
    <aside class="lateral">
      <div class="lateral-marca">
        <img src="/img/logo.png" alt="SOS Truck Service" class="lateral-marca-logo" width="40" height="40">
        <div>
          <div class="sos">SOS</div>
          <div class="truck">TRUCK SERVICE</div>
        </div>
      </div>
      <nav class="lateral-menu">
        ${menu.map((i) => (i.grupo
          ? `<div class="grupo">${esc(i.grupo)}</div>`
          : `<a href="${i.rota}" data-rota="${i.rota}">${icone(i.icone, 18)}<span>${esc(i.nome)}</span>
               <span class="contagem esconder" data-contagem="${i.rota}"></span></a>`)).join('')}
      </nav>
      <div class="lateral-usuario">
        <div class="inicial">${esc(iniciais(estado.usuario.nome))}</div>
        <div class="crescer" style="min-width:0">
          <div class="nome truncar">${esc(estado.usuario.nome)}</div>
          <div class="papel">${ehAdmin() ? 'Administração' : 'Mecânico'}</div>
        </div>
        <button class="topo-botao" data-sair title="Sair do sistema" aria-label="Sair">${icone('sair', 18)}</button>
      </div>
    </aside>

    <div class="principal">
      <header class="topo">
        <div class="topo-linha">
          <button class="topo-botao topo-voltar esconder" data-voltar aria-label="Voltar">${icone('voltar', 20)}</button>
          <div class="topo-marca"><img src="/img/logo.png" alt="SOS Truck Service" width="28" height="28"><span class="sos">SOS</span><span class="truck">TRUCK</span></div>
          <div class="topo-titulo" data-titulo-topo></div>
          <div class="topo-acoes">
            <button class="topo-botao" data-notificacoes aria-label="Notificações">
              ${icone('sino', 20)}
              <span class="selo esconder" data-selo-notificacoes></span>
            </button>
            <button class="topo-botao so-desktop esconder" data-perfil aria-label="Meu perfil" style="display:none">
              ${icone('usuarios', 20)}
            </button>
          </div>
        </div>
      </header>
      <main class="corpo" id="conteudo"></main>
    </div>

    <nav class="rodape-menu">
      ${atalhos.map((a) => `
        <a href="${a.rota}" data-rota="${a.rota}">
          ${icone(a.icone, 22)}<span>${esc(a.nome)}</span>
        </a>`).join('')}
    </nav>`;
}

/** Marca o item de menu correspondente à rota atual. */
export function marcarMenuAtivo(rota) {
  const base = `#/${(rota.split('/')[1] || 'painel')}`;
  document.querySelectorAll('[data-rota]').forEach((a) => {
    const alvo = a.dataset.rota;
    const ativo = alvo === base || (alvo === '#/fichas' && base === '#/ficha');
    a.classList.toggle('ativo', ativo);
  });
}
