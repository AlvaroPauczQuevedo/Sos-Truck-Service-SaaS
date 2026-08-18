/** Painéis do mecânico e da administração, com indicadores, alertas e atividades. */
import { api } from '../api.js';
import { estado, ehAdmin } from '../estado.js';
import { icone, seloDominio, vazio, eventoHistorico } from '../ui.js';
import { esc, moeda, quando, placa as fPlaca, numero } from '../utils.js';

const INDICADORES_ADMIN = [
  { chave: 'fichas_aguardando_analise', nome: 'Fichas aguardando análise', icone: 'relogio', cor: 'amarelo', rota: '#/fila', destaque: true },
  { chave: 'pecas_aguardando_cotacao',  nome: 'Peças aguardando cotação',  icone: 'peca',    cor: 'roxo',    rota: '#/cotacoes' },
  { chave: 'cotacoes_aguardando_aprovacao', nome: 'Cotações para aprovar', icone: 'cotacao', cor: 'azul',    rota: '#/cotacoes?status=aguardando_aprovacao' },
  { chave: 'ordens_abertas',            nome: 'Ordens de compra abertas',  icone: 'ordem',   cor: 'ciano',   rota: '#/ordens' },
  { chave: 'compras_atrasadas',         nome: 'Compras atrasadas',         icone: 'alerta',  cor: 'vermelho', rota: '#/ordens?atrasadas=1', destaque: true },
  { chave: 'caminhoes_manutencao',      nome: 'Caminhões em manutenção',   icone: 'caminhao', cor: 'laranja', rota: '#/caminhoes?status=em_manutencao' },
  { chave: 'fichas_abertas',            nome: 'Fichas em andamento',       icone: 'ficha',   cor: 'azul',    rota: '#/fichas' },
  { chave: 'pecas_recebidas',           nome: 'Peças recebidas',           icone: 'caixa',   cor: 'verde',   rota: '#/recebimento' },
  { chave: 'servicos_concluidos',       nome: 'Serviços concluídos (30 dias)', icone: 'certo', cor: 'verde', rota: '#/fichas?status=concluida' },
];

const INDICADORES_MECANICO = [
  { chave: 'rascunhos',            nome: 'Rascunhos em aberto',   icone: 'lapis',   cor: 'cinza',   rota: '#/fichas?status=rascunho' },
  { chave: 'devolvidas',           nome: 'Devolvidas para corrigir', icone: 'alerta', cor: 'laranja', rota: '#/fichas?status=devolvida', destaque: true },
  { chave: 'aguardando_analise',   nome: 'Aguardando a administração', icone: 'relogio', cor: 'azul', rota: '#/fichas?status=aguardando_analise' },
  { chave: 'pecas_disponiveis',    nome: 'Peças prontas para instalar', icone: 'caixa', cor: 'verde', rota: '#/pecas?status=recebida,entregue', destaque: true },
  { chave: 'minhas_fichas_abertas', nome: 'Minhas fichas em andamento', icone: 'ficha', cor: 'azul',  rota: '#/fichas?minhas=1' },
  { chave: 'pecas_solicitadas',    nome: 'Peças solicitadas',     icone: 'peca',    cor: 'roxo',    rota: '#/pecas' },
  { chave: 'caminhoes_manutencao', nome: 'Caminhões comigo',      icone: 'caminhao', cor: 'laranja', rota: '#/caminhoes' },
  { chave: 'pecas_instaladas',     nome: 'Peças instaladas',      icone: 'certo',   cor: 'verde',   rota: '#/pecas?status=instalada' },
  { chave: 'servicos_concluidos',  nome: 'Serviços concluídos (30 dias)', icone: 'certo', cor: 'verde', rota: '#/fichas?status=concluida' },
];

const CORES_FUNDO = {
  vermelho: 'var(--vermelho-claro)', verde: 'var(--verde-bg)', azul: 'var(--azul-bg)',
  laranja: 'var(--laranja-bg)', amarelo: 'var(--amarelo-bg)', roxo: 'var(--roxo-bg)',
  ciano: 'var(--ciano-bg)', cinza: 'var(--cinza-bg)',
};
const CORES_TEXTO = {
  vermelho: 'var(--vermelho)', verde: 'var(--verde)', azul: 'var(--azul)', laranja: 'var(--laranja)',
  amarelo: 'var(--amarelo)', roxo: 'var(--roxo)', ciano: 'var(--ciano)', cinza: 'var(--cinza)',
};

export async function telaPainel(raiz, { irPara }) {
  const dados = await api.painel.carregar();
  const admin = ehAdmin();
  const lista = (admin ? INDICADORES_ADMIN : INDICADORES_MECANICO)
    .filter((i) => dados.indicadores[i.chave] !== undefined);

  const primeiroNome = (estado.usuario.nome || '').split(' ')[0];
  const hora = new Date().getHours();
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';

  raiz.innerHTML = `
    <div class="pagina-cabecalho">
      <div class="texto">
        <h1 class="titulo">${saudacao}, ${esc(primeiroNome)}</h1>
        <p class="apoio">${admin ? 'Acompanhe as fichas, cotações e compras da frota.' : 'Suas fichas, peças e serviços em andamento.'}</p>
      </div>
      ${admin ? '' : `<a class="botao botao-principal" href="#/ficha/nova">${icone('mais', 18)} Nova ficha</a>`}
    </div>

    ${dados.alertas && dados.alertas.length ? `
      <div class="lista mb16">
        ${dados.alertas.slice(0, 4).map((a) => `
          <a class="faixa-alerta" href="${esc(a.link.replace(/^\/#/, '#'))}" style="text-decoration:none">
            ${icone('alerta', 19)}
            <div class="crescer"><b>${esc(a.titulo)}</b><span class="mini" style="color:inherit;opacity:.85">${esc(a.detalhe)}</span></div>
            ${icone('avancar', 16)}
          </a>`).join('')}
        ${dados.alertas.length > 4 ? `<div class="mini" style="text-align:center">e mais ${dados.alertas.length - 4} alerta(s)</div>` : ''}
      </div>` : ''}

    ${admin && dados.financeiro ? `
      <div class="faixa-financeira mb16">
        <div class="item"><div class="rot">Comprado no mês</div><div class="val">${moeda(dados.financeiro.comprado_mes)}</div></div>
        <div class="item"><div class="rot">Comprado no ano</div><div class="val">${moeda(dados.financeiro.comprado_ano)}</div></div>
        <div class="item"><div class="rot">Aguardando aprovação</div><div class="val ${dados.financeiro.em_aprovacao > 0 ? 'destaque' : ''}">${moeda(dados.financeiro.em_aprovacao)}</div></div>
      </div>` : ''}

    <div class="indicadores amplo">
      ${lista.map((i) => {
        const valor = dados.indicadores[i.chave] || 0;
        const acender = i.destaque && valor > 0;
        return `<button class="indicador ${acender ? 'destaque' : ''}" data-ir="${esc(i.rota)}">
          <div class="icone" style="background:${CORES_FUNDO[i.cor]};color:${CORES_TEXTO[i.cor]}">${icone(i.icone, 18)}</div>
          <div class="crescer">
            <div class="valor">${numero(valor)}</div>
            <div class="nome">${esc(i.nome)}</div>
          </div>
        </button>`;
      }).join('')}
    </div>

    ${admin && dados.fila && dados.fila.length ? `
      <h2 class="secao">Fichas aguardando análise</h2>
      <div class="lista">
        ${dados.fila.map((f) => `
          <div class="cartao cartao-clicavel" data-ir="#/fichas/${f.id}">
            <div class="cartao-corpo flex centro g10">
              <div class="crescer" style="min-width:0">
                <div class="flex centro g8 quebra mb8">
                  <span class="numero-doc">${esc(f.numero)}</span>
                  ${seloDominio(estado.dominios.prioridades, f.prioridade)}
                </div>
                <div class="flex centro g8 quebra">
                  <span class="etiqueta-placa">${esc(fPlaca(f.placa))}</span>
                  <span class="mini">${esc(f.mecanico_nome)} · ${f.total_pecas} peça(s) · enviada ${quando(f.enviada_em)}</span>
                </div>
              </div>
              ${icone('avancar', 18)}
            </div>
          </div>`).join('')}
      </div>` : ''}

    <h2 class="secao">${admin ? 'Fichas em andamento' : 'Minhas fichas em andamento'}</h2>
    ${dados.fichas_recentes.length ? `
      <div class="lista">
        ${dados.fichas_recentes.map((f) => `
          <div class="cartao cartao-clicavel" data-ir="#/fichas/${f.id}">
            <div class="cartao-corpo">
              <div class="flex entre centro g8 quebra mb8">
                <span class="numero-doc">${esc(f.numero)}</span>
                ${seloDominio(estado.dominios.status_ficha, f.status)}
              </div>
              <div class="flex centro g8 quebra">
                <span class="etiqueta-placa">${esc(fPlaca(f.placa))}</span>
                ${f.codigo_frota ? `<span class="etiqueta-frota">${esc(f.codigo_frota)}</span>` : ''}
                ${seloDominio(estado.dominios.prioridades, f.prioridade)}
              </div>
              <div class="mini mt6">${esc(f.empresa_nome || 'Sem empresa')} · ${esc(f.mecanico_nome)} · aberta ${quando(f.aberta_em)}</div>
            </div>
          </div>`).join('')}
      </div>` : vazio({
        icone: 'ficha',
        titulo: 'Nenhuma ficha em andamento',
        texto: admin ? 'Assim que os mecânicos enviarem fichas, elas aparecem aqui.' : 'Abra uma nova ficha para começar a inspeção.',
        acao: admin ? '' : '<a class="botao botao-principal" href="#/ficha/nova">Nova ficha</a>',
      })}

    <h2 class="secao">Atividades recentes</h2>
    <div class="cartao"><div class="cartao-corpo">
      ${dados.atividades.length
        ? `<div class="linha-tempo">${dados.atividades.map((a, i) => eventoHistorico(a, i === 0)).join('')}</div>`
        : '<p class="apoio">Nenhuma atividade registrada ainda.</p>'}
    </div></div>`;

  raiz.querySelectorAll('[data-ir]').forEach((el) => {
    el.onclick = () => irPara(el.dataset.ir);
  });
}
