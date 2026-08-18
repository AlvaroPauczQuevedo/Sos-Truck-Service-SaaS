/** Cliente da API — trata sessão expirada, erros e envio de fotos. */

export class ErroApi extends Error {
  constructor(mensagem, status, detalhes) {
    super(mensagem);
    this.status = status;
    this.detalhes = detalhes || null;
  }
  /** Verdadeiro quando o servidor pede confirmação explícita do usuário. */
  get pedeConfirmacao() { return !!(this.detalhes && this.detalhes.requer_confirmacao); }
  get pendencias() { return (this.detalhes && this.detalhes.pendencias) || null; }
  get campo() { return (this.detalhes && this.detalhes.campo) || null; }
}

let aoExpirarSessao = () => {};
export const definirTratadorDeSessao = (fn) => { aoExpirarSessao = fn; };

async function requisitar(caminho, { metodo = 'GET', corpo = null, formulario = null, silencioso = false } = {}) {
  const opcoes = { method: metodo, headers: {}, credentials: 'same-origin' };
  if (formulario) opcoes.body = formulario;
  else if (corpo !== null) {
    opcoes.headers['Content-Type'] = 'application/json';
    opcoes.body = JSON.stringify(corpo);
  }

  let resposta;
  try {
    resposta = await fetch(`/api${caminho}`, opcoes);
  } catch (_) {
    throw new ErroApi('Sem conexão com o servidor. Verifique a internet e tente novamente.', 0);
  }

  if (resposta.status === 204) return null;

  const tipo = resposta.headers.get('content-type') || '';
  const dados = tipo.includes('application/json') ? await resposta.json().catch(() => ({})) : await resposta.text();

  if (!resposta.ok) {
    if (resposta.status === 401 && !silencioso) aoExpirarSessao();
    const mensagem = (dados && dados.erro) || 'Não foi possível concluir a operação.';
    throw new ErroApi(mensagem, resposta.status, dados && dados.detalhes);
  }
  return dados;
}

const parametros = (obj = {}) => {
  const p = new URLSearchParams();
  for (const [chave, valor] of Object.entries(obj)) {
    if (valor !== undefined && valor !== null && valor !== '') p.set(chave, valor);
  }
  const texto = p.toString();
  return texto ? `?${texto}` : '';
};

const obter  = (caminho, filtros) => requisitar(caminho + parametros(filtros));
const enviar = (caminho, corpo) => requisitar(caminho, { metodo: 'POST', corpo });
const alterar= (caminho, corpo) => requisitar(caminho, { metodo: 'PUT', corpo });
const remover= (caminho, filtros) => requisitar(caminho + parametros(filtros), { metodo: 'DELETE' });
const enviarForm = (caminho, formulario, metodo = 'POST') => requisitar(caminho, { metodo, formulario });

export const api = {
  parametros,
  autenticacao: {
    entrar: (email, senha) => enviar('/auth/login', { email, senha }),
    sair: () => enviar('/auth/logout', {}),
    sessao: () => requisitar('/auth/sessao', { silencioso: true }),
    recuperar: (email) => enviar('/auth/recuperar-senha', { email }),
    redefinir: (dados) => enviar('/auth/redefinir-senha', dados),
    trocarSenha: (dados) => enviar('/auth/trocar-senha', dados),
    salvarPerfil: (dados) => alterar('/auth/perfil', dados),
  },
  sistema: {
    dominios: () => obter('/sistema/dominios'),
    configuracoes: () => obter('/sistema/configuracoes'),
    salvarConfiguracoes: (dados) => alterar('/sistema/configuracoes', dados),
    historico: (filtros) => obter('/sistema/historico', filtros),
  },
  painel: { carregar: () => obter('/painel') },
  notificacoes: {
    listar: (filtros) => obter('/notificacoes', filtros),
    ler: (id) => enviar(`/notificacoes/${id}/ler`, {}),
    lerTodas: () => enviar('/notificacoes/ler-todas', {}),
  },
  empresas: {
    listar: (filtros) => obter('/empresas', filtros),
    obter: (id) => obter(`/empresas/${id}`),
    criar: (dados) => enviar('/empresas', dados),
    salvar: (id, dados) => alterar(`/empresas/${id}`, dados),
    inativar: (id) => enviar(`/empresas/${id}/inativar`, {}),
  },
  caminhoes: {
    listar: (filtros) => obter('/caminhoes', filtros),
    obter: (id) => obter(`/caminhoes/${id}`),
    buscaRapida: (termo) => obter('/caminhoes/busca-rapida', { termo }),
    duplicidade: (filtros) => obter('/caminhoes/verificar-duplicidade', filtros),
    criar: (formulario) => enviarForm('/caminhoes', formulario),
    salvar: (id, formulario) => enviarForm(`/caminhoes/${id}`, formulario, 'PUT'),
    inativar: (id, dados) => enviar(`/caminhoes/${id}/inativar`, dados),
    enviarFotos: (id, formulario) => enviarForm(`/caminhoes/${id}/fotos`, formulario),
  },
  fichas: {
    listar: (filtros) => obter('/fichas', filtros),
    obter: (id) => obter(`/fichas/${id}`),
    criar: (formulario) => enviarForm('/fichas', formulario),
    salvar: (id, formulario) => enviarForm(`/fichas/${id}`, formulario, 'PUT'),
    enviarFotos: (id, formulario) => enviarForm(`/fichas/${id}/fotos`, formulario),
    enviar: (id, dados) => enviar(`/fichas/${id}/enviar`, dados),
    devolver: (id, dados) => enviar(`/fichas/${id}/devolver`, dados),
    aceitar: (id) => enviar(`/fichas/${id}/aceitar`, {}),
    concluirServico: (id, dados) => enviar(`/fichas/${id}/concluir-servico`, dados),
    finalizar: (id, dados) => enviar(`/fichas/${id}/finalizar`, dados),
    cancelar: (id, dados) => enviar(`/fichas/${id}/cancelar`, dados),
    reabrir: (id, dados) => enviar(`/fichas/${id}/reabrir`, dados),
    comentar: (id, dados) => enviar(`/fichas/${id}/comentarios`, dados),
    pdf: (id, baixar) => `/api/fichas/${id}/pdf${baixar ? '?download=1' : ''}`,
  },
  problemas: {
    criar: (fichaId, formulario) => enviarForm(`/fichas/${fichaId}/problemas`, formulario),
    salvar: (id, formulario) => enviarForm(`/problemas/${id}`, formulario, 'PUT'),
    resolver: (id) => enviar(`/problemas/${id}/resolver`, {}),
    excluir: (id) => remover(`/problemas/${id}`, { confirmar: 1 }),
  },
  pecas: {
    categorias: () => obter('/pecas/categorias'),
    listar: (filtros) => obter('/pecas', filtros),
    criar: (fichaId, formulario) => enviarForm(`/fichas/${fichaId}/pecas`, formulario),
    salvar: (id, formulario) => enviarForm(`/pecas/${id}`, formulario, 'PUT'),
    enviarFotos: (id, formulario) => enviarForm(`/pecas/${id}/fotos`, formulario),
    cancelar: (id, dados) => enviar(`/pecas/${id}/cancelar`, dados),
    receber: (id, dados) => enviar(`/pecas/${id}/receber`, dados),
    entregar: (id) => enviar(`/pecas/${id}/entregar`, {}),
    instalar: (id, dados) => enviar(`/pecas/${id}/instalar`, dados),
    confirmarRecebimento: (id) => enviar(`/pecas/${id}/confirmar-recebimento`, {}),
  },
  fotos: { excluir: (id) => remover(`/fotos/${id}`, { confirmar: 1 }) },
  fornecedores: {
    listar: (filtros) => obter('/fornecedores', filtros),
    obter: (id) => obter(`/fornecedores/${id}`),
    criar: (dados) => enviar('/fornecedores', dados),
    salvar: (id, dados) => alterar(`/fornecedores/${id}`, dados),
    inativar: (id) => enviar(`/fornecedores/${id}/inativar`, {}),
  },
  cotacoes: {
    listar: (filtros) => obter('/cotacoes', filtros),
    pendentes: () => obter('/cotacoes/pendentes'),
    obter: (id) => obter(`/cotacoes/${id}`),
    criar: (dados) => enviar('/cotacoes', dados),
    salvar: (id, dados) => alterar(`/cotacoes/${id}`, dados),
    adicionarProposta: (id, dados) => enviar(`/cotacoes/${id}/propostas`, dados),
    salvarProposta: (propostaId, dados) => alterar(`/cotacoes/propostas/${propostaId}`, dados),
    excluirProposta: (propostaId) => remover(`/cotacoes/propostas/${propostaId}`, { confirmar: 1 }),
    selecionar: (propostaId) => enviar(`/cotacoes/propostas/${propostaId}/selecionar`, {}),
    enviarAprovacao: (id) => enviar(`/cotacoes/${id}/enviar-aprovacao`, {}),
    aprovar: (id, dados) => enviar(`/cotacoes/${id}/aprovar`, dados),
    cancelar: (id, dados) => enviar(`/cotacoes/${id}/cancelar`, dados),
  },
  ordens: {
    listar: (filtros) => obter('/ordens', filtros),
    obter: (id) => obter(`/ordens/${id}`),
    previa: (cotacaoId) => obter(`/ordens/previa/${cotacaoId}`),
    criar: (dados) => enviar('/ordens', dados),
    salvar: (id, dados) => alterar(`/ordens/${id}`, dados),
    alterarStatus: (id, status) => enviar(`/ordens/${id}/status`, { status }),
    receber: (id, dados) => enviar(`/ordens/${id}/receber`, dados),
    cancelar: (id, dados) => enviar(`/ordens/${id}/cancelar`, dados),
    pdf: (id, baixar) => `/api/ordens/${id}/pdf${baixar ? '?download=1' : ''}`,
  },
  usuarios: {
    listar: (filtros) => obter('/usuarios', filtros),
    mecanicos: () => obter('/usuarios/mecanicos'),
    criar: (dados) => enviar('/usuarios', dados),
    salvar: (id, dados) => alterar(`/usuarios/${id}`, dados),
    redefinirSenha: (id, senha) => enviar(`/usuarios/${id}/senha`, { senha }),
    inativar: (id) => enviar(`/usuarios/${id}/inativar`, {}),
  },
  relatorios: {
    geral: (filtros) => obter('/relatorios/geral', filtros),
    categorias: (filtros) => obter('/relatorios/categorias', filtros),
    caminhoes: (filtros) => obter('/relatorios/caminhoes', filtros),
    fornecedores: (filtros) => obter('/relatorios/fornecedores', filtros),
    mecanicos: (filtros) => obter('/relatorios/mecanicos', filtros),
    exportar: (tipo, filtros) => `/api/relatorios/exportar/${tipo}${parametros(filtros)}`,
  },
};
