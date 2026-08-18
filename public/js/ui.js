/** Componentes visuais reutilizáveis: ícones, selos, modais, avisos e fotos. */
import { esc, dataHora, quando } from './utils.js';

// ---------------------------------------------------------------- Ícones
const CAMINHOS = {
  painel: '<path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>',
  caminhao: '<path d="M3 17V7a1 1 0 0 1 1-1h11v11H3zm12-8h3.6a1 1 0 0 1 .8.4L22 13v4h-7V9z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><circle cx="7.5" cy="18" r="2" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="17.5" cy="18" r="2" fill="none" stroke="currentColor" stroke-width="1.9"/>',
  ficha: '<path d="M8 3h8a2 2 0 0 1 2 2v15a1 1 0 0 1-1.5.87L12 18.5l-4.5 2.37A1 1 0 0 1 6 20V5a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M9 8h6M9 11.5h4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
  chave: '<path d="M14.7 6.3a4.5 4.5 0 1 0-4.1 7.6L4 20.5V22h1.5l6.6-6.6a4.5 4.5 0 0 0 7.6-4.1" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round"/>',
  peca: '<path d="M12 2l2 3h4l1 4-2.5 3 2.5 3-1 4h-4l-2 3-2-3H6l-1-4 2.5-3L5 9l1-4h4l2-3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.4" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  cotacao: '<path d="M4 4h16v16H4z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M8 9h8M8 13h8M8 17h5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
  ordem: '<path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M14 2v6h6M9 14l2 2 4-4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  loja: '<path d="M4 9V6l1.5-3h13L20 6v3M4 9h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M9 21v-6h6v6" fill="none" stroke="currentColor" stroke-width="1.9"/>',
  caixa: '<path d="M3 8l9-5 9 5v8l-9 5-9-5V8z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M3 8l9 5 9-5M12 13v8" fill="none" stroke="currentColor" stroke-width="1.9"/>',
  grafico: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  usuarios: '<circle cx="9" cy="8" r="3.4" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M17 5.2a3.4 3.4 0 0 1 0 6.6M18 20a6 6 0 0 0-2.2-4.6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
  engrenagem: '<circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.5 14H3a2 2 0 1 1 0-4h.2A1.6 1.6 0 0 0 4.3 7.2l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  sino: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  busca: '<circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  filtro: '<path d="M3 5h18l-7 8v6l-4 2v-8L3 5z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>',
  mais: '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/>',
  fechar: '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  voltar: '<path d="M15 19l-7-7 7-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  avancar: '<path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  camera: '<path d="M3 8a2 2 0 0 1 2-2h2.2l1.3-2h7l1.3 2H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.6" fill="none" stroke="currentColor" stroke-width="1.9"/>',
  galeria: '<rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="8.5" cy="9.5" r="1.7" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M21 16l-5-5-9 9" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>',
  alerta: '<path d="M12 3l9.5 17H2.5L12 3z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M12 9.5v4.5M12 17.2v.1" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>',
  certo: '<path d="M4 12.5l5.2 5L20 6.5" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>',
  info: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M12 11v5M12 7.8v.1" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>',
  relogio: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M12 7v5.2l3.3 2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
  lapis: '<path d="M4 20h4L20 8a2.8 2.8 0 0 0-4-4L4 16v4z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>',
  lixeira: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  imprimir: '<path d="M7 9V3h10v6M7 18H5a2 2 0 0 1-2-2v-5h18v5a2 2 0 0 1-2 2h-2M7 15h10v6H7v-6z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>',
  baixar: '<path d="M12 3v12M7.5 10.5L12 15l4.5-4.5M4 20h16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  compartilhar: '<circle cx="18" cy="5" r="2.6" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="6" cy="12" r="2.6" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="18" cy="19" r="2.6" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M8.4 10.8l7.2-4.2M8.4 13.2l7.2 4.2" stroke="currentColor" stroke-width="1.9"/>',
  enviar: '<path d="M4 12l16-8-6 16-2.5-6L4 12z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>',
  sair: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h11" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  conversa: '<path d="M20 15a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>',
  voltarSeta: '<path d="M9 14L4 9l5-5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 9h11a5 5 0 0 1 0 10h-3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
  bloco: '<rect x="4" y="3" width="16" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
  dinheiro: '<rect x="2.5" y="6" width="19" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" stroke-width="1.9"/>',
  pausa: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M8 12h8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
};

export const icone = (nome, tamanho = 20) =>
  `<svg viewBox="0 0 24 24" width="${tamanho}" height="${tamanho}" fill="none" aria-hidden="true">${CAMINHOS[nome] || CAMINHOS.info}</svg>`;

// ---------------------------------------------------------------- Selos
export function selo(rotulo, cor = 'cinza', extra = '') {
  return `<span class="selo selo-${cor} ${extra}">${esc(rotulo)}</span>`;
}

export function seloDominio(mapa, chave, extra = '') {
  const item = (mapa || {})[chave];
  return selo(item ? item.rotulo : (chave || '—'), item ? item.cor : 'cinza', extra);
}

// ---------------------------------------------------------------- Avisos
const MAX_AVISOS = 3;

export function avisar(mensagem, tipo = 'info', duracao = 4200) {
  const caixa = document.getElementById('avisos');
  // Mantém a tela limpa: avisos antigos saem quando novos chegam.
  while (caixa.children.length >= MAX_AVISOS) caixa.firstElementChild.remove();
  const el = document.createElement('div');
  el.className = `aviso ${tipo}`;
  const nome = tipo === 'sucesso' ? 'certo' : tipo === 'erro' ? 'alerta' : tipo === 'alerta' ? 'alerta' : 'info';
  el.innerHTML = `${icone(nome, 19)}<div class="crescer">${esc(mensagem)}</div>
    <button class="fechar-aviso" aria-label="Fechar">${icone('fechar', 15)}</button>`;
  el.querySelector('.fechar-aviso').onclick = () => el.remove();
  caixa.appendChild(el);
  if (duracao) setTimeout(() => el.remove(), duracao);
  return el;
}

/** Mostra o erro da API já formatado, incluindo a lista de pendências. */
export function avisarErro(erro) {
  const pendencias = erro && erro.pendencias;
  if (pendencias && pendencias.length) {
    const caixa = document.getElementById('avisos');
    const el = document.createElement('div');
    el.className = 'aviso erro';
    el.innerHTML = `${icone('alerta', 19)}<div class="crescer"><b>${esc(erro.message)}</b>
      <ul style="margin:6px 0 0 16px;font-size:13px">${pendencias.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>
      <button class="fechar-aviso" aria-label="Fechar">${icone('fechar', 15)}</button>`;
    el.querySelector('.fechar-aviso').onclick = () => el.remove();
    caixa.appendChild(el);
    setTimeout(() => el.remove(), 9000);
    return;
  }
  avisar((erro && erro.message) || 'Não foi possível concluir a operação.', 'erro', 5200);
}

// ---------------------------------------------------------------- Modais
let pilhaModais = [];

export function abrirModal({ titulo, conteudo, rodape, aoAbrir, largura, aoFechar }) {
  const fundo = document.createElement('div');
  fundo.className = 'fundo-modal';
  fundo.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(titulo || 'Janela')}" ${largura ? `style="max-width:${largura}"` : ''}>
      <div class="puxador"></div>
      <div class="modal-topo">
        <h2>${esc(titulo || '')}</h2>
        <button class="topo-botao" data-fechar aria-label="Fechar" style="color:var(--cinza-texto)">${icone('fechar', 20)}</button>
      </div>
      <div class="modal-corpo">${conteudo || ''}</div>
      ${rodape ? `<div class="modal-rodape">${rodape}</div>` : ''}
    </div>`;

  const fechar = (resultado) => {
    fundo.remove();
    pilhaModais = pilhaModais.filter((m) => m !== fundo);
    if (!pilhaModais.length) document.body.style.overflow = '';
    document.removeEventListener('keydown', porTecla);
    if (aoFechar) aoFechar(resultado);
  };
  const porTecla = (e) => { if (e.key === 'Escape' && pilhaModais[pilhaModais.length - 1] === fundo) fechar(); };

  fundo.querySelectorAll('[data-fechar]').forEach((b) => { b.onclick = () => fechar(); });
  fundo.addEventListener('click', (e) => { if (e.target === fundo) fechar(); });
  document.addEventListener('keydown', porTecla);

  document.getElementById('modais').appendChild(fundo);
  document.body.style.overflow = 'hidden';
  pilhaModais.push(fundo);

  const modal = fundo.querySelector('.modal');
  if (aoAbrir) aoAbrir(modal, fechar);
  const primeiro = modal.querySelector('input:not([type=hidden]), select, textarea');
  if (primeiro && window.matchMedia('(min-width: 1024px)').matches) setTimeout(() => primeiro.focus(), 120);
  return { elemento: modal, fechar };
}

/** Confirmação obrigatória antes de cancelar ou excluir qualquer registro. */
export function confirmar({ titulo, mensagem, confirmarTexto = 'Confirmar', tipo = 'perigo', pedirMotivo = false, rotuloMotivo = 'Motivo' }) {
  return new Promise((resolve) => {
    let resolvido = false;
    const { elemento, fechar } = abrirModal({
      titulo: titulo || 'Confirmar ação',
      conteudo: `
        <p class="texto-bloco">${esc(mensagem)}</p>
        ${pedirMotivo ? `
          <div class="campo mt14">
            <label for="motivo-confirmacao">${esc(rotuloMotivo)} <span class="obrigatorio">*</span></label>
            <textarea id="motivo-confirmacao" class="area-texto" rows="3"
              placeholder="Descreva o motivo — ele fica registrado no histórico."></textarea>
            <span class="erro-campo esconder" data-erro-motivo></span>
          </div>` : ''}`,
      rodape: `
        <button class="botao botao-contorno" data-cancelar>Voltar</button>
        <button class="botao ${tipo === 'perigo' ? 'botao-principal' : 'botao-escuro'}" data-confirmar>${esc(confirmarTexto)}</button>`,
      aoFechar: () => { if (!resolvido) resolve(null); },
    });

    elemento.querySelector('[data-cancelar]').onclick = () => fechar();
    elemento.querySelector('[data-confirmar]').onclick = () => {
      let motivo = null;
      if (pedirMotivo) {
        const campo = elemento.querySelector('#motivo-confirmacao');
        motivo = campo.value.trim();
        if (motivo.length < 5) {
          const erro = elemento.querySelector('[data-erro-motivo]');
          erro.textContent = 'Descreva o motivo com pelo menos 5 caracteres.';
          erro.classList.remove('esconder');
          campo.setAttribute('aria-invalid', 'true');
          campo.focus();
          return;
        }
      }
      resolvido = true;
      fechar();
      resolve({ confirmado: true, motivo });
    };
  });
}

// ---------------------------------------------------------------- Estados
export const carregando = (linhas = 3) =>
  `<div class="carregando">${Array.from({ length: linhas }, () => '<div class="esqueleto"></div>').join('')}</div>`;

export const vazio = ({ icone: nome = 'bloco', titulo, texto, acao }) => `
  <div class="vazio">
    ${icone(nome, 46)}
    <h3>${esc(titulo)}</h3>
    ${texto ? `<p>${esc(texto)}</p>` : ''}
    ${acao || ''}
  </div>`;

// ---------------------------------------------------------------- Fotos
export function visualizarFoto(url, legenda) {
  const visor = document.createElement('div');
  visor.className = 'visor-foto';
  visor.innerHTML = `
    <button class="fechar" aria-label="Fechar">${icone('fechar', 22)}</button>
    <img src="${esc(url)}" alt="${esc(legenda || 'Foto do registro')}">
    ${legenda ? `<div class="legenda">${esc(legenda)}</div>` : ''}`;
  const fechar = () => visor.remove();
  visor.querySelector('.fechar').onclick = fechar;
  visor.onclick = (e) => { if (e.target === visor) fechar(); };
  document.addEventListener('keydown', function esc_(e) {
    if (e.key === 'Escape') { fechar(); document.removeEventListener('keydown', esc_); }
  });
  document.getElementById('modais').appendChild(visor);
}

/** Galeria das fotos já gravadas, com opção de remover. */
export function galeria(fotos, { removivel = false, aoRemover = null } = {}) {
  if (!fotos || !fotos.length) return '';
  return `<div class="galeria">${fotos.map((f) => `
    <div class="galeria-item">
      <img src="/arquivos/${esc(f.arquivo)}" alt="${esc(f.legenda || f.nome_original || 'Foto')}"
           loading="lazy" data-ver="${esc(f.arquivo)}" data-legenda="${esc(f.legenda || dataHora(f.criado_em))}">
      ${removivel ? `<button class="remover" data-remover-foto="${f.id}" aria-label="Remover foto">${icone('fechar', 14)}</button>` : ''}
    </div>`).join('')}</div>`;
}

/** Liga os cliques da galeria (ampliar e remover). */
export function ativarGaleria(raiz, aoRemover) {
  raiz.querySelectorAll('[data-ver]').forEach((img) => {
    img.onclick = () => visualizarFoto(`/arquivos/${img.dataset.ver}`, img.dataset.legenda);
  });
  if (aoRemover) {
    raiz.querySelectorAll('[data-remover-foto]').forEach((b) => {
      b.onclick = async (e) => {
        e.stopPropagation();
        const ok = await confirmar({
          titulo: 'Remover foto',
          mensagem: 'A foto sai da ficha, mas o arquivo original continua guardado no sistema. Deseja continuar?',
          confirmarTexto: 'Remover',
        });
        if (ok) aoRemover(Number(b.dataset.removerFoto));
      };
    });
  }
}

/**
 * Campo de envio de fotos com câmera e galeria — as imagens ficam em memória
 * até o envio do formulário, e o arquivo original é preservado no servidor.
 */
export function campoFotos(id = 'fotos', rotulo = 'Fotos') {
  return `
    <div class="campo">
      <label>${esc(rotulo)}</label>
      <div class="envio-fotos" data-envio-fotos="${id}">
        <div class="botoes-camera">
          <button type="button" class="botao-camera" data-abrir-camera>
            ${icone('camera', 24)} Tirar foto
          </button>
          <button type="button" class="botao-camera" data-abrir-galeria>
            ${icone('galeria', 24)} Da galeria
          </button>
        </div>
        <input type="file" accept="image/*" capture="environment" multiple hidden data-entrada-camera>
        <input type="file" accept="image/*" multiple hidden data-entrada-galeria>
        <div class="galeria" data-previa></div>
      </div>
    </div>`;
}

/** Controla um campo de fotos e devolve os arquivos escolhidos. */
export function ativarCampoFotos(raiz, id = 'fotos') {
  const bloco = raiz.querySelector(`[data-envio-fotos="${id}"]`);
  if (!bloco) return { arquivos: () => [], limpar: () => {} };

  const camera = bloco.querySelector('[data-entrada-camera]');
  const galeriaEntrada = bloco.querySelector('[data-entrada-galeria]');
  const previa = bloco.querySelector('[data-previa]');
  let escolhidos = [];

  const desenhar = () => {
    previa.innerHTML = escolhidos.map((arq, i) => `
      <div class="galeria-item">
        <img src="${URL.createObjectURL(arq)}" alt="${esc(arq.name)}">
        <button type="button" class="remover" data-tirar="${i}" aria-label="Remover">${icone('fechar', 14)}</button>
      </div>`).join('');
    previa.querySelectorAll('[data-tirar]').forEach((b) => {
      b.onclick = () => { escolhidos.splice(Number(b.dataset.tirar), 1); desenhar(); };
    });
  };

  const receber = (entrada) => {
    const novos = Array.from(entrada.files || []);
    const grandes = novos.filter((a) => a.size > 15 * 1024 * 1024);
    if (grandes.length) avisar('Algumas fotos passam de 15 MB e foram ignoradas.', 'alerta');
    escolhidos = escolhidos.concat(novos.filter((a) => a.size <= 15 * 1024 * 1024)).slice(0, 12);
    entrada.value = '';
    desenhar();
  };

  bloco.querySelector('[data-abrir-camera]').onclick = () => camera.click();
  bloco.querySelector('[data-abrir-galeria]').onclick = () => galeriaEntrada.click();
  camera.onchange = () => receber(camera);
  galeriaEntrada.onchange = () => receber(galeriaEntrada);

  return { arquivos: () => escolhidos, limpar: () => { escolhidos = []; desenhar(); } };
}

// ---------------------------------------------------------------- Formulários
/** Monta um FormData a partir dos campos [name] do formulário. */
export function coletar(formulario, fotos = null, campoFoto = 'fotos') {
  const dados = new FormData();
  formulario.querySelectorAll('[name]').forEach((campo) => {
    if (campo.type === 'checkbox') dados.set(campo.name, campo.checked ? '1' : '0');
    else if (campo.type === 'radio') { if (campo.checked) dados.set(campo.name, campo.value); }
    else dados.set(campo.name, campo.value ?? '');
  });
  if (fotos) for (const arq of fotos.arquivos()) dados.append(campoFoto, arq);
  return dados;
}

/** Mesma coleta, mas devolvendo um objeto simples para envio em JSON. */
export function coletarObjeto(formulario) {
  const dados = {};
  formulario.querySelectorAll('[name]').forEach((campo) => {
    if (campo.type === 'checkbox') dados[campo.name] = campo.checked;
    else if (campo.type === 'radio') { if (campo.checked) dados[campo.name] = campo.value; }
    else dados[campo.name] = campo.value;
  });
  return dados;
}

/** Destaca o campo indicado pelo servidor. */
export function marcarErro(formulario, campo, mensagem) {
  if (!campo) return;
  const el = formulario.querySelector(`[name="${campo}"]`);
  if (!el) return;
  el.setAttribute('aria-invalid', 'true');
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.focus({ preventScroll: true });
  if (mensagem) {
    const pai = el.closest('.campo');
    if (pai && !pai.querySelector('.erro-campo')) {
      const span = document.createElement('span');
      span.className = 'erro-campo';
      span.textContent = mensagem;
      pai.appendChild(span);
    }
  }
  el.addEventListener('input', () => {
    el.removeAttribute('aria-invalid');
    const pai = el.closest('.campo');
    if (pai) pai.querySelectorAll('.erro-campo').forEach((s) => s.remove());
  }, { once: true });
}

/** Bloqueia o botão enquanto a ação é processada. */
export function ocupado(botao, ocupadoAgora, textoOcupado = 'Aguarde…') {
  if (!botao) return;
  if (ocupadoAgora) {
    botao.dataset.textoOriginal = botao.innerHTML;
    botao.disabled = true;
    botao.textContent = textoOcupado;
  } else if (botao.dataset.textoOriginal) {
    botao.innerHTML = botao.dataset.textoOriginal;
    botao.disabled = false;
  }
}

// ---------------------------------------------------------------- Diversos
export const linhaInfo = (rotulo, valor) =>
  `<div class="linha-info"><span class="rot">${esc(rotulo)}</span><span class="val">${valor ?? '—'}</span></div>`;

export const dado = (rotulo, valor) =>
  `<div class="dado"><div class="rot">${esc(rotulo)}</div><div class="val">${valor ?? '—'}</div></div>`;

export const eventoHistorico = (h, marco = false) => `
  <div class="evento ${marco ? 'marco' : ''}">
    <div class="quando">${quando(h.criado_em)} · ${dataHora(h.criado_em)}</div>
    <div class="oque">${esc(h.descricao || h.acao)}</div>
    <div class="quem">${esc(h.usuario_nome || 'Sistema')}</div>
  </div>`;
