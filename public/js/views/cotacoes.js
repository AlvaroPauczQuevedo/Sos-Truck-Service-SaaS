/** Central de cotações e comparação de fornecedores. */
import { api } from '../api.js';
import { estado } from '../estado.js';
import {
  icone, selo, seloDominio, vazio, carregando, avisar, avisarErro, confirmar, abrirModal,
  coletarObjeto, marcarErro, ocupado, dado,
} from '../ui.js';
import {
  esc, placa as fPlaca, moeda, numero, data as fData, dataHora, quando, debounce,
  juntar, lerMoeda, hoje, paraCampoData, telefone as fTelefone, linkWhatsapp,
} from '../utils.js';

// ================================================================ Lista
export async function telaCotacoes(raiz, { irPara, consulta }) {
  const filtros = { busca: consulta.get('busca') || '', status: consulta.get('status') || '' };

  raiz.innerHTML = `
    <div class="pagina-cabecalho">
      <div class="texto">
        <h1 class="titulo">Central de cotações</h1>
        <p class="apoio">Registre as propostas dos fornecedores, compare valores e aprove a melhor opção.</p>
      </div>
    </div>
    <div id="pendentes"></div>

    <div class="barra-busca mt14">
      <div class="campo-busca">
        ${icone('busca', 18)}
        <input class="entrada" type="search" id="busca-cotacao" placeholder="Nº da cotação, ficha, placa ou empresa"
               value="${esc(filtros.busca)}" inputmode="search" autocomplete="off">
      </div>
    </div>

    <div class="fichas-rapidas" data-atalhos>
      <button class="ficha-rapida ${!filtros.status ? 'ativa' : ''}" data-status="">Todas</button>
      <button class="ficha-rapida ${filtros.status === 'aberta' ? 'ativa' : ''}" data-status="aberta">Em cotação</button>
      <button class="ficha-rapida ${filtros.status === 'aguardando_aprovacao' ? 'ativa' : ''}" data-status="aguardando_aprovacao">Aguardando aprovação</button>
      <button class="ficha-rapida ${filtros.status === 'aprovada' ? 'ativa' : ''}" data-status="aprovada">Aprovadas</button>
      <button class="ficha-rapida ${filtros.status === 'cancelada' ? 'ativa' : ''}" data-status="cancelada">Canceladas</button>
    </div>

    <div id="lista-cotacoes">${carregando(3)}</div>`;

  const areaPendentes = raiz.querySelector('#pendentes');
  const area = raiz.querySelector('#lista-cotacoes');

  async function desenharPendentes() {
    try {
      const { itens } = await api.cotacoes.pendentes();
      if (!itens.length) { areaPendentes.innerHTML = ''; return; }
      areaPendentes.innerHTML = `
        <h2 class="secao">Fichas prontas para cotar (${itens.length})</h2>
        <div class="lista">
          ${itens.map((f) => `
            <div class="cartao">
              <div class="cartao-corpo flex centro g10 quebra">
                <div class="crescer" style="min-width:0">
                  <div class="flex centro g8 quebra mb8">
                    <span class="numero-doc">${esc(f.numero)}</span>
                    ${seloDominio(estado.dominios.prioridades, f.prioridade)}
                  </div>
                  <div class="flex centro g8 quebra">
                    <span class="etiqueta-placa">${esc(fPlaca(f.placa))}</span>
                    <span class="mini">${esc(juntar([f.empresa_nome, f.mecanico_nome,
                      `${f.pecas_aguardando} peça(s)`, `enviada ${quando(f.enviada_em)}`]))}</span>
                  </div>
                </div>
                <button class="botao botao-principal botao-pequeno" data-criar="${f.id}">
                  ${icone('cotacao', 15)} Criar cotação</button>
              </div>
            </div>`).join('')}
        </div>`;
      areaPendentes.querySelectorAll('[data-criar]').forEach((b) => {
        b.onclick = async () => {
          ocupado(b, true, 'Criando…');
          try {
            const r = await api.cotacoes.criar({ ficha_id: Number(b.dataset.criar) });
            irPara(`#/cotacoes/${r.cotacao.id}`);
          } catch (erro) {
            ocupado(b, false);
            if (erro.detalhes && erro.detalhes.cotacao_id) irPara(`#/cotacoes/${erro.detalhes.cotacao_id}`);
            else avisarErro(erro);
          }
        };
      });
    } catch (_) { areaPendentes.innerHTML = ''; }
  }

  async function desenhar() {
    area.innerHTML = carregando(3);
    try {
      const { itens } = await api.cotacoes.listar(filtros);
      area.innerHTML = itens.length ? `
        <div class="lista">
          ${itens.map((c) => `
            <div class="cartao cartao-clicavel" data-ir="#/cotacoes/${c.id}">
              <div class="cartao-corpo">
                <div class="flex entre centro g8 quebra mb8">
                  <span class="numero-doc">${esc(c.numero)}</span>
                  ${seloDominio(estado.dominios.status_cotacao, c.status)}
                </div>
                <div class="flex centro g8 quebra mb8">
                  <span class="etiqueta-placa">${esc(fPlaca(c.placa))}</span>
                  <span class="mini">${esc(c.ficha_numero)} · ${esc(c.empresa_nome || 'Sem empresa')}</span>
                </div>
                <div class="flex entre centro g8 quebra">
                  <span class="mini">${c.total_pecas} peça(s) · ${c.total_propostas} proposta(s) ·
                    ${c.total_selecionadas} escolhida(s)</span>
                  ${c.total_geral ? `<span class="negrito tabular">${moeda(c.total_geral)}</span>` : ''}
                </div>
              </div>
            </div>`).join('')}
        </div>` : vazio({
          icone: 'cotacao', titulo: 'Nenhuma cotação encontrada',
          texto: 'As cotações aparecem aqui assim que forem criadas a partir das fichas.',
        });
      area.querySelectorAll('[data-ir]').forEach((el) => { el.onclick = () => irPara(el.dataset.ir); });
    } catch (erro) {
      avisarErro(erro);
      area.innerHTML = '<p class="apoio">Não foi possível carregar as cotações.</p>';
    }
  }

  raiz.querySelector('#busca-cotacao').oninput = debounce((e) => { filtros.busca = e.target.value.trim(); desenhar(); }, 350);
  raiz.querySelectorAll('[data-atalhos] .ficha-rapida').forEach((b) => {
    b.onclick = () => {
      raiz.querySelectorAll('[data-atalhos] .ficha-rapida').forEach((x) => x.classList.remove('ativa'));
      b.classList.add('ativa');
      filtros.status = b.dataset.status;
      desenhar();
    };
  });

  await Promise.all([desenharPendentes(), desenhar()]);
}

// ================================================================ Comparação
export async function telaCotacaoDetalhe(raiz, { partes, irPara, recarregar }) {
  const id = Number(partes[0]);
  const [dados, { itens: fornecedores }] = await Promise.all([
    api.cotacoes.obter(id), api.fornecedores.listar(),
  ]);
  const { cotacao, ficha, itens, resumo } = dados;
  const d = estado.dominios;
  const editavel = cotacao.status === 'aberta' || cotacao.status === 'aguardando_aprovacao';

  raiz.innerHTML = `
    <div class="cartao mb12">
      <div class="cartao-corpo">
        <div class="flex entre centro g8 quebra mb12">
          <div>
            <div class="numero-doc" style="font-size:17px">${esc(cotacao.numero)}</div>
            <div class="mini">Criada em ${dataHora(cotacao.criado_em)}</div>
          </div>
          ${seloDominio(d.status_cotacao, cotacao.status, 'selo-grande')}
        </div>
        <div class="flex centro g8 quebra mb12">
          <a class="numero-doc" href="#/fichas/${ficha.id}">${esc(ficha.numero)}</a>
          <a class="etiqueta-placa" href="#/caminhoes/${ficha.caminhao_id}" style="color:#fff">${esc(fPlaca(ficha.placa))}</a>
          ${ficha.codigo_frota ? `<span class="etiqueta-frota">${esc(ficha.codigo_frota)}</span>` : ''}
          ${seloDominio(d.prioridades, ficha.prioridade)}
        </div>
        <div class="dados-grade">
          ${dado('Caminhão', esc([ficha.marca, ficha.modelo].filter(Boolean).join(' ') || '—'))}
          ${dado('Empresa', esc(ficha.empresa_nome || '—'))}
          ${dado('Mecânico', esc(ficha.mecanico_nome))}
          ${dado('Peças na cotação', `${resumo.total_pecas}`)}
          ${dado('Fornecedores escolhidos', `${resumo.fornecedores.length}`)}
          ${cotacao.aprovada_em ? dado('Aprovada em', dataHora(cotacao.aprovada_em)) : ''}
        </div>
        ${cotacao.observacoes ? `<div class="mt14"><div class="rotulo-campo">Observações</div>
          <div class="texto-bloco mt6">${esc(cotacao.observacoes)}</div></div>` : ''}
      </div>
    </div>

    <div class="colunas-detalhe">
      <div>
        <h2 class="secao">Peças e propostas</h2>
        <div id="lista-itens">
          ${itens.map((item) => blocoPecaCotacao(item, editavel, cotacao)).join('')}
        </div>
      </div>

      <div>
        <div class="resumo-totais mb12">
          <div class="linha"><span>Peças com proposta</span><span class="valor">${resumo.pecas_com_proposta} de ${resumo.total_pecas}</span></div>
          <div class="linha"><span>Fornecedores escolhidos</span><span class="valor">${resumo.pecas_selecionadas} peça(s)</span></div>
          <div class="linha"><span>Somando as mais baratas</span><span class="valor">${moeda(resumo.total_menor_valor)}</span></div>
          ${resumo.economia_total > 0
            ? `<div class="linha"><span>Diferença entre a melhor e a pior</span><span class="valor economia">${moeda(resumo.economia_total)}</span></div>` : ''}
          <div class="linha total"><span>Total selecionado</span><span class="valor">${moeda(resumo.total_geral)}</span></div>
        </div>

        ${resumo.fornecedores.length ? `
        <div class="cartao mb12">
          <div class="cartao-topo"><h3>Total por fornecedor</h3></div>
          <div class="cartao-corpo">
            ${resumo.fornecedores.map((f) => `
              <div class="linha-info">
                <span class="rot">${esc(f.fornecedor_nome)}<div class="mini">${f.itens} item(ns)${f.prazo_entrega_dias ? ` · ${f.prazo_entrega_dias} dia(s)` : ''}</div></span>
                <span class="val tabular">${moeda(f.total)}</span>
              </div>`).join('')}
          </div>
        </div>` : ''}

        <div class="cartao mb12">
          <div class="cartao-topo"><h3>Ações</h3></div>
          <div class="cartao-corpo botoes-empilhados">
            ${cotacao.status === 'aberta' ? `
              <button class="botao botao-escuro botao-bloco" data-enviar-aprovacao>${icone('enviar', 17)} Enviar para aprovação</button>` : ''}
            ${['aberta', 'aguardando_aprovacao'].includes(cotacao.status) ? `
              <button class="botao botao-principal botao-grande botao-bloco" data-aprovar>${icone('certo', 18)} Aprovar cotação</button>` : ''}
            ${cotacao.status === 'aprovada' ? `
              <button class="botao botao-principal botao-grande botao-bloco" data-gerar-oc>${icone('ordem', 18)} Gerar ordem de compra</button>` : ''}
            <button class="botao botao-contorno botao-bloco" data-observacoes>${icone('lapis', 17)} Editar observações</button>
            <a class="botao botao-contorno botao-bloco" href="#/fichas/${ficha.id}">${icone('ficha', 17)} Abrir ficha</a>
            ${cotacao.status !== 'cancelada' && cotacao.status !== 'aprovada' ? `
              <button class="botao botao-perigo botao-bloco" data-cancelar>Cancelar cotação</button>` : ''}
          </div>
        </div>
      </div>
    </div>`;

  ligarAcoesCotacao(raiz, { cotacao, ficha, itens, resumo, fornecedores, irPara, recarregar });
}

function blocoPecaCotacao(item, editavel, cotacao) {
  const d = estado.dominios;
  return `
  <div class="peca-cotacao">
    <div class="peca-cotacao-topo">
      <div class="flex entre centro g8 quebra mb8">
        <h3 class="sub crescer">${esc(item.nome)}</h3>
        <div class="flex g6 quebra">
          ${seloDominio(d.urgencias, item.urgencia)}
          ${seloDominio(d.status_peca, item.status)}
        </div>
      </div>
      <div class="mini">${esc(juntar([
        juntar([item.categoria_nome, item.subcategoria_nome], ' › '),
        `${numero(item.quantidade, 2)} ${item.unidade}`,
        item.codigo_referencia ? `ref. ${item.codigo_referencia}` : null,
        item.marca_preferencial ? `marca ${item.marca_preferencial}` : null,
        item.posicao,
        d.tipos_peca[item.tipo_peca],
      ]))}</div>
      ${item.descricao ? `<div class="apoio mt6">${esc(item.descricao)}</div>` : ''}
      ${item.economia_possivel > 0 ? `
        <div class="mini mt6 cor-verde negrito">
          Diferença entre a proposta mais barata e a mais cara: ${moeda(item.economia_possivel)}
        </div>` : ''}
    </div>
    <div class="cartao-corpo">
      ${item.propostas.length ? item.propostas.map((p) => blocoProposta(p, item, editavel)).join('')
        : '<p class="apoio">Nenhuma proposta registrada para esta peça.</p>'}
      ${editavel ? `
        <button class="botao botao-contorno botao-bloco mt10" data-nova-proposta="${item.id}">
          ${icone('mais', 16)} Adicionar proposta
        </button>` : ''}
    </div>
  </div>`;
}

function blocoProposta(p, item, editavel) {
  const zap = linkWhatsapp(p.vendedor_telefone || p.fornecedor_whatsapp,
    `Olá ${p.vendedor_nome || ''}, sobre a peça ${item.nome}...`);
  return `
  <div class="proposta ${p.selecionada ? 'escolhida' : p.menor_valor ? 'menor' : ''}">
    ${p.selecionada ? '<span class="faixa-escolhida">ESCOLHIDA</span>'
      : p.menor_valor ? '<span class="faixa-menor">MENOR VALOR</span>' : ''}
    <div class="proposta-cabecalho">
      <div class="crescer" style="min-width:0">
        <div class="negrito">${esc(p.fornecedor_nome)}</div>
        <div class="mini">${esc(juntar([
          p.marca_oferecida ? `Marca: ${p.marca_oferecida}` : null,
          p.codigo_peca ? `Cód.: ${p.codigo_peca}` : null,
          p.disponibilidade,
        ]))}</div>
      </div>
      <div class="direita">
        <div class="proposta-total ${p.menor_valor ? 'cor-verde' : ''}">${moeda(p.valor_total)}</div>
        ${p.diferenca_menor > 0
          ? `<div class="mini">+ ${moeda(p.diferenca_menor)} (${numero(p.diferenca_percentual, 1)}%)</div>`
          : '<div class="mini cor-verde">melhor preço</div>'}
      </div>
    </div>
    <div class="proposta-detalhes">
      ${dado('Valor unitário', moeda(p.valor_unitario))}
      ${dado('Quantidade', numero(p.quantidade, 2))}
      ${p.desconto ? dado('Desconto', `- ${moeda(p.desconto)}`) : ''}
      ${p.frete ? dado('Frete', moeda(p.frete)) : ''}
      ${dado('Prazo', p.prazo_entrega_dias !== null && p.prazo_entrega_dias !== undefined ? `${p.prazo_entrega_dias} dia(s)` : '—')}
      ${p.forma_pagamento ? dado('Pagamento', esc(p.forma_pagamento)) : ''}
      ${p.garantia ? dado('Garantia', esc(p.garantia)) : ''}
      ${p.validade ? dado('Validade', fData(p.validade)) : ''}
      ${p.vendedor_nome ? dado('Vendedor', esc(p.vendedor_nome)) : ''}
      ${p.vendedor_telefone ? dado('Contato', `${esc(fTelefone(p.vendedor_telefone))}${zap ? ` · <a href="${esc(zap)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}`) : ''}
    </div>
    ${p.observacoes ? `<div class="mini mt10">${esc(p.observacoes)}</div>` : ''}
    <div class="botoes-linha mt10">
      ${editavel ? `
        <button class="botao ${p.selecionada ? 'botao-vermelho-claro' : 'botao-principal'} botao-pequeno" data-selecionar="${p.id}">
          ${icone('certo', 15)} ${p.selecionada ? 'Remover escolha' : 'Escolher este fornecedor'}
        </button>
        <button class="botao botao-texto botao-pequeno" data-editar-proposta="${p.id}">${icone('lapis', 14)} Editar</button>
        <button class="botao botao-texto botao-pequeno cor-vermelho" data-excluir-proposta="${p.id}">${icone('lixeira', 14)} Excluir</button>
      ` : p.selecionada ? '<span class="mini negrito cor-vermelho">Fornecedor aprovado para esta peça</span>' : ''}
    </div>
  </div>`;
}

function ligarAcoesCotacao(raiz, ctx) {
  const { cotacao, ficha, itens, resumo, fornecedores, irPara, recarregar } = ctx;
  const acao = (sel, fn) => raiz.querySelectorAll(sel).forEach((b) => { b.onclick = () => fn(b); });
  const tentar = async (fn, sucesso) => {
    try { await fn(); if (sucesso) avisar(sucesso, 'sucesso'); recarregar(); }
    catch (erro) { avisarErro(erro); }
  };

  acao('[data-nova-proposta]', (b) => {
    const item = itens.find((i) => i.id === Number(b.dataset.novaProposta));
    abrirFormProposta({ cotacao, item, fornecedores, proposta: null, recarregar });
  });
  acao('[data-editar-proposta]', (b) => {
    const id = Number(b.dataset.editarProposta);
    let item = null; let proposta = null;
    for (const i of itens) {
      const p = i.propostas.find((x) => x.id === id);
      if (p) { item = i; proposta = p; break; }
    }
    abrirFormProposta({ cotacao, item, fornecedores, proposta, recarregar });
  });
  acao('[data-selecionar]', (b) => tentar(() => api.cotacoes.selecionar(Number(b.dataset.selecionar))));
  acao('[data-excluir-proposta]', async (b) => {
    const ok = await confirmar({
      titulo: 'Excluir proposta',
      mensagem: 'A proposta será removida desta cotação. Deseja continuar?',
      confirmarTexto: 'Excluir',
    });
    if (ok) tentar(() => api.cotacoes.excluirProposta(Number(b.dataset.excluirProposta)), 'Proposta removida.');
  });

  acao('[data-enviar-aprovacao]', async () => {
    const ok = await confirmar({
      titulo: 'Enviar para aprovação',
      mensagem: 'A cotação passa para a fase de aprovação. Você ainda poderá ajustar as escolhas.',
      confirmarTexto: 'Enviar', tipo: 'neutro',
    });
    if (ok) tentar(() => api.cotacoes.enviarAprovacao(cotacao.id), 'Cotação enviada para aprovação.');
  });

  acao('[data-aprovar]', async () => {
    if (!resumo.pecas_selecionadas) {
      avisar('Escolha ao menos um fornecedor antes de aprovar.', 'alerta');
      return;
    }
    const semEscolha = itens.filter((i) => !i.selecionada && i.total_propostas > 0).length;
    const ok = await confirmar({
      titulo: 'Aprovar cotação',
      mensagem: semEscolha
        ? `${semEscolha} peça(s) ainda estão sem fornecedor escolhido e ficarão de fora. Total aprovado: ${moeda(resumo.total_geral)}. Confirma?`
        : `Serão aprovadas ${resumo.pecas_selecionadas} peça(s), no total de ${moeda(resumo.total_geral)}. Confirma?`,
      confirmarTexto: 'Aprovar cotação', tipo: 'neutro',
    });
    if (ok) tentar(() => api.cotacoes.aprovar(cotacao.id, { confirmar: true }), 'Cotação aprovada.');
  });

  acao('[data-gerar-oc]', () => abrirGeracaoOrdem(cotacao, irPara));

  acao('[data-observacoes]', () => {
    const { elemento, fechar } = abrirModal({
      titulo: 'Observações da cotação',
      conteudo: `<div class="campo"><label for="c-obs">Observações</label>
        <textarea class="area-texto" id="c-obs" rows="4">${esc(cotacao.observacoes || '')}</textarea></div>`,
      rodape: `<button class="botao botao-contorno" data-fechar>Cancelar</button>
               <button class="botao botao-principal" data-salvar>Salvar</button>`,
    });
    elemento.querySelector('[data-salvar]').onclick = async (e) => {
      ocupado(e.target, true, 'Salvando…');
      try {
        await api.cotacoes.salvar(cotacao.id, { observacoes: elemento.querySelector('#c-obs').value });
        fechar(); recarregar();
      } catch (erro) { ocupado(e.target, false); avisarErro(erro); }
    };
  });

  acao('[data-cancelar]', async () => {
    const r = await confirmar({
      titulo: 'Cancelar cotação',
      mensagem: 'As peças voltam para a fila de cotação. O registro permanece no histórico.',
      confirmarTexto: 'Cancelar cotação', pedirMotivo: true, rotuloMotivo: 'Motivo do cancelamento',
    });
    if (r) tentar(() => api.cotacoes.cancelar(cotacao.id, { motivo: r.motivo, confirmar: true }), 'Cotação cancelada.');
  });
}

// ---------------------------------------------------------------- Proposta
function abrirFormProposta({ cotacao, item, fornecedores, proposta, recarregar }) {
  const d = estado.dominios;
  const { elemento, fechar } = abrirModal({
    titulo: proposta ? 'Editar proposta' : `Adicionar proposta — ${item.nome}`,
    conteudo: `
      <form id="form-proposta" class="formulario">
        <div class="faixa-alerta info">${icone('info', 18)}
          <div><b>${esc(item.nome)}</b>Quantidade solicitada: ${numero(item.quantidade, 2)} ${esc(item.unidade)}
          ${item.marca_preferencial ? ` · marca preferida: ${esc(item.marca_preferencial)}` : ''}</div></div>

        <div class="campo">
          <label for="pr-fornecedor">Fornecedor <span class="obrigatorio">*</span></label>
          <select class="selecao" id="pr-fornecedor" name="fornecedor_id" required>
            <option value="">Selecione o fornecedor</option>
            ${fornecedores.map((f) => `<option value="${f.id}"
              data-vendedor="${esc(f.vendedor || '')}" data-telefone="${esc(f.whatsapp || f.telefone || '')}"
              data-pagamento="${esc(f.condicoes_pagamento || '')}" data-prazo="${f.prazo_medio_dias || ''}"
              ${proposta && proposta.fornecedor_id === f.id ? 'selected' : ''}>${esc(f.nome)}</option>`).join('')}
          </select>
          <span class="dica">Cadastre novos fornecedores em <a href="#/fornecedores">Fornecedores</a>.</span>
        </div>

        <div class="grade-2">
          <div class="campo">
            <label for="pr-marca">Marca oferecida</label>
            <input class="entrada" id="pr-marca" name="marca_oferecida" value="${esc(proposta ? proposta.marca_oferecida || '' : '')}">
          </div>
          <div class="campo">
            <label for="pr-codigo">Código da peça</label>
            <input class="entrada" id="pr-codigo" name="codigo_peca" value="${esc(proposta ? proposta.codigo_peca || '' : '')}">
          </div>
        </div>

        <div class="grade-2">
          <div class="campo">
            <label for="pr-quantidade">Quantidade</label>
            <input class="entrada" type="number" step="0.01" min="0.01" inputmode="decimal" id="pr-quantidade"
                   name="quantidade" value="${proposta ? proposta.quantidade : item.quantidade}">
          </div>
          <div class="campo">
            <label for="pr-unitario">Valor unitário (R$) <span class="obrigatorio">*</span></label>
            <input class="entrada entrada-moeda" id="pr-unitario" name="valor_unitario" inputmode="decimal" required
                   placeholder="0,00" value="${proposta ? String(proposta.valor_unitario).replace('.', ',') : ''}">
          </div>
        </div>

        <div class="grade-2">
          <div class="campo">
            <label for="pr-desconto">Desconto (R$)</label>
            <input class="entrada entrada-moeda" id="pr-desconto" name="desconto" inputmode="decimal"
                   placeholder="0,00" value="${proposta && proposta.desconto ? String(proposta.desconto).replace('.', ',') : ''}">
          </div>
          <div class="campo">
            <label for="pr-frete">Frete (R$)</label>
            <input class="entrada entrada-moeda" id="pr-frete" name="frete" inputmode="decimal"
                   placeholder="0,00" value="${proposta && proposta.frete ? String(proposta.frete).replace('.', ',') : ''}">
          </div>
        </div>

        <div class="resumo-totais" data-previa-total>
          <div class="linha"><span>Subtotal</span><span class="valor" data-p-subtotal>R$ 0,00</span></div>
          <div class="linha"><span>Desconto</span><span class="valor" data-p-desconto>R$ 0,00</span></div>
          <div class="linha"><span>Frete</span><span class="valor" data-p-frete>R$ 0,00</span></div>
          <div class="linha total"><span>Total da proposta</span><span class="valor" data-p-total>R$ 0,00</span></div>
        </div>

        <div class="grade-2">
          <div class="campo">
            <label for="pr-prazo">Prazo de entrega (dias)</label>
            <input class="entrada" type="number" min="0" inputmode="numeric" id="pr-prazo" name="prazo_entrega_dias"
                   value="${proposta && proposta.prazo_entrega_dias !== null ? proposta.prazo_entrega_dias : ''}">
          </div>
          <div class="campo">
            <label for="pr-disponibilidade">Disponibilidade</label>
            <select class="selecao" id="pr-disponibilidade" name="disponibilidade">
              ${d.disponibilidades.map((x) => `<option value="${esc(x)}"
                ${(proposta ? proposta.disponibilidade : 'Em estoque') === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="campo">
          <label for="pr-pagamento">Forma de pagamento</label>
          <input class="entrada" id="pr-pagamento" name="forma_pagamento" list="lista-pagamento"
                 value="${esc(proposta ? proposta.forma_pagamento || '' : '')}">
          <datalist id="lista-pagamento">${d.formas_pagamento.map((p) => `<option value="${esc(p)}">`).join('')}</datalist>
        </div>

        <div class="grade-2">
          <div class="campo">
            <label for="pr-garantia">Garantia</label>
            <input class="entrada" id="pr-garantia" name="garantia" placeholder="Ex.: 6 meses"
                   value="${esc(proposta ? proposta.garantia || '' : '')}">
          </div>
          <div class="campo">
            <label for="pr-validade">Validade da proposta</label>
            <input class="entrada" type="date" id="pr-validade" name="validade"
                   value="${proposta && proposta.validade ? paraCampoData(proposta.validade) : ''}">
          </div>
        </div>

        <div class="grade-2">
          <div class="campo">
            <label for="pr-data">Data da cotação</label>
            <input class="entrada" type="date" id="pr-data" name="data_cotacao"
                   value="${proposta && proposta.data_cotacao ? paraCampoData(proposta.data_cotacao) : hoje()}">
          </div>
          <div class="campo">
            <label for="pr-vendedor">Nome do vendedor</label>
            <input class="entrada" id="pr-vendedor" name="vendedor_nome" value="${esc(proposta ? proposta.vendedor_nome || '' : '')}">
          </div>
        </div>

        <div class="campo">
          <label for="pr-telefone">Telefone / WhatsApp do vendedor</label>
          <input class="entrada" id="pr-telefone" name="vendedor_telefone" inputmode="tel"
                 value="${esc(proposta ? proposta.vendedor_telefone || '' : '')}">
        </div>

        <div class="campo">
          <label for="pr-obs">Observações</label>
          <textarea class="area-texto" id="pr-obs" name="observacoes" rows="2">${esc(proposta ? proposta.observacoes || '' : '')}</textarea>
        </div>
      </form>`,
    rodape: `<button class="botao botao-contorno" data-fechar>Cancelar</button>
             <button class="botao botao-principal" data-salvar>${proposta ? 'Salvar proposta' : 'Adicionar proposta'}</button>`,
  });

  const form = elemento.querySelector('#form-proposta');
  const calcular = () => {
    const qtd = Number(form.quantidade.value) || 0;
    const unit = lerMoeda(form.valor_unitario.value);
    const desc = lerMoeda(form.desconto.value);
    const frete = lerMoeda(form.frete.value);
    const subtotal = qtd * unit;
    elemento.querySelector('[data-p-subtotal]').textContent = moeda(subtotal);
    elemento.querySelector('[data-p-desconto]').textContent = `- ${moeda(desc)}`;
    elemento.querySelector('[data-p-frete]').textContent = moeda(frete);
    elemento.querySelector('[data-p-total]').textContent = moeda(subtotal - desc + frete);
  };
  ['quantidade', 'valor_unitario', 'desconto', 'frete'].forEach((nome) => {
    form[nome].addEventListener('input', calcular);
  });
  calcular();

  // Preenche automaticamente os dados do fornecedor escolhido.
  form.fornecedor_id.onchange = () => {
    const opcao = form.fornecedor_id.selectedOptions[0];
    if (!opcao || !opcao.value) return;
    if (!form.vendedor_nome.value) form.vendedor_nome.value = opcao.dataset.vendedor || '';
    if (!form.vendedor_telefone.value) form.vendedor_telefone.value = opcao.dataset.telefone || '';
    if (!form.forma_pagamento.value) form.forma_pagamento.value = opcao.dataset.pagamento || '';
    if (!form.prazo_entrega_dias.value) form.prazo_entrega_dias.value = opcao.dataset.prazo || '';
    calcular();
  };

  elemento.querySelector('[data-salvar]').onclick = async (e) => {
    if (!form.fornecedor_id.value || !form.valor_unitario.value) {
      avisar('Informe o fornecedor e o valor unitário.', 'alerta');
      return;
    }
    const dados = {
      ...coletarObjeto(form),
      peca_id: item.id,
      valor_unitario: lerMoeda(form.valor_unitario.value),
      desconto: lerMoeda(form.desconto.value),
      frete: lerMoeda(form.frete.value),
      quantidade: Number(form.quantidade.value) || item.quantidade,
    };
    ocupado(e.target, true, 'Salvando…');
    try {
      if (proposta) await api.cotacoes.salvarProposta(proposta.id, dados);
      else await api.cotacoes.adicionarProposta(cotacao.id, dados);
      avisar(proposta ? 'Proposta atualizada.' : 'Proposta adicionada.', 'sucesso');
      fechar();
      recarregar();
    } catch (erro) {
      ocupado(e.target, false);
      if (erro.campo) marcarErro(form, erro.campo, erro.message);
      avisarErro(erro);
    }
  };
}

// ---------------------------------------------------------------- Gerar ordem
export async function abrirGeracaoOrdem(cotacao, irPara) {
  const { grupos, ficha } = await api.ordens.previa(cotacao.id);
  const d = estado.dominios;

  if (!grupos.length) {
    avisar('Todas as peças aprovadas desta cotação já possuem ordem de compra.', 'alerta');
    return;
  }

  const { elemento, fechar } = abrirModal({
    titulo: 'Gerar ordem de compra',
    conteudo: `
      <p class="apoio mb12">As peças aprovadas foram agrupadas por fornecedor. Gere uma ordem para cada um.</p>
      <div class="lista">
        ${grupos.map((g) => `
          <div class="cartao" data-grupo="${g.fornecedor_id}">
            <div class="cartao-corpo">
              <div class="flex entre centro g8 quebra mb8">
                <h3 class="sub crescer">${esc(g.fornecedor_nome)}</h3>
                <span class="negrito tabular">${moeda(g.total)}</span>
              </div>
              <div class="mini mb8">${g.itens.length} item(ns)${g.prazo_entrega_dias ? ` · prazo ${g.prazo_entrega_dias} dia(s)` : ''}
                ${g.forma_pagamento ? ` · ${esc(g.forma_pagamento)}` : ''}</div>
              <div class="tabela-rolagem mb12">
                <table class="tabela">
                  <thead><tr><th>Peça</th><th class="num">Qtd</th><th class="num">Unit.</th><th class="num">Total</th></tr></thead>
                  <tbody>
                    ${g.itens.map((i) => `<tr>
                      <td>${esc(i.descricao)}${i.marca ? `<div class="mini">${esc(i.marca)}</div>` : ''}</td>
                      <td class="num">${numero(i.quantidade, 2)}</td>
                      <td class="num">${moeda(i.valor_unitario)}</td>
                      <td class="num negrito">${moeda(i.total)}</td></tr>`).join('')}
                  </tbody>
                </table>
              </div>
              <div class="grade-2">
                <div class="campo"><label>Forma de pagamento</label>
                  <input class="entrada" data-pagamento list="pag-oc" value="${esc(g.forma_pagamento || '')}"></div>
                <div class="campo"><label>Previsão de entrega</label>
                  <input class="entrada" type="date" data-previsao
                    value="${g.prazo_entrega_dias ? new Date(Date.now() + g.prazo_entrega_dias * 86400000).toISOString().slice(0, 10) : ''}"></div>
              </div>
              <div class="campo"><label>Observações</label>
                <input class="entrada" data-observacoes placeholder="Instruções para o fornecedor"></div>
              <button class="botao botao-principal botao-bloco mt10" data-emitir="${g.fornecedor_id}">
                ${icone('ordem', 17)} Emitir ordem para ${esc(g.fornecedor_nome)}
              </button>
            </div>
          </div>`).join('')}
      </div>
      <datalist id="pag-oc">${d.formas_pagamento.map((p) => `<option value="${esc(p)}">`).join('')}</datalist>`,
    rodape: `<button class="botao botao-contorno" data-fechar>Fechar</button>`,
    largura: '720px',
  });

  elemento.querySelectorAll('[data-emitir]').forEach((b) => {
    b.onclick = async () => {
      const bloco = b.closest('[data-grupo]');
      ocupado(b, true, 'Emitindo…');
      try {
        const ordem = await api.ordens.criar({
          cotacao_id: cotacao.id,
          fornecedor_id: Number(b.dataset.emitir),
          forma_pagamento: bloco.querySelector('[data-pagamento]').value,
          previsao_entrega: bloco.querySelector('[data-previsao]').value,
          observacoes: bloco.querySelector('[data-observacoes]').value,
        });
        avisar(`Ordem ${ordem.numero} emitida.`, 'sucesso');
        fechar();
        irPara(`#/ordens/${ordem.id}`);
      } catch (erro) { ocupado(b, false); avisarErro(erro); }
    };
  });
}
