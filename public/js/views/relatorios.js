/** Relatórios gerenciais com filtro por período e exportação em CSV. */
import { api } from '../api.js';
import { icone, carregando, avisarErro, vazio } from '../ui.js';
import { esc, moeda, numero, placa as fPlaca, juntar } from '../utils.js';

const ABAS = [
  { chave: 'geral',        nome: 'Visão geral' },
  { chave: 'categorias',   nome: 'Por categoria' },
  { chave: 'caminhoes',    nome: 'Por caminhão' },
  { chave: 'fornecedores', nome: 'Fornecedores' },
  { chave: 'mecanicos',    nome: 'Mecânicos' },
];

export async function telaRelatorios(raiz, { consulta }) {
  const hoje = new Date();
  const inicio = new Date(hoje.getTime() - 90 * 86400000);
  const periodo = {
    de: consulta.get('de') || inicio.toISOString().slice(0, 10),
    ate: consulta.get('ate') || hoje.toISOString().slice(0, 10),
  };
  let abaAtual = consulta.get('aba') || 'geral';

  raiz.innerHTML = `
    <div class="pagina-cabecalho">
      <div class="texto">
        <h1 class="titulo">Relatórios</h1>
        <p class="apoio">Números de manutenção e compras no período selecionado.</p>
      </div>
    </div>

    <div class="cartao mb12">
      <div class="cartao-corpo">
        <div class="grade-2">
          <div class="campo"><label for="rel-de">Período de</label>
            <input class="entrada" type="date" id="rel-de" value="${esc(periodo.de)}"></div>
          <div class="campo"><label for="rel-ate">até</label>
            <input class="entrada" type="date" id="rel-ate" value="${esc(periodo.ate)}"></div>
        </div>
        <div class="botoes-linha mt10">
          <button class="botao botao-principal botao-pequeno" data-aplicar>Aplicar período</button>
          <button class="botao botao-contorno botao-pequeno" data-atalho="30">Últimos 30 dias</button>
          <button class="botao botao-contorno botao-pequeno" data-atalho="90">90 dias</button>
          <button class="botao botao-contorno botao-pequeno" data-atalho="365">12 meses</button>
        </div>
      </div>
    </div>

    <div class="fichas-rapidas" data-abas>
      ${ABAS.map((a) => `<button class="ficha-rapida ${abaAtual === a.chave ? 'ativa' : ''}" data-aba="${a.chave}">${esc(a.nome)}</button>`).join('')}
    </div>

    <div id="conteudo-relatorio">${carregando(3)}</div>`;

  const area = raiz.querySelector('#conteudo-relatorio');

  async function desenhar() {
    area.innerHTML = carregando(3);
    try {
      if (abaAtual === 'geral') area.innerHTML = await relatorioGeral(periodo);
      else if (abaAtual === 'categorias') area.innerHTML = await relatorioCategorias(periodo);
      else if (abaAtual === 'caminhoes') area.innerHTML = await relatorioCaminhoes(periodo);
      else if (abaAtual === 'fornecedores') area.innerHTML = await relatorioFornecedores(periodo);
      else area.innerHTML = await relatorioMecanicos(periodo);
    } catch (erro) {
      avisarErro(erro);
      area.innerHTML = '<p class="apoio">Não foi possível carregar o relatório.</p>';
    }
  }

  raiz.querySelector('[data-aplicar]').onclick = () => {
    periodo.de = raiz.querySelector('#rel-de').value;
    periodo.ate = raiz.querySelector('#rel-ate').value;
    desenhar();
  };
  raiz.querySelectorAll('[data-atalho]').forEach((b) => {
    b.onclick = () => {
      const dias = Number(b.dataset.atalho);
      periodo.de = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
      periodo.ate = new Date().toISOString().slice(0, 10);
      raiz.querySelector('#rel-de').value = periodo.de;
      raiz.querySelector('#rel-ate').value = periodo.ate;
      desenhar();
    };
  });
  raiz.querySelectorAll('[data-aba]').forEach((b) => {
    b.onclick = () => {
      raiz.querySelectorAll('[data-aba]').forEach((x) => x.classList.remove('ativa'));
      b.classList.add('ativa');
      abaAtual = b.dataset.aba;
      desenhar();
    };
  });

  await desenhar();
}

const cartaoNumero = (rotulo, valor, cor = '') => `
  <div class="indicador" style="cursor:default">
    <div class="crescer">
      <div class="valor ${cor}">${valor}</div>
      <div class="nome">${esc(rotulo)}</div>
    </div>
  </div>`;

/** Barra proporcional simples usada nos rankings. */
const barra = (valor, maximo) => `
  <div style="height:6px;background:var(--cinza-linha);border-radius:3px;overflow:hidden;margin-top:5px">
    <div style="height:100%;width:${maximo > 0 ? Math.max(2, (valor / maximo) * 100) : 0}%;background:var(--vermelho);border-radius:3px"></div>
  </div>`;

async function relatorioGeral(periodo) {
  const r = await api.relatorios.geral(periodo);
  const maxMes = Math.max(...r.por_mes.map((m) => m.valor), 1);
  return `
    <div class="indicadores mb16">
      ${cartaoNumero('Fichas abertas no período', numero(r.fichas.total || 0))}
      ${cartaoNumero('Fichas finalizadas', numero(r.fichas.concluidas || 0), 'cor-verde')}
      ${cartaoNumero('Fichas em andamento', numero(r.fichas.em_andamento || 0))}
      ${cartaoNumero('Fichas críticas', numero(r.fichas.criticas || 0), 'cor-vermelho')}
      ${cartaoNumero('Tempo médio de serviço', r.tempo_medio_dias ? `${numero(r.tempo_medio_dias, 1)} dias` : '—')}
    </div>

    <h2 class="secao">Compras no período</h2>
    <div class="indicadores mb16">
      ${cartaoNumero('Ordens emitidas', numero(r.compras.ordens || 0))}
      ${cartaoNumero('Valor total comprado', moeda(r.compras.valor_total), 'cor-vermelho')}
      ${cartaoNumero('Ticket médio por ordem', moeda(r.compras.ticket_medio))}
      ${cartaoNumero('Frete pago', moeda(r.compras.frete_total))}
      ${cartaoNumero('Descontos obtidos', moeda(r.compras.desconto_total), 'cor-verde')}
    </div>

    <h2 class="secao">Peças</h2>
    <div class="indicadores mb16">
      ${cartaoNumero('Peças solicitadas', numero(r.pecas.total || 0))}
      ${cartaoNumero('Peças instaladas', numero(r.pecas.instaladas || 0), 'cor-verde')}
      ${cartaoNumero('Peças críticas', numero(r.pecas.criticas || 0), 'cor-vermelho')}
      ${cartaoNumero('Peças canceladas', numero(r.pecas.canceladas || 0))}
    </div>

    ${r.por_mes.length ? `
      <h2 class="secao">Evolução das compras</h2>
      <div class="cartao mb12"><div class="cartao-corpo">
        ${r.por_mes.map((m) => `
          <div class="mb12">
            <div class="flex entre centro">
              <span class="negrito" style="font-size:13.5px">${esc(formatarMes(m.mes))}</span>
              <span class="tabular">${moeda(m.valor)} <span class="mini">(${m.ordens} ordem/ns)</span></span>
            </div>
            ${barra(m.valor, maxMes)}
          </div>`).join('')}
      </div></div>` : ''}

    ${r.por_status.length ? `
      <h2 class="secao">Fichas por situação</h2>
      <div class="cartao mb12"><div class="cartao-corpo">
        ${r.por_status.map((s) => `
          <div class="linha-info"><span class="rot">${esc(s.status)}</span><span class="val">${numero(s.total)}</span></div>`).join('')}
      </div></div>` : ''}

    ${botoesExportacao(periodo)}`;
}

const formatarMes = (aaaaMm) => {
  const [ano, mes] = String(aaaaMm).split('-');
  const nomes = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  return `${nomes[Number(mes) - 1] || mes}/${ano}`;
};

async function relatorioCategorias(periodo) {
  const { itens } = await api.relatorios.categorias(periodo);
  if (!itens.length) return vazio({ icone: 'peca', titulo: 'Sem dados no período' });
  const maximo = Math.max(...itens.map((i) => i.valor), 1);
  return `
    <div class="cartao"><div class="cartao-corpo">
      ${itens.map((i) => `
        <div class="mb14">
          <div class="flex entre centro g8 quebra">
            <span class="negrito" style="font-size:13.5px">${esc(i.categoria || 'Sem categoria')}</span>
            <span class="tabular">${moeda(i.valor)} <span class="mini">· ${i.pecas} peça(s)</span></span>
          </div>
          ${barra(i.valor, maximo)}
        </div>`).join('')}
    </div></div>
    ${botoesExportacao(periodo)}`;
}

async function relatorioCaminhoes(periodo) {
  const { itens } = await api.relatorios.caminhoes(periodo);
  if (!itens.length) return vazio({ icone: 'caminhao', titulo: 'Sem dados no período' });
  return `
    <div class="tabela-rolagem">
      <table class="tabela">
        <thead><tr><th>Caminhão</th><th>Empresa</th><th class="num">Fichas</th>
          <th class="num">Problemas</th><th class="num">Gasto</th></tr></thead>
        <tbody>
          ${itens.map((c) => `
            <tr>
              <td><a href="#/caminhoes/${c.id}">${esc(fPlaca(c.placa))}</a>
                <div class="mini">${esc(juntar([c.codigo_frota, [c.marca, c.modelo].filter(Boolean).join(' ')]))}</div></td>
              <td>${esc(c.empresa_nome || '—')}</td>
              <td class="num">${numero(c.fichas)}</td>
              <td class="num">${numero(c.problemas)}</td>
              <td class="num negrito">${moeda(c.gasto)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    ${botoesExportacao(periodo)}`;
}

async function relatorioFornecedores(periodo) {
  const { itens } = await api.relatorios.fornecedores(periodo);
  if (!itens.length) return vazio({ icone: 'loja', titulo: 'Sem dados no período' });
  return `
    <div class="tabela-rolagem">
      <table class="tabela">
        <thead><tr><th>Fornecedor</th><th class="num">Propostas</th><th class="num">Vencedoras</th>
          <th class="num">Prazo médio</th><th class="num">Atrasos</th><th class="num">Comprado</th></tr></thead>
        <tbody>
          ${itens.map((f) => `
            <tr>
              <td>${esc(f.nome)}<div class="mini">${esc([f.cidade, f.estado].filter(Boolean).join('/'))}</div></td>
              <td class="num">${numero(f.propostas)}</td>
              <td class="num">${numero(f.vencedoras || 0)}</td>
              <td class="num">${f.prazo_medio ? `${numero(f.prazo_medio, 1)} d` : '—'}</td>
              <td class="num ${f.atrasos > 0 ? 'cor-vermelho negrito' : ''}">${numero(f.atrasos)}</td>
              <td class="num negrito">${moeda(f.comprado)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    ${botoesExportacao(periodo)}`;
}

async function relatorioMecanicos(periodo) {
  const { itens } = await api.relatorios.mecanicos(periodo);
  if (!itens.length) return vazio({ icone: 'usuarios', titulo: 'Sem dados no período' });
  return `
    <div class="tabela-rolagem">
      <table class="tabela">
        <thead><tr><th>Mecânico</th><th class="num">Fichas</th><th class="num">Finalizadas</th>
          <th class="num">Devolvidas</th><th class="num">Peças</th><th class="num">Tempo médio</th></tr></thead>
        <tbody>
          ${itens.map((m) => `
            <tr>
              <td>${esc(m.nome)}</td>
              <td class="num">${numero(m.fichas)}</td>
              <td class="num cor-verde">${numero(m.concluidas || 0)}</td>
              <td class="num ${m.devolvidas > 0 ? 'cor-vermelho' : ''}">${numero(m.devolvidas || 0)}</td>
              <td class="num">${numero(m.pecas_solicitadas)}</td>
              <td class="num">${m.tempo_medio_dias ? `${numero(m.tempo_medio_dias, 1)} d` : '—'}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    ${botoesExportacao(periodo)}`;
}

const botoesExportacao = (periodo) => `
  <h2 class="secao">Exportar para planilha</h2>
  <div class="botoes-linha">
    <a class="botao botao-contorno" href="${api.relatorios.exportar('fichas', periodo)}">${icone('baixar', 17)} Fichas (CSV)</a>
    <a class="botao botao-contorno" href="${api.relatorios.exportar('ordens', periodo)}">${icone('baixar', 17)} Ordens de compra (CSV)</a>
    <a class="botao botao-contorno" href="${api.relatorios.exportar('pecas', periodo)}">${icone('baixar', 17)} Peças (CSV)</a>
  </div>`;
