/** Estado da sessão e listas de domínio carregadas uma única vez. */
import { api } from './api.js';

export const estado = {
  usuario: null,
  dominios: null,
  categorias: null,
  configuracoes: null,
  notificacoesNaoLidas: 0,
};

export const ehAdmin = () => !!estado.usuario && estado.usuario.perfil === 'admin';
export const ehMecanico = () => !!estado.usuario && estado.usuario.perfil === 'mecanico';

export async function carregarDominios() {
  if (!estado.dominios) estado.dominios = await api.sistema.dominios();
  return estado.dominios;
}

export async function carregarCategorias(recarregar = false) {
  if (!estado.categorias || recarregar) estado.categorias = (await api.pecas.categorias()).itens;
  return estado.categorias;
}

export async function carregarConfiguracoes(recarregar = false) {
  if (!estado.configuracoes || recarregar) estado.configuracoes = await api.sistema.configuracoes();
  return estado.configuracoes;
}

export async function atualizarNotificacoes() {
  try {
    const { nao_lidas } = await api.notificacoes.listar({ nao_lidas: 1 });
    estado.notificacoesNaoLidas = nao_lidas || 0;
    document.dispatchEvent(new CustomEvent('notificacoes-mudaram'));
  } catch (_) { /* silencioso: não atrapalha o uso do sistema */ }
  return estado.notificacoesNaoLidas;
}

export function limparEstado() {
  estado.usuario = null;
  estado.dominios = null;
  estado.categorias = null;
  estado.configuracoes = null;
  estado.notificacoesNaoLidas = 0;
}
