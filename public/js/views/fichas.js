/** Fichas mecânicas: lista, abertura, detalhe completo e fila de análise. */
import { api } from '../api.js';
import { estado, ehAdmin, carregarCategorias } from '../estado.js';
import {
  icone, selo, seloDominio, vazio, carregando, avisar, avisarErro, confirmar, abrirModal,
  campoFotos, ativarCampoFotos, coletar, galeria, ativarGaleria, marcarErro, ocupado,
  dado, linhaInfo, eventoHistorico,
} from '../ui.js';
import {
  esc, placa as fPlaca, km as fKm, data as fData, dataHora, quando, moeda, numero,
  debounce, telefone as fTelefone, juntar,
} from '../utils.js';

const STATUS_ATALHOS = [
  { chave: '', nome: 'Todas' },
  { chave: 'rascunho', nome: 'Rascunhos' },
  { chave: 'aguardando_analise', nome: 'Aguardando análise' },
  { chave: 'devolvida', nome: 'Devolvidas' },
  { chave: 'em_cotacao,aguardando_aprovacao', nome: 'Em cotação' },
  { chave: 'em_compra,aguardando_recebimento', nome: 'Em compra' },
  { chave: 'em_execucao,servico_concluido', nome: 'Em execução' },
  { chave: 'concluida', nome: 'Finalizadas' },
];

// ================================================================ Listagem
export async function telaFichas(raiz, { irPara, consulta }) {
  const filtros = {
    busca: consulta.get('busca') || '',
    status: consulta.get('status') || '',
    prioridade: consulta.get('prioridade') || '',
    mecanico_id: consulta.get('mecanico_id') || '',
    empresa_id: consulta.get('empresa_id') || '',
    de: consulta.get('de') || '',
    ate: consulta.get('ate') || '',
    minhas: consulta.get('minhas') || '',
    pagina: 1,
  };

  raiz.innerHTML = `
    <div class="pagina-cabecalho">
      <div class="texto">
        <h1 class="titulo">${ehAdmin() ? 'Fichas mecânicas' : 'Minhas fichas'}</h1>
        <p class="apoio">Acompanhe as inspeções, peças solicitadas e o andamento de cada serviço.</p>
      </div>
      <a class="botao botao-principal so-desktop" href="#/ficha/nova">${icone('mais', 18)} Nova ficha</a>
    </div>

    <div class="barra-busca">
      <div class="campo-busca">
        ${icone('busca', 18)}
        <input class="entrada" type="search" id="busca-ficha" placeholder="Nº da ficha, placa, frota, empresa ou mecânico"
               value="${esc(filtros.busca)}" inputmode="search" autocomplete="off">
      </div>
      <button class="botao botao-contorno botao-filtro" data-filtros aria-label="Filtros">
        ${icone('filtro', 18)}<span class="marca esconder" data-marca-filtro></span>
      </button>
    </div>

    <div class="fichas-rapidas" data-atalhos>
      ${STATUS_ATALHOS.map((s) => `
        <button class="ficha-rapida ${filtros.status === s.chave ? 'ativa' : ''}" data-status="${esc(s.chave)}">${esc(s.nome)}</button>`).join('')}
    </div>

    <div id="lista-fichas">${carregando(4)}</div>
    <a class="acao-flutuante" href="#/ficha/nova">${icone('mais', 20)} Ficha</a>`;

  const area = raiz.querySelector('#lista-fichas');

  async function desenhar() {
    area.innerHTML = carregando(3);
    try {
      const { itens, total } = await api.fichas.listar(filtros);
      const temFiltro = !!(filtros.prioridade || filtros.mecanico_id || filtros.empresa_id || filtros.de || filtros.ate);
      raiz.querySelector('[data-marca-filtro]').classList.toggle('esconder', !temFiltro);
      if (!itens.length) {
        area.innerHTML = vazio({
          icone: 'ficha', titulo: 'Nenhuma ficha encontrada',
          texto: 'Ajuste a busca ou abra uma nova ficha de inspeção.',
          acao: '<a class="botao botao-principal" href="#/ficha/nova">Nova ficha</a>',
        });
        return;
      }
      area.innerHTML = `
        <div class="mini mb8">${numero(total)} ficha${total === 1 ? '' : 's'} encontrada${total === 1 ? '' : 's'}</div>
        <div class="lista">${itens.map(cartaoFicha).join('')}</div>`;
      area.querySelectorAll('[data-ir]').forEach((el) => { el.onclick = () => irPara(el.dataset.ir); });
    } catch (erro) {
      avisarErro(erro);
      area.innerHTML = '<p class="apoio">Não foi possível carregar as fichas.</p>';
    }
  }

  raiz.querySelector('#busca-ficha').oninput = debounce((e) => { filtros.busca = e.target.value.trim(); desenhar(); }, 350);
  raiz.querySelectorAll('[data-atalhos] .ficha-rapida').forEach((b) => {
    b.onclick = () => {
      raiz.querySelectorAll('[data-atalhos] .ficha-rapida').forEach((x) => x.classList.remove('ativa'));
      b.classList.add('ativa');
      filtros.status = b.dataset.status;
      desenhar();
    };
  });
  raiz.querySelector('[data-filtros]').onclick = () => abrirFiltrosFicha(filtros, desenhar);

  await desenhar();
}

async function abrirFiltrosFicha(filtros, aoAplicar) {
  const [{ itens: mecanicos }, { itens: empresas }] = await Promise.all([
    api.usuarios.mecanicos(), api.empresas.listar(),
  ]);
  const d = estado.dominios;
  const { elemento, fechar } = abrirModal({
    titulo: 'Filtrar fichas',
    conteudo: `
      <div class="formulario">
        <div class="campo">
          <label for="f-prioridade">Prioridade</label>
          <select class="selecao" id="f-prioridade">
            <option value="">Todas</option>
            ${Object.entries(d.prioridades).map(([k, v]) =>
              `<option value="${k}" ${filtros.prioridade === k ? 'selected' : ''}>${esc(v.rotulo)}</option>`).join('')}
          </select>
        </div>
        ${ehAdmin() ? `
        <div class="campo">
          <label for="f-mecanico">Mecânico responsável</label>
          <select class="selecao" id="f-mecanico">
            <option value="">Todos</option>
            ${mecanicos.map((m) => `<option value="${m.id}" ${String(filtros.mecanico_id) === String(m.id) ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}
          </select>
        </div>` : ''}
        <div class="campo">
          <label for="f-empresa">Empresa</label>
          <select class="selecao" id="f-empresa">
            <option value="">Todas</option>
            ${empresas.map((e) => `<option value="${e.id}" ${String(filtros.empresa_id) === String(e.id) ? 'selected' : ''}>${esc(e.nome)}</option>`).join('')}
          </select>
        </div>
        <div class="grade-2">
          <div class="campo"><label for="f-de">Período de</label>
            <input class="entrada" type="date" id="f-de" value="${esc(filtros.de)}"></div>
          <div class="campo"><label for="f-ate">até</label>
            <input class="entrada" type="date" id="f-ate" value="${esc(filtros.ate)}"></div>
        </div>
      </div>`,
    rodape: `<button class="botao botao-contorno" data-limpar>Limpar tudo</button>
             <button class="botao botao-principal" data-aplicar>Aplicar filtros</button>`,
  });

  elemento.querySelector('[data-limpar]').onclick = () => {
    Object.assign(filtros, { prioridade: '', mecanico_id: '', empresa_id: '', de: '', ate: '' });
    fechar(); aoAplicar();
  };
  elemento.querySelector('[data-aplicar]').onclick = () => {
    filtros.prioridade = elemento.querySelector('#f-prioridade').value;
    const mec = elemento.querySelector('#f-mecanico');
    filtros.mecanico_id = mec ? mec.value : '';
    filtros.empresa_id = elemento.querySelector('#f-empresa').value;
    filtros.de = elemento.querySelector('#f-de').value;
    filtros.ate = elemento.querySelector('#f-ate').value;
    fechar(); aoAplicar();
  };
}

const cartaoFicha = (f) => `
  <div class="cartao cartao-clicavel" data-ir="#/fichas/${f.id}">
    <div class="cartao-corpo">
      <div class="flex entre centro g8 quebra mb8">
        <span class="numero-doc">${esc(f.numero)}</span>
        ${seloDominio(estado.dominios.status_ficha, f.status)}
      </div>
      <div class="flex centro g8 quebra mb8">
        <span class="etiqueta-placa">${esc(fPlaca(f.placa))}</span>
        ${f.codigo_frota ? `<span class="etiqueta-frota">${esc(f.codigo_frota)}</span>` : ''}
        ${seloDominio(estado.dominios.prioridades, f.prioridade)}
        ${f.problemas_impeditivos ? selo('Impede o uso', 'vermelho') : ''}
        ${f.pecas_criticas ? selo(`${f.pecas_criticas} peça(s) crítica(s)`, 'vermelho') : ''}
      </div>
      <div class="apoio truncar">${esc(f.motivo_entrada || f.diagnostico || 'Sem descrição')}</div>
      <div class="mini mt6">${esc(juntar([
        f.empresa_nome, f.mecanico_nome,
        `${f.total_problemas} problema(s)`, `${f.total_pecas} peça(s)`,
        `aberta ${quando(f.aberta_em)}`,
      ]))}</div>
    </div>
  </div>`;

// ================================================================ Fila de análise
export async function telaFila(raiz, { irPara }) {
  const { itens, total } = await api.fichas.listar({ fila: 1, por_pagina: 100 });

  raiz.innerHTML = `
    <div class="pagina-cabecalho">
      <div class="texto">
        <h1 class="titulo">Fila de fichas aguardando análise</h1>
        <p class="apoio">Fichas enviadas pelos mecânicos, ordenadas por prioridade e tempo de espera.</p>
      </div>
    </div>
    ${itens.length ? `
      <div class="mini mb8">${numero(total)} ficha(s) na fila</div>
      <div class="lista">
        ${itens.map((f) => `
          <div class="cartao cartao-clicavel" data-ir="#/fichas/${f.id}">
            <div class="cartao-corpo">
              <div class="flex entre centro g8 quebra mb8">
                <span class="numero-doc">${esc(f.numero)}</span>
                <div class="flex g6 quebra">
                  ${seloDominio(estado.dominios.prioridades, f.prioridade)}
                  ${seloDominio(estado.dominios.status_ficha, f.status)}
                </div>
              </div>
              <div class="flex centro g8 quebra mb8">
                <span class="etiqueta-placa">${esc(fPlaca(f.placa))}</span>
                ${f.codigo_frota ? `<span class="etiqueta-frota">${esc(f.codigo_frota)}</span>` : ''}
                ${f.problemas_impeditivos ? selo('Caminhão parado', 'vermelho') : ''}
              </div>
              <div class="apoio truncar">${esc(f.diagnostico || f.motivo_entrada || '')}</div>
              <div class="mini mt6">${esc(juntar([
                f.mecanico_nome, f.empresa_nome,
                `${f.total_pecas} peça(s)`,
                f.pecas_criticas ? `${f.pecas_criticas} crítica(s)` : null,
                `enviada ${quando(f.enviada_em || f.aberta_em)}`,
              ]))}</div>
            </div>
            <div class="cartao-rodape">
              <span class="botao botao-principal botao-pequeno">Analisar ficha ${icone('avancar', 15)}</span>
            </div>
          </div>`).join('')}
      </div>` : vazio({
        icone: 'certo', titulo: 'Fila vazia',
        texto: 'Nenhuma ficha aguardando análise no momento. Bom trabalho!',
      })}`;

  raiz.querySelectorAll('[data-ir]').forEach((el) => { el.onclick = () => irPara(el.dataset.ir); });
}

// ================================================================ Nova ficha
export async function telaFichaNova(raiz, { irPara, consulta }) {
  const caminhaoInicial = consulta.get('caminhao');
  const [{ itens: mecanicos }] = await Promise.all([
    ehAdmin() ? api.usuarios.mecanicos() : Promise.resolve({ itens: [] }),
  ]);
  const selecionado = caminhaoInicial ? await api.caminhoes.obter(Number(caminhaoInicial)).catch(() => null) : null;
  const d = estado.dominios;

  raiz.innerHTML = `
    <div class="pagina-cabecalho">
      <div class="texto">
        <h1 class="titulo">Nova ficha de inspeção</h1>
        <p class="apoio">Selecione o caminhão e registre o diagnóstico. A ficha fica salva como rascunho até ser enviada.</p>
      </div>
    </div>

    <form id="form-ficha" class="formulario" novalidate>
      <fieldset class="grupo-campos">
        <legend>Caminhão</legend>
        <div class="formulario">
          <div class="campo">
            <label for="busca-caminhao">Buscar caminhão <span class="obrigatorio">*</span></label>
            <div class="campo-busca">
              ${icone('busca', 18)}
              <input class="entrada" id="busca-caminhao" placeholder="Placa, frota, chassi ou modelo"
                     autocomplete="off" inputmode="search">
            </div>
            <input type="hidden" name="caminhao_id" value="${selecionado ? selecionado.id : ''}">
            <div data-resultados-caminhao></div>
            <div data-caminhao-escolhido>${selecionado ? blocoCaminhaoEscolhido(selecionado) : ''}</div>
            <a class="botao botao-contorno botao-pequeno mt6" href="#/caminhoes/novo">
              ${icone('mais', 15)} Caminhão não cadastrado? Cadastrar agora
            </a>
          </div>
          <div class="campo">
            <label for="km">Quilometragem na entrada</label>
            <input class="entrada" type="number" inputmode="numeric" id="km" name="km" min="0"
                   value="${selecionado ? selecionado.km_atual || '' : ''}" placeholder="Ex.: 486320">
          </div>
        </div>
      </fieldset>

      <fieldset class="grupo-campos">
        <legend>Entrada e diagnóstico</legend>
        <div class="formulario">
          ${ehAdmin() ? `
          <div class="campo">
            <label for="mecanico_id">Mecânico responsável <span class="obrigatorio">*</span></label>
            <select class="selecao" id="mecanico_id" name="mecanico_id">
              <option value="">Selecione o mecânico</option>
              ${mecanicos.map((m) => `<option value="${m.id}">${esc(m.nome)}</option>`).join('')}
            </select>
          </div>` : `
          <div class="faixa-alerta info">${icone('info', 19)}
            <div>Mecânico responsável: <b>${esc(estado.usuario.nome)}</b></div></div>`}

          <div class="campo">
            <label for="motivo_entrada">Motivo da entrada</label>
            <input class="entrada" id="motivo_entrada" name="motivo_entrada"
                   placeholder="Ex.: perda de potência e superaquecimento">
          </div>
          <div class="campo">
            <label for="relato_motorista">Relato do motorista</label>
            <textarea class="area-texto" id="relato_motorista" name="relato_motorista" rows="3"
              placeholder="O que o motorista descreveu sobre o problema…"></textarea>
          </div>
          <div class="campo">
            <label for="diagnostico">Diagnóstico do mecânico <span class="obrigatorio">*</span></label>
            <textarea class="area-texto" id="diagnostico" name="diagnostico" rows="4"
              placeholder="Descreva o que foi constatado na inspeção."></textarea>
            <span class="dica">Obrigatório para enviar a ficha à administração.</span>
          </div>
          <div class="campo">
            <label for="servicos_recomendados">Serviços recomendados</label>
            <textarea class="area-texto" id="servicos_recomendados" name="servicos_recomendados" rows="3"
              placeholder="Serviços que precisam ser executados."></textarea>
          </div>
        </div>
      </fieldset>

      <fieldset class="grupo-campos">
        <legend>Prioridade e prazo</legend>
        <div class="formulario">
          <div class="campo">
            <label>Nível de prioridade</label>
            <div class="opcoes-toque gravidade">
              ${Object.entries(d.prioridades).map(([k, v]) => `
                <input type="radio" name="prioridade" id="prio-${k}" value="${k}" ${k === 'media' ? 'checked' : ''}>
                <label for="prio-${k}">${esc(v.rotulo)}</label>`).join('')}
            </div>
          </div>
          <div class="campo">
            <label for="prazo_estimado">Prazo estimado</label>
            <input class="entrada" id="prazo_estimado" name="prazo_estimado" placeholder="Ex.: 3 dias úteis">
          </div>
          ${campoFotos('fotos', 'Fotos gerais do caminhão')}
        </div>
      </fieldset>

      <div class="botoes-empilhados">
        <button class="botao botao-principal botao-grande botao-bloco" type="submit">
          ${icone('certo', 18)} Salvar rascunho e continuar
        </button>
        <p class="mini" style="text-align:center">
          Depois de salvar você adiciona os problemas encontrados e as peças necessárias.
        </p>
      </div>
    </form>`;

  const form = raiz.querySelector('#form-ficha');
  const fotos = ativarCampoFotos(raiz, 'fotos');
  ligarBuscaCaminhao(raiz, form);

  form.onsubmit = async (e) => {
    e.preventDefault();
    const botao = form.querySelector('[type=submit]');
    if (!form.caminhao_id.value) {
      avisar('Selecione o caminhão antes de salvar a ficha.', 'alerta');
      raiz.querySelector('#busca-caminhao').focus();
      return;
    }
    ocupado(botao, true, 'Salvando…');
    try {
      const ficha = await api.fichas.criar(coletar(form, fotos));
      avisar(`Ficha ${ficha.numero} criada como rascunho.`, 'sucesso');
      irPara(`#/fichas/${ficha.id}`);
    } catch (erro) {
      ocupado(botao, false);
      if (erro.campo) marcarErro(form, erro.campo, erro.message);
      avisarErro(erro);
    }
  };
}

const blocoCaminhaoEscolhido = (c) => `
  <div class="cartao mt6" style="border-color:var(--vermelho-borda);background:var(--vermelho-claro)">
    <div class="cartao-corpo flex centro g10">
      <div class="crescer">
        <div class="flex centro g8 quebra">
          <span class="etiqueta-placa">${esc(fPlaca(c.placa))}</span>
          ${c.codigo_frota ? `<span class="etiqueta-frota">${esc(c.codigo_frota)}</span>` : ''}
        </div>
        <div class="mini mt6">${esc(juntar([[c.marca, c.modelo].filter(Boolean).join(' '), c.empresa_nome, fKm(c.km_atual)]))}</div>
      </div>
      <button type="button" class="botao botao-texto" data-trocar-caminhao>Trocar</button>
    </div>
  </div>`;

function ligarBuscaCaminhao(raiz, form) {
  const entrada = raiz.querySelector('#busca-caminhao');
  const resultados = raiz.querySelector('[data-resultados-caminhao]');
  const escolhido = raiz.querySelector('[data-caminhao-escolhido]');

  const ligarTroca = () => {
    const b = escolhido.querySelector('[data-trocar-caminhao]');
    if (b) b.onclick = () => {
      form.caminhao_id.value = '';
      escolhido.innerHTML = '';
      entrada.closest('.campo-busca').style.display = '';
      entrada.focus();
    };
  };
  if (form.caminhao_id.value) entrada.closest('.campo-busca').style.display = 'none';
  ligarTroca();

  entrada.oninput = debounce(async () => {
    const termo = entrada.value.trim();
    if (termo.length < 1) { resultados.innerHTML = ''; return; }
    try {
      const { itens } = await api.caminhoes.buscaRapida(termo);
      resultados.innerHTML = itens.length ? `
        <div class="lista mt6">
          ${itens.map((c) => `
            <button type="button" class="cartao cartao-clicavel" data-escolher='${esc(JSON.stringify(c))}' style="text-align:left;width:100%;border:1px solid var(--cinza-borda)">
              <div class="cartao-corpo flex centro g10">
                <span class="etiqueta-placa">${esc(fPlaca(c.placa))}</span>
                <div class="crescer" style="min-width:0">
                  <div class="negrito truncar" style="font-size:13.5px">${esc([c.marca, c.modelo].filter(Boolean).join(' ') || '—')}</div>
                  <div class="mini truncar">${esc(juntar([c.codigo_frota, c.empresa_nome, fKm(c.km_atual)]))}</div>
                </div>
                ${icone('avancar', 16)}
              </div>
            </button>`).join('')}
        </div>` : `<p class="mini mt6">Nenhum caminhão encontrado com "${esc(termo)}".</p>`;

      resultados.querySelectorAll('[data-escolher]').forEach((b) => {
        b.onclick = () => {
          const c = JSON.parse(b.dataset.escolher);
          form.caminhao_id.value = c.id;
          if (form.km && !form.km.value) form.km.value = c.km_atual || '';
          escolhido.innerHTML = blocoCaminhaoEscolhido(c);
          resultados.innerHTML = '';
          entrada.value = '';
          entrada.closest('.campo-busca').style.display = 'none';
          ligarTroca();
        };
      });
    } catch (_) { /* busca é auxiliar */ }
  }, 300);
}

// ================================================================ Detalhe da ficha
export async function telaFichaDetalhe(raiz, { partes, irPara, recarregar }) {
  const id = Number(partes[0]);
  const f = await api.fichas.obter(id);
  const admin = ehAdmin();
  const d = estado.dominios;
  const editavel = f.pode_editar;

  raiz.innerHTML = `
    ${f.status === 'devolvida' && f.devolvida_motivo ? `
      <div class="faixa-alerta mb12">${icone('alerta', 19)}
        <div><b>Ficha devolvida para correção</b>${esc(f.devolvida_motivo)}
        <div class="mini mt6" style="color:inherit;opacity:.8">Devolvida em ${dataHora(f.devolvida_em)}</div></div></div>` : ''}
    ${f.status === 'cancelada' ? `
      <div class="faixa-alerta mb12">${icone('alerta', 19)}
        <div><b>Ficha cancelada</b>${esc(f.cancelada_motivo || '')}</div></div>` : ''}
    ${f.status === 'rascunho' ? `
      <div class="faixa-alerta aviso mb12">${icone('info', 19)}
        <div><b>Rascunho</b>Esta ficha ainda não foi enviada para a administração.</div></div>` : ''}

    <div class="colunas-detalhe">
      <div>
        <div class="cartao mb12">
          <div class="cartao-corpo">
            <div class="flex entre centro g8 quebra mb12">
              <div>
                <div class="numero-doc" style="font-size:17px">${esc(f.numero)}</div>
                <div class="mini">Aberta em ${dataHora(f.aberta_em)}</div>
              </div>
              <div class="flex g6 quebra direita">
                ${seloDominio(d.status_ficha, f.status, 'selo-grande')}
                ${seloDominio(d.prioridades, f.prioridade)}
              </div>
            </div>

            <div class="flex centro g8 quebra mb12">
              <a class="etiqueta-placa" href="#/caminhoes/${f.caminhao_id}" style="color:#fff">${esc(fPlaca(f.placa))}</a>
              ${f.codigo_frota ? `<span class="etiqueta-frota">${esc(f.codigo_frota)}</span>` : ''}
              <span class="mini">${esc([f.marca, f.modelo, f.versao].filter(Boolean).join(' '))}</span>
            </div>

            <div class="dados-grade">
              ${dado('Mecânico responsável', esc(f.mecanico_nome))}
              ${dado('Empresa / proprietário', esc(f.empresa_nome || '—'))}
              ${dado('Quilometragem', fKm(f.km))}
              ${dado('Motorista', esc(f.motorista_nome || '—'))}
              ${dado('Prazo estimado', esc(f.prazo_estimado || '—'))}
              ${f.enviada_em ? dado('Enviada em', dataHora(f.enviada_em)) : ''}
              ${f.finalizada_em ? dado('Finalizada em', dataHora(f.finalizada_em)) : ''}
              ${admin && f.total_aprovado ? dado('Total aprovado', `<span class="cor-vermelho">${moeda(f.total_aprovado)}</span>`) : ''}
            </div>
          </div>
        </div>

        <div class="cartao mb12">
          <div class="cartao-topo"><h3>Entrada e diagnóstico</h3>
            ${editavel ? `<button class="botao botao-texto botao-pequeno" data-editar-ficha>${icone('lapis', 15)} Editar</button>` : ''}
          </div>
          <div class="cartao-corpo">
            ${blocoTexto('Motivo da entrada', f.motivo_entrada)}
            ${blocoTexto('Relato do motorista', f.relato_motorista)}
            ${blocoTexto('Diagnóstico do mecânico', f.diagnostico)}
            ${blocoTexto('Serviços recomendados', f.servicos_recomendados)}
            ${admin && f.observacoes_internas ? `
              <div class="faixa-alerta aviso mt10">${icone('info', 18)}
                <div><b>Observações internas (só a administração vê)</b>${esc(f.observacoes_internas)}</div></div>` : ''}
            ${f.assinatura_mecanico ? `
              <div class="mt14" style="border-top:1px solid var(--cinza-linha);padding-top:12px">
                <div class="rotulo-campo">Confirmação do mecânico</div>
                <div class="negrito mt6">${esc(f.assinatura_mecanico)}</div>
                <div class="mini">Confirmado em ${dataHora(f.assinado_em)}</div>
              </div>` : ''}
          </div>
        </div>

        ${f.fotos.length || editavel ? `
        <div class="cartao mb12">
          <div class="cartao-topo"><h3>Fotos gerais</h3>
            ${editavel ? `<button class="botao botao-texto botao-pequeno" data-add-fotos-ficha>${icone('camera', 15)} Adicionar</button>` : ''}
          </div>
          <div class="cartao-corpo" data-galeria-ficha>
            ${f.fotos.length ? galeria(f.fotos, { removivel: editavel }) : '<p class="apoio">Nenhuma foto geral anexada.</p>'}
          </div>
        </div>` : ''}

        <div class="cartao mb12">
          <div class="cartao-topo">
            <h3>Problemas encontrados (${f.problemas.length})</h3>
            ${editavel ? `<button class="botao botao-principal botao-pequeno" data-novo-problema>${icone('mais', 15)} Adicionar problema</button>` : ''}
          </div>
          <div class="cartao-corpo" data-lista-problemas>
            ${f.problemas.length ? f.problemas.map((p) => blocoProblema(p, editavel)).join('')
              : '<p class="apoio">Nenhum problema registrado. Adicione ao menos um antes de enviar a ficha.</p>'}
          </div>
        </div>

        <div class="cartao mb12">
          <div class="cartao-topo">
            <h3>Peças solicitadas (${f.pecas.filter((p) => p.status !== 'cancelada').length})</h3>
            ${editavel ? `<button class="botao botao-principal botao-pequeno" data-nova-peca>${icone('mais', 15)} Solicitar peça</button>` : ''}
          </div>
          <div class="cartao-corpo" data-lista-pecas>
            ${f.pecas.length ? f.pecas.map((p) => blocoPeca(p, { editavel, admin, ehMeuServico: f.mecanico_id === estado.usuario.id })).join('')
              : '<p class="apoio">Nenhuma peça solicitada nesta ficha.</p>'}
          </div>
        </div>

        ${admin && (f.cotacoes.length || f.ordens.length) ? `
        <div class="cartao mb12">
          <div class="cartao-topo"><h3>Cotações e compras</h3></div>
          <div class="cartao-corpo">
            ${f.cotacoes.map((c) => `
              <a class="linha-info" href="#/cotacoes/${c.id}" style="color:inherit">
                <span class="rot">${esc(c.numero)}</span>
                <span class="val">${seloDominio(d.status_cotacao, c.status)}</span>
              </a>`).join('')}
            ${f.ordens.map((o) => `
              <a class="linha-info" href="#/ordens/${o.id}" style="color:inherit">
                <span class="rot">${esc(o.numero)} · ${esc(o.fornecedor_nome || '')}</span>
                <span class="val">${moeda(o.total)} ${seloDominio(d.status_oc, o.status)}</span>
              </a>`).join('')}
          </div>
        </div>` : ''}

        ${!admin && f.ordens && f.ordens.length ? `
        <div class="cartao mb12">
          <div class="cartao-topo"><h3>Andamento das compras</h3></div>
          <div class="cartao-corpo">
            ${f.ordens.map((o) => `
              <div class="linha-info">
                <span class="rot">${esc(o.numero)}</span>
                <span class="val">${seloDominio(d.status_oc, o.status)}
                ${o.previsao_entrega ? `<div class="mini">Previsão: ${fData(o.previsao_entrega)}</div>` : ''}</span>
              </div>`).join('')}
          </div>
        </div>` : ''}
      </div>

      <div>
        <div class="cartao mb12" data-acoes-ficha>
          <div class="cartao-topo"><h3>Ações</h3></div>
          <div class="cartao-corpo botoes-empilhados">${acoesFicha(f, admin, editavel)}</div>
        </div>

        <div class="cartao mb12">
          <div class="cartao-topo"><h3>Comunicação</h3>
            <span class="mini">${f.comentarios.length} mensagem(ns)</span>
          </div>
          <div class="cartao-corpo">
            <div class="conversa" data-conversa>
              ${f.comentarios.length ? f.comentarios.map(blocoComentario).join('')
                : '<p class="apoio">Nenhuma mensagem ainda. Use este espaço para falar com a administração.</p>'}
            </div>
            <form class="mt14" id="form-comentario">
              <div class="campo">
                <textarea class="area-texto" name="mensagem" rows="2" required
                  placeholder="Escreva uma mensagem para ${admin ? 'o mecânico' : 'a administração'}…"></textarea>
              </div>
              ${admin ? `
                <label class="interruptor mt6">
                  <input type="checkbox" name="interno">
                  <span class="trilho"></span>
                  <span class="conteudo"><b>Anotação interna</b><span class="mini">Visível apenas para a administração</span></span>
                </label>` : ''}
              <button class="botao botao-escuro botao-bloco mt10" type="submit">${icone('enviar', 17)} Enviar mensagem</button>
            </form>
          </div>
        </div>

        <div class="cartao">
          <div class="cartao-topo"><h3>Histórico da ficha</h3></div>
          <div class="cartao-corpo">
            ${f.historico.length
              ? `<div class="linha-tempo">${f.historico.map((h, i) => eventoHistorico(h, i === 0)).join('')}</div>`
              : '<p class="apoio">Sem registros.</p>'}
          </div>
        </div>
      </div>
    </div>`;

  ligarAcoesFicha(raiz, f, { irPara, recarregar, admin, editavel });
}

const blocoTexto = (rotulo, texto) => texto ? `
  <div class="mb12">
    <div class="rotulo-campo">${esc(rotulo)}</div>
    <div class="texto-bloco mt6">${esc(texto)}</div>
  </div>` : '';

const blocoProblema = (p, editavel) => `
  <div class="cartao mb8" style="box-shadow:none;${p.impede_uso ? 'border-color:var(--vermelho-borda)' : ''}">
    <div class="cartao-corpo">
      <div class="flex entre centro g8 quebra mb8">
        <h3 class="sub crescer">${esc(p.titulo)}</h3>
        <div class="flex g6 quebra">
          ${seloDominio(estado.dominios.gravidades, p.gravidade)}
          ${p.impede_uso ? selo('Impede o uso', 'vermelho') : ''}
          ${p.resolvido ? selo('Resolvido', 'verde') : ''}
        </div>
      </div>
      ${p.descricao ? `<div class="texto-bloco mb8">${esc(p.descricao)}</div>` : ''}
      <div class="dados-grade">
        ${dado('Sistema afetado', esc(p.sistema || '—'))}
        ${p.servico_necessario ? dado('Serviço necessário', esc(p.servico_necessario)) : ''}
        ${p.total_pecas ? dado('Peças relacionadas', `${p.total_pecas}`) : ''}
      </div>
      ${p.fotos && p.fotos.length ? `<div class="mt10" data-galeria-problema="${p.id}">${galeria(p.fotos, { removivel: editavel })}</div>` : ''}
      <div class="botoes-linha mt10">
        ${editavel ? `<button class="botao botao-texto botao-pequeno" data-editar-problema="${p.id}">${icone('lapis', 14)} Editar</button>` : ''}
        <button class="botao botao-texto botao-pequeno" data-resolver-problema="${p.id}">
          ${icone('certo', 14)} ${p.resolvido ? 'Reabrir' : 'Marcar resolvido'}
        </button>
        ${editavel ? `<button class="botao botao-texto botao-pequeno cor-vermelho" data-excluir-problema="${p.id}">${icone('lixeira', 14)} Excluir</button>` : ''}
      </div>
    </div>
  </div>`;

function blocoPeca(p, { editavel, admin, ehMeuServico }) {
  const d = estado.dominios;
  const podeConfirmar = (ehMeuServico || admin) && ['recebida', 'comprada', 'oc_emitida'].includes(p.status);
  const podeInstalar = (ehMeuServico || admin) && ['recebida', 'entregue', 'comprada', 'oc_emitida'].includes(p.status);
  return `
  <div class="cartao mb8" style="box-shadow:none;${p.status === 'cancelada' ? 'opacity:.6' : ''}">
    <div class="cartao-corpo">
      <div class="flex entre centro g8 quebra mb8">
        <h3 class="sub crescer">${esc(p.nome)}</h3>
        <div class="flex g6 quebra">
          ${seloDominio(d.urgencias, p.urgencia)}
          ${seloDominio(d.status_peca, p.status)}
        </div>
      </div>
      <div class="mini mb8">${esc(juntar([p.categoria_nome, p.subcategoria_nome], ' › '))}</div>
      ${p.descricao ? `<div class="texto-bloco mb8">${esc(p.descricao)}</div>` : ''}
      <div class="dados-grade">
        ${dado('Quantidade', `${numero(p.quantidade, 2)} ${esc(p.unidade)}`)}
        ${dado('Tipo', esc(d.tipos_peca[p.tipo_peca] || p.tipo_peca))}
        ${p.codigo_referencia ? dado('Código / referência', esc(p.codigo_referencia)) : ''}
        ${p.marca_preferencial ? dado('Marca preferencial', esc(p.marca_preferencial)) : ''}
        ${p.posicao ? dado('Lado / posição', esc(p.posicao)) : ''}
        ${p.problema_titulo ? dado('Problema relacionado', esc(p.problema_titulo)) : ''}
        ${admin && p.valor_aprovado ? dado('Valor aprovado', `<span class="cor-vermelho">${moeda(p.valor_aprovado)}</span>`) : ''}
        ${admin && p.fornecedor_escolhido ? dado('Fornecedor', esc(p.fornecedor_escolhido)) : ''}
      </div>
      <div class="mt10">
        <div class="rotulo-campo">Motivo da troca</div>
        <div class="texto-bloco mt6">${esc(p.motivo_troca)}</div>
      </div>
      ${p.observacoes_mecanico ? `<div class="mt10"><div class="rotulo-campo">Observações do mecânico</div>
        <div class="texto-bloco mt6">${esc(p.observacoes_mecanico)}</div></div>` : ''}
      ${p.fotos && p.fotos.length ? `<div class="mt10" data-galeria-peca="${p.id}">${galeria(p.fotos, { removivel: editavel })}</div>` : ''}
      ${p.recebida_em || p.instalada_em ? `
        <div class="mini mt10">${esc(juntar([
          p.recebida_em ? `Recebida em ${dataHora(p.recebida_em)}` : null,
          p.entregue_em ? `Entregue em ${dataHora(p.entregue_em)}` : null,
          p.instalada_em ? `Instalada em ${dataHora(p.instalada_em)}` : null,
        ]))}</div>` : ''}
      ${p.status === 'cancelada' && p.cancelada_motivo ? `<div class="mini mt6 cor-vermelho">Cancelada: ${esc(p.cancelada_motivo)}</div>` : ''}
      <div class="botoes-linha mt10">
        ${editavel ? `<button class="botao botao-texto botao-pequeno" data-editar-peca="${p.id}">${icone('lapis', 14)} Editar</button>` : ''}
        ${podeConfirmar ? `<button class="botao botao-contorno botao-pequeno" data-confirmar-peca="${p.id}">${icone('caixa', 14)} Confirmar recebimento</button>` : ''}
        ${podeInstalar ? `<button class="botao botao-verde botao-pequeno" data-instalar-peca="${p.id}">${icone('certo', 14)} Marcar como instalada</button>` : ''}
        ${admin && ['aprovada', 'oc_emitida', 'comprada'].includes(p.status) ? `
          <button class="botao botao-contorno botao-pequeno" data-receber-peca="${p.id}">${icone('caixa', 14)} Registrar recebimento</button>` : ''}
        ${admin && p.status === 'recebida' ? `
          <button class="botao botao-contorno botao-pequeno" data-entregar-peca="${p.id}">Entregar ao mecânico</button>` : ''}
        ${(editavel || admin) && !['cancelada', 'instalada'].includes(p.status) ? `
          <button class="botao botao-texto botao-pequeno cor-vermelho" data-cancelar-peca="${p.id}">Cancelar peça</button>` : ''}
      </div>
    </div>
  </div>`;
}

const blocoComentario = (c) => {
  const minha = c.autor_nome === estado.usuario.nome;
  const classe = c.interno ? 'interna' : minha ? 'minha' : 'deles';
  return `
    <div class="mensagem ${classe}">
      <div class="autor">${esc(c.autor_nome)}${c.interno ? ' · anotação interna' : ''}</div>
      <div>${esc(c.mensagem)}</div>
      <div class="quando">${dataHora(c.criado_em)}</div>
    </div>`;
};

function acoesFicha(f, admin, editavel) {
  const botoes = [];
  if (editavel && ['rascunho', 'devolvida'].includes(f.status)) {
    botoes.push(`<button class="botao botao-principal botao-grande botao-bloco" data-enviar-ficha>
      ${icone('enviar', 18)} Enviar para administração</button>`);
  }
  if (admin && ['aguardando_analise', 'devolvida'].includes(f.status)) {
    botoes.push(`<button class="botao botao-principal botao-bloco" data-aceitar-ficha>${icone('certo', 17)} Aceitar e liberar cotação</button>`);
  }
  if (admin && !['rascunho', 'concluida', 'cancelada'].includes(f.status)) {
    botoes.push(`<button class="botao botao-contorno botao-bloco" data-devolver-ficha>${icone('voltarSeta', 17)} Devolver para correção</button>`);
  }
  if (admin && ['em_cotacao', 'aguardando_analise'].includes(f.status) && f.total_pecas > 0) {
    botoes.push(`<button class="botao botao-escuro botao-bloco" data-criar-cotacao>${icone('cotacao', 17)} Criar cotação</button>`);
  }
  if (!['rascunho', 'concluida', 'cancelada', 'servico_concluido'].includes(f.status)) {
    botoes.push(`<button class="botao botao-verde botao-bloco" data-concluir-servico>${icone('certo', 17)} Finalizar serviço mecânico</button>`);
  }
  if (admin && !['concluida', 'cancelada'].includes(f.status)) {
    botoes.push(`<button class="botao botao-verde botao-bloco" data-finalizar-ficha>${icone('certo', 17)} Finalizar ficha</button>`);
  }
  if (admin && ['concluida', 'cancelada'].includes(f.status)) {
    botoes.push(`<button class="botao botao-contorno botao-bloco" data-reabrir-ficha>Reabrir ficha</button>`);
  }
  botoes.push(`<a class="botao botao-contorno botao-bloco" href="${api.fichas.pdf(f.id)}" target="_blank" rel="noopener">
    ${icone('imprimir', 17)} Ver / imprimir PDF</a>`);
  botoes.push(`<a class="botao botao-contorno botao-bloco" href="${api.fichas.pdf(f.id, true)}">
    ${icone('baixar', 17)} Baixar PDF</a>`);
  if (admin && f.status !== 'cancelada') {
    botoes.push(`<button class="botao botao-perigo botao-bloco" data-cancelar-ficha>Cancelar ficha</button>`);
  }
  return botoes.join('');
}

// ---------------------------------------------------------------- Ações
function ligarAcoesFicha(raiz, f, { irPara, recarregar, admin, editavel }) {
  const acao = (seletor, fn) => raiz.querySelectorAll(seletor).forEach((b) => { b.onclick = () => fn(b); });
  const tentar = async (fn, sucesso) => {
    try { await fn(); if (sucesso) avisar(sucesso, 'sucesso'); recarregar(); }
    catch (erro) { avisarErro(erro); }
  };

  // Galerias
  raiz.querySelectorAll('[data-galeria-ficha], [data-galeria-problema], [data-galeria-peca]').forEach((el) => {
    ativarGaleria(el, editavel ? async (fotoId) => {
      await tentar(() => api.fotos.excluir(fotoId), 'Foto removida da ficha.');
    } : null);
  });

  acao('[data-editar-ficha]', () => abrirEdicaoFicha(f, recarregar, admin));
  acao('[data-add-fotos-ficha]', () => abrirEnvioFotos({
    titulo: 'Adicionar fotos gerais',
    enviar: (formulario) => api.fichas.enviarFotos(f.id, formulario),
    recarregar,
  }));
  acao('[data-novo-problema]', () => abrirFormProblema(f, null, recarregar));
  acao('[data-editar-problema]', (b) => {
    const p = f.problemas.find((x) => x.id === Number(b.dataset.editarProblema));
    abrirFormProblema(f, p, recarregar);
  });
  acao('[data-resolver-problema]', (b) =>
    tentar(() => api.problemas.resolver(Number(b.dataset.resolverProblema))));
  acao('[data-excluir-problema]', async (b) => {
    const ok = await confirmar({
      titulo: 'Excluir problema',
      mensagem: 'O problema sai da ficha e as peças ligadas a ele ficam sem vínculo. A ação fica registrada no histórico. Deseja continuar?',
      confirmarTexto: 'Excluir',
    });
    if (ok) tentar(() => api.problemas.excluir(Number(b.dataset.excluirProblema)), 'Problema removido.');
  });

  acao('[data-nova-peca]', () => abrirFormPeca(f, null, recarregar));
  acao('[data-editar-peca]', (b) => {
    const p = f.pecas.find((x) => x.id === Number(b.dataset.editarPeca));
    abrirFormPeca(f, p, recarregar);
  });
  acao('[data-confirmar-peca]', (b) =>
    tentar(() => api.pecas.confirmarRecebimento(Number(b.dataset.confirmarPeca)), 'Recebimento confirmado.'));
  acao('[data-instalar-peca]', async (b) => {
    const ok = await confirmar({
      titulo: 'Confirmar instalação',
      mensagem: 'Confirma que esta peça foi instalada no caminhão?',
      confirmarTexto: 'Sim, instalada', tipo: 'neutro',
    });
    if (ok) tentar(() => api.pecas.instalar(Number(b.dataset.instalarPeca), {}), 'Peça marcada como instalada.');
  });
  acao('[data-receber-peca]', (b) =>
    tentar(() => api.pecas.receber(Number(b.dataset.receberPeca), {}), 'Recebimento registrado.'));
  acao('[data-entregar-peca]', (b) =>
    tentar(() => api.pecas.entregar(Number(b.dataset.entregarPeca)), 'Peça entregue ao mecânico.'));
  acao('[data-cancelar-peca]', async (b) => {
    const r = await confirmar({
      titulo: 'Cancelar peça',
      mensagem: 'A peça é marcada como cancelada e permanece no histórico da ficha.',
      confirmarTexto: 'Cancelar peça', pedirMotivo: true, rotuloMotivo: 'Motivo do cancelamento',
    });
    if (r) tentar(() => api.pecas.cancelar(Number(b.dataset.cancelarPeca), { motivo: r.motivo, confirmar: true }), 'Peça cancelada.');
  });

  // Fluxo
  acao('[data-enviar-ficha]', () => abrirEnvioFicha(f, recarregar));
  acao('[data-aceitar-ficha]', async () => {
    const ok = await confirmar({
      titulo: 'Aceitar ficha',
      mensagem: 'As peças desta ficha serão liberadas para cotação e o mecânico será avisado.',
      confirmarTexto: 'Aceitar', tipo: 'neutro',
    });
    if (ok) tentar(() => api.fichas.aceitar(f.id), 'Ficha aceita. Peças liberadas para cotação.');
  });
  acao('[data-devolver-ficha]', async () => {
    const r = await confirmar({
      titulo: 'Devolver para correção',
      mensagem: 'O mecânico será notificado e poderá editar a ficha novamente.',
      confirmarTexto: 'Devolver', pedirMotivo: true, rotuloMotivo: 'O que precisa ser corrigido',
    });
    if (r) tentar(() => api.fichas.devolver(f.id, { motivo: r.motivo }), 'Ficha devolvida ao mecânico.');
  });
  acao('[data-criar-cotacao]', async () => {
    try {
      const cotacao = await api.cotacoes.criar({ ficha_id: f.id });
      avisar(`Cotação ${cotacao.cotacao.numero} criada.`, 'sucesso');
      irPara(`#/cotacoes/${cotacao.cotacao.id}`);
    } catch (erro) {
      if (erro.detalhes && erro.detalhes.cotacao_id) {
        irPara(`#/cotacoes/${erro.detalhes.cotacao_id}`);
        avisar(erro.message, 'alerta');
        return;
      }
      avisarErro(erro);
    }
  });
  acao('[data-concluir-servico]', async () => {
    const pendentes = f.pecas.filter((p) => !['instalada', 'cancelada'].includes(p.status)).length;
    const ok = await confirmar({
      titulo: 'Finalizar serviço mecânico',
      mensagem: pendentes
        ? `Ainda há ${pendentes} peça(s) não instalada(s). Confirma a conclusão do serviço mesmo assim?`
        : 'Confirma que o serviço mecânico foi concluído neste caminhão?',
      confirmarTexto: 'Finalizar serviço', tipo: 'neutro',
    });
    if (ok) tentar(() => api.fichas.concluirServico(f.id, { confirmar: true }), 'Serviço mecânico concluído.');
  });
  acao('[data-finalizar-ficha]', async () => {
    const ok = await confirmar({
      titulo: 'Finalizar ficha',
      mensagem: 'A ficha será encerrada e o caminhão liberado, se não houver outras fichas abertas.',
      confirmarTexto: 'Finalizar', tipo: 'neutro',
    });
    if (ok) tentar(() => api.fichas.finalizar(f.id, { confirmar: true }), 'Ficha finalizada.');
  });
  acao('[data-reabrir-ficha]', async () => {
    const r = await confirmar({
      titulo: 'Reabrir ficha', mensagem: 'A ficha volta a ficar em execução.',
      confirmarTexto: 'Reabrir', pedirMotivo: true, rotuloMotivo: 'Motivo da reabertura',
    });
    if (r) tentar(() => api.fichas.reabrir(f.id, { motivo: r.motivo }), 'Ficha reaberta.');
  });
  acao('[data-cancelar-ficha]', async () => {
    const r = await confirmar({
      titulo: 'Cancelar ficha',
      mensagem: 'A ficha e todas as peças pendentes serão canceladas. Nada é apagado — o registro fica no histórico.',
      confirmarTexto: 'Cancelar ficha', pedirMotivo: true, rotuloMotivo: 'Motivo do cancelamento',
    });
    if (r) tentar(() => api.fichas.cancelar(f.id, { motivo: r.motivo, confirmar: true }), 'Ficha cancelada.');
  });

  // Comentários
  const formComentario = raiz.querySelector('#form-comentario');
  if (formComentario) {
    formComentario.onsubmit = async (e) => {
      e.preventDefault();
      const mensagem = formComentario.mensagem.value.trim();
      if (!mensagem) return;
      const botao = formComentario.querySelector('[type=submit]');
      ocupado(botao, true, 'Enviando…');
      try {
        await api.fichas.comentar(f.id, {
          mensagem, interno: formComentario.interno ? formComentario.interno.checked : false,
        });
        formComentario.reset();
        recarregar();
      } catch (erro) { ocupado(botao, false); avisarErro(erro); }
    };
  }
}

// ---------------------------------------------------------------- Modais auxiliares
function abrirEnvioFotos({ titulo, enviar, recarregar }) {
  const { elemento, fechar } = abrirModal({
    titulo,
    conteudo: `<form id="form-fotos">${campoFotos('fotos', 'Selecione as fotos')}
      <div class="campo"><label for="legenda">Legenda (opcional)</label>
        <input class="entrada" id="legenda" name="legenda" placeholder="Ex.: vazamento no cabeçote"></div></form>`,
    rodape: `<button class="botao botao-contorno" data-fechar>Cancelar</button>
             <button class="botao botao-principal" data-enviar>Enviar fotos</button>`,
  });
  const fotos = ativarCampoFotos(elemento, 'fotos');
  elemento.querySelector('[data-enviar]').onclick = async (e) => {
    if (!fotos.arquivos().length) { avisar('Escolha ao menos uma foto.', 'alerta'); return; }
    ocupado(e.target, true, 'Enviando…');
    try {
      const dados = new FormData();
      dados.set('legenda', elemento.querySelector('#legenda').value);
      for (const a of fotos.arquivos()) dados.append('fotos', a);
      await enviar(dados);
      avisar('Fotos anexadas.', 'sucesso');
      fechar();
      recarregar();
    } catch (erro) { ocupado(e.target, false); avisarErro(erro); }
  };
}

function abrirEdicaoFicha(f, recarregar, admin) {
  const d = estado.dominios;
  const { elemento, fechar } = abrirModal({
    titulo: `Editar ficha ${f.numero}`,
    conteudo: `
      <form id="form-editar-ficha" class="formulario">
        <div class="campo"><label for="e-km">Quilometragem</label>
          <input class="entrada" type="number" inputmode="numeric" id="e-km" name="km" value="${f.km || ''}"></div>
        <div class="campo"><label for="e-motivo">Motivo da entrada</label>
          <input class="entrada" id="e-motivo" name="motivo_entrada" value="${esc(f.motivo_entrada || '')}"></div>
        <div class="campo"><label for="e-relato">Relato do motorista</label>
          <textarea class="area-texto" id="e-relato" name="relato_motorista" rows="3">${esc(f.relato_motorista || '')}</textarea></div>
        <div class="campo"><label for="e-diag">Diagnóstico do mecânico <span class="obrigatorio">*</span></label>
          <textarea class="area-texto" id="e-diag" name="diagnostico" rows="4">${esc(f.diagnostico || '')}</textarea></div>
        <div class="campo"><label for="e-serv">Serviços recomendados</label>
          <textarea class="area-texto" id="e-serv" name="servicos_recomendados" rows="3">${esc(f.servicos_recomendados || '')}</textarea></div>
        <div class="campo"><label>Prioridade</label>
          <div class="opcoes-toque gravidade">
            ${Object.entries(d.prioridades).map(([k, v]) => `
              <input type="radio" name="prioridade" id="e-prio-${k}" value="${k}" ${f.prioridade === k ? 'checked' : ''}>
              <label for="e-prio-${k}">${esc(v.rotulo)}</label>`).join('')}
          </div></div>
        <div class="campo"><label for="e-prazo">Prazo estimado</label>
          <input class="entrada" id="e-prazo" name="prazo_estimado" value="${esc(f.prazo_estimado || '')}"></div>
        ${admin ? `<div class="campo"><label for="e-obs">Observações internas</label>
          <textarea class="area-texto" id="e-obs" name="observacoes_internas" rows="3"
            placeholder="Visível apenas para a administração">${esc(f.observacoes_internas || '')}</textarea></div>` : ''}
      </form>`,
    rodape: `<button class="botao botao-contorno" data-fechar>Cancelar</button>
             <button class="botao botao-principal" data-salvar>Salvar</button>`,
  });

  elemento.querySelector('[data-salvar]').onclick = async (e) => {
    const form = elemento.querySelector('#form-editar-ficha');
    ocupado(e.target, true, 'Salvando…');
    try {
      await api.fichas.salvar(f.id, coletar(form));
      avisar('Ficha atualizada.', 'sucesso');
      fechar();
      recarregar();
    } catch (erro) { ocupado(e.target, false); avisarErro(erro); }
  };
}

function abrirEnvioFicha(f, recarregar) {
  const pendencias = [];
  if (!f.diagnostico) pendencias.push('Preencha o diagnóstico do mecânico.');
  if (!f.problemas.length) pendencias.push('Registre ao menos um problema encontrado.');

  const { elemento, fechar } = abrirModal({
    titulo: 'Enviar ficha para a administração',
    conteudo: `
      ${pendencias.length ? `
        <div class="faixa-alerta mb12">${icone('alerta', 19)}
          <div><b>Ainda falta:</b><ul style="margin:6px 0 0 16px">${pendencias.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>
        </div>` : `
        <div class="faixa-alerta sucesso mb12">${icone('certo', 19)}
          <div><b>Tudo pronto</b>${f.problemas.length} problema(s) e ${f.pecas.filter((p) => p.status !== 'cancelada').length} peça(s) serão enviados para análise.</div>
        </div>`}
      <p class="apoio mb12">Depois do envio a ficha fica bloqueada para edição até que a administração devolva para correção.</p>
      <form id="form-enviar">
        <div class="campo">
          <label for="assinatura">Confirmação do mecânico <span class="obrigatorio">*</span></label>
          <input class="entrada" id="assinatura" name="assinatura" value="${esc(estado.usuario.nome)}" required>
          <span class="dica">Digite seu nome para confirmar as informações da ficha.</span>
        </div>
      </form>`,
    rodape: `<button class="botao botao-contorno" data-fechar>Voltar</button>
             <button class="botao botao-principal" data-enviar ${pendencias.length ? 'disabled' : ''}>Enviar ficha</button>`,
  });

  elemento.querySelector('[data-enviar]').onclick = async (e) => {
    const assinatura = elemento.querySelector('#assinatura').value.trim();
    if (!assinatura) { avisar('Confirme com seu nome antes de enviar.', 'alerta'); return; }
    ocupado(e.target, true, 'Enviando…');
    try {
      await api.fichas.enviar(f.id, { assinatura });
      avisar('Ficha enviada para a administração.', 'sucesso');
      fechar();
      recarregar();
    } catch (erro) { ocupado(e.target, false); avisarErro(erro); }
  };
}

function abrirFormProblema(f, problema, recarregar) {
  const d = estado.dominios;
  const { elemento, fechar } = abrirModal({
    titulo: problema ? 'Editar problema' : 'Adicionar problema',
    conteudo: `
      <form id="form-problema" class="formulario">
        <div class="campo">
          <label for="p-titulo">Título do problema <span class="obrigatorio">*</span></label>
          <input class="entrada" id="p-titulo" name="titulo" required maxlength="160"
                 placeholder="Ex.: junta do cabeçote queimada" value="${esc(problema ? problema.titulo : '')}">
        </div>
        <div class="campo">
          <label for="p-sistema">Sistema do caminhão afetado <span class="obrigatorio">*</span></label>
          <select class="selecao" id="p-sistema" name="sistema" required>
            <option value="">Selecione o sistema</option>
            ${d.sistemas.map((s) => `<option value="${esc(s)}" ${problema && problema.sistema === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}
          </select>
        </div>
        <div class="campo">
          <label for="p-descricao">Descrição detalhada</label>
          <textarea class="area-texto" id="p-descricao" name="descricao" rows="3"
            placeholder="O que foi constatado, em quais condições…">${esc(problema ? problema.descricao || '' : '')}</textarea>
        </div>
        <div class="campo">
          <label>Gravidade</label>
          <div class="opcoes-toque gravidade">
            ${Object.entries(d.gravidades).map(([k, v]) => `
              <input type="radio" name="gravidade" id="p-grav-${k}" value="${k}"
                ${(problema ? problema.gravidade : 'media') === k ? 'checked' : ''}>
              <label for="p-grav-${k}">${esc(v.rotulo)}</label>`).join('')}
          </div>
        </div>
        <div class="campo">
          <label for="p-servico">Serviço necessário</label>
          <textarea class="area-texto" id="p-servico" name="servico_necessario" rows="2"
            placeholder="O que precisa ser feito para resolver">${esc(problema ? problema.servico_necessario || '' : '')}</textarea>
        </div>
        <label class="interruptor ${problema && problema.impede_uso ? 'alerta' : ''}">
          <input type="checkbox" name="impede_uso" ${problema && problema.impede_uso ? 'checked' : ''}>
          <span class="trilho"></span>
          <span class="conteudo"><b>Impede o uso do caminhão</b>
            <span class="mini">Marque se o veículo não pode rodar nessa condição</span></span>
        </label>
        ${campoFotos('fotos', problema ? 'Adicionar mais fotos do defeito' : 'Fotos do defeito')}
      </form>`,
    rodape: `<button class="botao botao-contorno" data-fechar>Cancelar</button>
             <button class="botao botao-principal" data-salvar>${problema ? 'Salvar' : 'Adicionar problema'}</button>`,
  });

  const fotos = ativarCampoFotos(elemento, 'fotos');
  const interruptor = elemento.querySelector('.interruptor input[name=impede_uso]');
  interruptor.onchange = () => interruptor.closest('.interruptor').classList.toggle('alerta', interruptor.checked);

  elemento.querySelector('[data-salvar]').onclick = async (e) => {
    const form = elemento.querySelector('#form-problema');
    if (!form.titulo.value.trim() || !form.sistema.value) {
      avisar('Informe o título e o sistema afetado.', 'alerta');
      return;
    }
    ocupado(e.target, true, 'Salvando…');
    try {
      const dados = coletar(form, fotos);
      if (problema) await api.problemas.salvar(problema.id, dados);
      else await api.problemas.criar(f.id, dados);
      avisar(problema ? 'Problema atualizado.' : 'Problema registrado.', 'sucesso');
      fechar();
      recarregar();
    } catch (erro) {
      ocupado(e.target, false);
      if (erro.campo) marcarErro(form, erro.campo, erro.message);
      avisarErro(erro);
    }
  };
}

async function abrirFormPeca(f, peca, recarregar) {
  const d = estado.dominios;
  const categorias = await carregarCategorias();

  const { elemento, fechar } = abrirModal({
    titulo: peca ? 'Editar peça' : 'Solicitar peça',
    conteudo: `
      <form id="form-peca" class="formulario">
        <div class="campo">
          <label for="pc-categoria">Categoria (sistema do caminhão) <span class="obrigatorio">*</span></label>
          <select class="selecao" id="pc-categoria" name="categoria_id" required>
            <option value="">Selecione a categoria</option>
            ${categorias.map((c) => `<option value="${c.id}" ${peca && peca.categoria_id === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}
          </select>
        </div>
        <div class="campo">
          <label for="pc-subcategoria">Subcategoria</label>
          <select class="selecao" id="pc-subcategoria" name="subcategoria_id">
            <option value="">Selecione a categoria primeiro</option>
          </select>
        </div>
        <div class="campo">
          <label for="pc-nome">Nome da peça <span class="obrigatorio">*</span></label>
          <input class="entrada" id="pc-nome" name="nome" required maxlength="160"
                 placeholder="Ex.: jogo de juntas do cabeçote" value="${esc(peca ? peca.nome : '')}">
        </div>
        <div class="campo">
          <label for="pc-descricao">Descrição detalhada</label>
          <textarea class="area-texto" id="pc-descricao" name="descricao" rows="2"
            placeholder="Detalhes que ajudam na cotação">${esc(peca ? peca.descricao || '' : '')}</textarea>
        </div>
        <div class="grade-2">
          <div class="campo">
            <label for="pc-quantidade">Quantidade <span class="obrigatorio">*</span></label>
            <input class="entrada" type="number" inputmode="decimal" step="0.01" min="0.01" id="pc-quantidade"
                   name="quantidade" required value="${peca ? peca.quantidade : 1}">
          </div>
          <div class="campo">
            <label for="pc-unidade">Unidade</label>
            <select class="selecao" id="pc-unidade" name="unidade">
              ${d.unidades.map((u) => `<option value="${u}" ${(peca ? peca.unidade : 'UN') === u ? 'selected' : ''}>${u}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="grade-2">
          <div class="campo">
            <label for="pc-codigo">Código ou referência</label>
            <input class="entrada" id="pc-codigo" name="codigo_referencia" placeholder="Ex.: JC-4587"
                   value="${esc(peca ? peca.codigo_referencia || '' : '')}">
          </div>
          <div class="campo">
            <label for="pc-marca">Marca preferencial</label>
            <input class="entrada" id="pc-marca" name="marca_preferencial" placeholder="Ex.: Sabó"
                   value="${esc(peca ? peca.marca_preferencial || '' : '')}">
          </div>
        </div>
        <div class="campo">
          <label for="pc-posicao">Lado ou posição</label>
          <select class="selecao" id="pc-posicao" name="posicao">
            ${d.posicoes.map((p) => `<option value="${esc(p)}" ${peca && peca.posicao === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}
          </select>
        </div>
        <div class="campo">
          <label>Tipo da peça</label>
          <div class="opcoes-toque">
            ${Object.entries(d.tipos_peca).map(([k, v]) => `
              <input type="radio" name="tipo_peca" id="pc-tipo-${k}" value="${k}"
                ${(peca ? peca.tipo_peca : 'indiferente') === k ? 'checked' : ''}>
              <label for="pc-tipo-${k}">${esc(v)}</label>`).join('')}
          </div>
        </div>
        <div class="campo">
          <label>Nível de urgência</label>
          <div class="opcoes-toque gravidade">
            ${Object.entries(d.urgencias).map(([k, v]) => `
              <input type="radio" name="urgencia" id="pc-urg-${k}" value="${k}"
                ${(peca ? peca.urgencia : 'normal') === k ? 'checked' : ''}>
              <label for="pc-urg-${k}">${esc(v.rotulo)}</label>`).join('')}
          </div>
        </div>
        <div class="campo">
          <label for="pc-motivo">Motivo da troca <span class="obrigatorio">*</span></label>
          <textarea class="area-texto" id="pc-motivo" name="motivo_troca" rows="2" required
            placeholder="Por que a peça precisa ser trocada">${esc(peca ? peca.motivo_troca : '')}</textarea>
        </div>
        ${f.problemas.length ? `
        <div class="campo">
          <label for="pc-problema">Problema relacionado</label>
          <select class="selecao" id="pc-problema" name="problema_id">
            <option value="">Sem vínculo</option>
            ${f.problemas.map((p) => `<option value="${p.id}" ${peca && peca.problema_id === p.id ? 'selected' : ''}>${esc(p.titulo)}</option>`).join('')}
          </select>
        </div>` : ''}
        <div class="campo">
          <label for="pc-obs">Observações do mecânico</label>
          <textarea class="area-texto" id="pc-obs" name="observacoes_mecanico" rows="2"
            placeholder="Informações extras para a administração">${esc(peca ? peca.observacoes_mecanico || '' : '')}</textarea>
        </div>
        ${campoFotos('fotos', peca ? 'Adicionar mais fotos' : 'Foto da peça ou do defeito')}
      </form>`,
    rodape: `<button class="botao botao-contorno" data-fechar>Cancelar</button>
             <button class="botao botao-principal" data-salvar>${peca ? 'Salvar' : 'Solicitar peça'}</button>`,
  });

  const fotos = ativarCampoFotos(elemento, 'fotos');
  const selCategoria = elemento.querySelector('#pc-categoria');
  const selSub = elemento.querySelector('#pc-subcategoria');

  const preencherSub = (categoriaId, selecionada) => {
    const cat = categorias.find((c) => c.id === Number(categoriaId));
    if (!cat || !cat.subcategorias.length) {
      selSub.innerHTML = '<option value="">Sem subcategorias</option>';
      return;
    }
    selSub.innerHTML = `<option value="">Sem subcategoria específica</option>` +
      cat.subcategorias.map((s) => `<option value="${s.id}" ${Number(selecionada) === s.id ? 'selected' : ''}>${esc(s.nome)}</option>`).join('');
  };
  selCategoria.onchange = () => preencherSub(selCategoria.value);
  if (peca && peca.categoria_id) preencherSub(peca.categoria_id, peca.subcategoria_id);

  elemento.querySelector('[data-salvar]').onclick = async (e) => {
    const form = elemento.querySelector('#form-peca');
    if (!form.categoria_id.value || !form.nome.value.trim() || !form.quantidade.value || !form.motivo_troca.value.trim()) {
      avisar('Preencha categoria, nome, quantidade e motivo da troca.', 'alerta');
      return;
    }
    ocupado(e.target, true, 'Salvando…');
    try {
      const dados = coletar(form, fotos);
      if (peca) await api.pecas.salvar(peca.id, dados);
      else await api.pecas.criar(f.id, dados);
      avisar(peca ? 'Peça atualizada.' : 'Peça solicitada.', 'sucesso');
      fechar();
      recarregar();
    } catch (erro) {
      ocupado(e.target, false);
      if (erro.campo) marcarErro(form, erro.campo, erro.message);
      avisarErro(erro);
    }
  };
}
