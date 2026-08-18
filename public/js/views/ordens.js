/** Ordens de compra, acompanhamento e controle de recebimento. */
import { api } from '../api.js';
import { estado } from '../estado.js';
import {
  icone, selo, seloDominio, vazio, carregando, avisar, avisarErro, confirmar, abrirModal,
  ocupado, dado, eventoHistorico, coletarObjeto,
} from '../ui.js';
import {
  esc, placa as fPlaca, moeda, numero, data as fData, dataHora, quando, debounce,
  juntar, telefone as fTelefone, documento as fDoc, linkWhatsapp, diasAte, paraCampoData,
} from '../utils.js';

// ================================================================ Lista
export async function telaOrdens(raiz, { irPara, consulta }) {
  const filtros = {
    busca: consulta.get('busca') || '',
    status: consulta.get('status') || '',
    atrasadas: consulta.get('atrasadas') || '',
  };

  raiz.innerHTML = `
    <div class="pagina-cabecalho">
      <div class="texto">
        <h1 class="titulo">Ordens de compra</h1>
        <p class="apoio">Acompanhe a emissão, a confirmação e a entrega das compras.</p>
      </div>
    </div>

    <div class="barra-busca">
      <div class="campo-busca">
        ${icone('busca', 18)}
        <input class="entrada" type="search" id="busca-ordem" placeholder="Nº da ordem, ficha, placa ou fornecedor"
               value="${esc(filtros.busca)}" inputmode="search" autocomplete="off">
      </div>
    </div>

    <div class="fichas-rapidas" data-atalhos>
      <button class="ficha-rapida ${!filtros.status && !filtros.atrasadas ? 'ativa' : ''}" data-status="">Todas</button>
      <button class="ficha-rapida ${filtros.status === 'emitida,enviada,confirmada' ? 'ativa' : ''}" data-status="emitida,enviada,confirmada">Em aberto</button>
      <button class="ficha-rapida ${filtros.atrasadas === '1' ? 'ativa' : ''}" data-atrasadas="1">Atrasadas</button>
      <button class="ficha-rapida ${filtros.status === 'parcial' ? 'ativa' : ''}" data-status="parcial">Recebimento parcial</button>
      <button class="ficha-rapida ${filtros.status === 'recebida' ? 'ativa' : ''}" data-status="recebida">Recebidas</button>
      <button class="ficha-rapida ${filtros.status === 'cancelada' ? 'ativa' : ''}" data-status="cancelada">Canceladas</button>
    </div>

    <div id="lista-ordens">${carregando(3)}</div>`;

  const area = raiz.querySelector('#lista-ordens');

  async function desenhar() {
    area.innerHTML = carregando(3);
    try {
      const { itens } = await api.ordens.listar(filtros);
      if (!itens.length) {
        area.innerHTML = vazio({
          icone: 'ordem', titulo: 'Nenhuma ordem encontrada',
          texto: 'As ordens de compra são geradas a partir das cotações aprovadas.',
        });
        return;
      }
      const total = itens.filter((o) => o.status !== 'cancelada').reduce((s, o) => s + o.total, 0);
      area.innerHTML = `
        <div class="flex entre centro mb8">
          <span class="mini">${numero(itens.length)} ordem(ns)</span>
          <span class="mini negrito">Total: ${moeda(total)}</span>
        </div>
        <div class="lista">${itens.map(cartaoOrdem).join('')}</div>`;
      area.querySelectorAll('[data-ir]').forEach((el) => { el.onclick = () => irPara(el.dataset.ir); });
    } catch (erro) {
      avisarErro(erro);
      area.innerHTML = '<p class="apoio">Não foi possível carregar as ordens.</p>';
    }
  }

  raiz.querySelector('#busca-ordem').oninput = debounce((e) => { filtros.busca = e.target.value.trim(); desenhar(); }, 350);
  raiz.querySelectorAll('[data-atalhos] .ficha-rapida').forEach((b) => {
    b.onclick = () => {
      raiz.querySelectorAll('[data-atalhos] .ficha-rapida').forEach((x) => x.classList.remove('ativa'));
      b.classList.add('ativa');
      filtros.status = b.dataset.status || '';
      filtros.atrasadas = b.dataset.atrasadas || '';
      desenhar();
    };
  });

  await desenhar();
}

const cartaoOrdem = (o) => {
  const dias = o.previsao_entrega ? diasAte(o.previsao_entrega) : null;
  return `
  <div class="cartao cartao-clicavel" data-ir="#/ordens/${o.id}">
    <div class="cartao-corpo">
      <div class="flex entre centro g8 quebra mb8">
        <span class="numero-doc">${esc(o.numero)}</span>
        <div class="flex g6 quebra">
          ${o.atrasada ? selo('Atrasada', 'vermelho') : ''}
          ${seloDominio(estado.dominios.status_oc, o.status)}
        </div>
      </div>
      <div class="negrito mb8">${esc(o.fornecedor_nome)}</div>
      <div class="flex centro g8 quebra mb8">
        ${o.placa ? `<span class="etiqueta-placa">${esc(fPlaca(o.placa))}</span>` : ''}
        <span class="mini">${esc(juntar([o.ficha_numero, o.empresa_nome]))}</span>
      </div>
      <div class="flex entre centro g8 quebra">
        <span class="mini">${esc(juntar([
          `emitida ${fData(o.data_emissao)}`,
          o.previsao_entrega ? `previsão ${fData(o.previsao_entrega)}${dias !== null && dias < 0 && !['recebida','cancelada'].includes(o.status) ? ` (${Math.abs(dias)} dia(s) em atraso)` : ''}` : null,
          `${o.itens_recebidos}/${o.total_itens} recebido(s)`,
        ]))}</span>
        <span class="negrito tabular">${moeda(o.total)}</span>
      </div>
    </div>
  </div>`;
};

// ================================================================ Detalhe
export async function telaOrdemDetalhe(raiz, { partes, irPara, recarregar }) {
  const id = Number(partes[0]);
  const o = await api.ordens.obter(id);
  const d = estado.dominios;
  const fornecedor = await api.fornecedores.obter(o.fornecedor_id).catch(() => null);
  const zap = fornecedor ? linkWhatsapp(fornecedor.whatsapp || fornecedor.telefone,
    `Olá! Sobre a ordem de compra ${o.numero} da SOS Truck Service.`) : null;
  const pendentes = o.itens.filter((i) => !i.recebida_em);

  raiz.innerHTML = `
    ${o.status === 'cancelada' ? `
      <div class="faixa-alerta mb12">${icone('alerta', 19)}
        <div><b>Ordem cancelada</b>${esc(o.cancelada_motivo || '')}</div></div>` : ''}
    ${o.previsao_entrega && diasAte(o.previsao_entrega) < 0 && !['recebida', 'cancelada'].includes(o.status) ? `
      <div class="faixa-alerta mb12">${icone('relogio', 19)}
        <div><b>Entrega atrasada</b>Prevista para ${fData(o.previsao_entrega)} —
        ${Math.abs(diasAte(o.previsao_entrega))} dia(s) de atraso.</div></div>` : ''}

    <div class="colunas-detalhe">
      <div>
        <div class="cartao mb12">
          <div class="cartao-corpo">
            <div class="flex entre centro g8 quebra mb12">
              <div>
                <div class="numero-doc" style="font-size:17px">${esc(o.numero)}</div>
                <div class="mini">Emitida em ${fData(o.data_emissao)}</div>
              </div>
              ${seloDominio(d.status_oc, o.status, 'selo-grande')}
            </div>
            <div class="dados-grade">
              ${dado('Fornecedor', esc(o.fornecedor_nome))}
              ${fornecedor && fornecedor.cnpj ? dado('CNPJ', esc(fDoc(fornecedor.cnpj))) : ''}
              ${dado('Contato', o.fornecedor_telefone
                ? `<a href="tel:${esc(o.fornecedor_telefone)}">${esc(fTelefone(o.fornecedor_telefone))}</a>` : '—')}
              ${o.ficha_numero ? dado('Ficha mecânica', `<a href="#/fichas/${o.ficha_id}">${esc(o.ficha_numero)}</a>`) : ''}
              ${o.placa ? dado('Caminhão', `<a href="#/caminhoes/${o.caminhao_id}">${esc(fPlaca(o.placa))} ${esc(juntar([o.codigo_frota, [o.marca, o.modelo].filter(Boolean).join(' ')]))}</a>`) : ''}
              ${dado('Empresa', esc(o.empresa_nome || '—'))}
              ${dado('Forma de pagamento', esc(o.forma_pagamento || '—'))}
              ${dado('Prazo de entrega', esc(o.prazo_entrega || '—'))}
              ${dado('Previsão de entrega', fData(o.previsao_entrega))}
              ${dado('Responsável pela compra', esc(o.responsavel_nome || '—'))}
              ${o.cotacao_numero ? dado('Cotação de origem', `<a href="#/cotacoes/${o.cotacao_id}">${esc(o.cotacao_numero)}</a>`) : ''}
            </div>
            ${o.endereco_entrega ? `<div class="mt14"><div class="rotulo-campo">Endereço de entrega</div>
              <div class="texto-bloco mt6">${esc(o.endereco_entrega)}</div></div>` : ''}
            ${o.observacoes ? `<div class="mt14"><div class="rotulo-campo">Observações</div>
              <div class="texto-bloco mt6">${esc(o.observacoes)}</div></div>` : ''}
          </div>
        </div>

        <div class="cartao mb12">
          <div class="cartao-topo"><h3>Itens da ordem (${o.itens.length})</h3></div>
          <div class="tabela-rolagem" style="border:0;border-radius:0">
            <table class="tabela">
              <thead>
                <tr><th>Peça</th><th class="num">Qtd</th><th class="num">Valor unit.</th>
                    <th class="num">Desc.</th><th class="num">Total</th><th>Recebimento</th></tr>
              </thead>
              <tbody>
                ${o.itens.map((i) => `
                  <tr class="${i.recebida_em ? 'destaque-linha' : ''}">
                    <td>
                      <div class="negrito">${esc(i.descricao)}</div>
                      <div class="mini">${esc(juntar([i.codigo ? `Cód. ${i.codigo}` : null, i.marca]))}</div>
                    </td>
                    <td class="num">${numero(i.quantidade, 2)} ${esc(i.unidade || 'UN')}</td>
                    <td class="num">${moeda(i.valor_unitario)}</td>
                    <td class="num">${i.desconto ? `- ${moeda(i.desconto)}` : '—'}</td>
                    <td class="num negrito">${moeda(i.total)}</td>
                    <td>${i.recebida_em
                      ? `${selo('Recebido', 'verde')}<div class="mini">${fData(i.recebida_em)}</div>`
                      : i.quantidade_recebida > 0
                        ? `${selo('Parcial', 'laranja')}<div class="mini">${numero(i.quantidade_recebida, 2)} de ${numero(i.quantidade, 2)}</div>`
                        : selo('Pendente', 'cinza')}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
          <div class="cartao-corpo">
            <div class="resumo-totais">
              <div class="linha"><span>Subtotal</span><span class="valor">${moeda(o.subtotal)}</span></div>
              <div class="linha"><span>Desconto</span><span class="valor">- ${moeda(o.desconto)}</span></div>
              <div class="linha"><span>Frete</span><span class="valor">${moeda(o.frete)}</span></div>
              <div class="linha total"><span>Total geral</span><span class="valor">${moeda(o.total)}</span></div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div class="cartao mb12">
          <div class="cartao-topo"><h3>Ações</h3></div>
          <div class="cartao-corpo botoes-empilhados">
            ${pendentes.length && o.status !== 'cancelada' ? `
              <button class="botao botao-principal botao-grande botao-bloco" data-receber>
                ${icone('caixa', 18)} Confirmar recebimento</button>` : ''}
            <a class="botao botao-contorno botao-bloco" href="${api.ordens.pdf(o.id)}" target="_blank" rel="noopener">
              ${icone('imprimir', 17)} Ver / imprimir PDF</a>
            <a class="botao botao-contorno botao-bloco" href="${api.ordens.pdf(o.id, true)}">
              ${icone('baixar', 17)} Baixar PDF</a>
            <button class="botao botao-contorno botao-bloco" data-compartilhar>${icone('compartilhar', 17)} Compartilhar</button>
            ${zap ? `<a class="botao botao-contorno botao-bloco" href="${esc(zap)}" target="_blank" rel="noopener">
              ${icone('conversa', 17)} WhatsApp do fornecedor</a>` : ''}
            ${o.status !== 'cancelada' && o.status !== 'recebida' ? `
              <button class="botao botao-contorno botao-bloco" data-status>${icone('relogio', 17)} Alterar situação</button>
              <button class="botao botao-contorno botao-bloco" data-editar>${icone('lapis', 17)} Editar dados de entrega</button>` : ''}
            ${o.status !== 'cancelada' ? `
              <button class="botao botao-perigo botao-bloco" data-cancelar>Cancelar ordem</button>` : ''}
          </div>
        </div>

        <div class="cartao">
          <div class="cartao-topo"><h3>Histórico</h3></div>
          <div class="cartao-corpo">
            ${o.historico.length
              ? `<div class="linha-tempo">${o.historico.map((h, i) => eventoHistorico(h, i === 0)).join('')}</div>`
              : '<p class="apoio">Sem registros.</p>'}
          </div>
        </div>
      </div>
    </div>`;

  const acao = (sel, fn) => { const b = raiz.querySelector(sel); if (b) b.onclick = fn; };

  acao('[data-receber]', () => abrirRecebimento(o, recarregar));

  acao('[data-compartilhar]', async () => {
    const url = `${window.location.origin}${api.ordens.pdf(o.id)}`;
    const texto = `Ordem de compra ${o.numero} — ${o.fornecedor_nome} — ${moeda(o.total)}`;
    if (navigator.share) {
      try { await navigator.share({ title: o.numero, text: texto, url }); return; } catch (_) { /* cancelado */ }
    }
    try {
      await navigator.clipboard.writeText(`${texto}\n${url}`);
      avisar('Link da ordem copiado para a área de transferência.', 'sucesso');
    } catch (_) { window.open(url, '_blank'); }
  });

  acao('[data-status]', () => {
    const { elemento, fechar } = abrirModal({
      titulo: 'Alterar situação da ordem',
      conteudo: `<div class="campo"><label for="novo-status">Nova situação</label>
        <select class="selecao" id="novo-status">
          ${Object.entries(d.status_oc).filter(([k]) => k !== 'cancelada').map(([k, v]) =>
            `<option value="${k}" ${o.status === k ? 'selected' : ''}>${esc(v.rotulo)}</option>`).join('')}
        </select></div>`,
      rodape: `<button class="botao botao-contorno" data-fechar>Cancelar</button>
               <button class="botao botao-principal" data-salvar>Salvar</button>`,
    });
    elemento.querySelector('[data-salvar]').onclick = async (e) => {
      ocupado(e.target, true, 'Salvando…');
      try {
        await api.ordens.alterarStatus(o.id, elemento.querySelector('#novo-status').value);
        avisar('Situação atualizada.', 'sucesso');
        fechar(); recarregar();
      } catch (erro) { ocupado(e.target, false); avisarErro(erro); }
    };
  });

  acao('[data-editar]', () => {
    const { elemento, fechar } = abrirModal({
      titulo: 'Editar dados de entrega',
      conteudo: `
        <form id="form-oc" class="formulario">
          <div class="campo"><label for="oc-pagamento">Forma de pagamento</label>
            <input class="entrada" id="oc-pagamento" name="forma_pagamento" list="pag" value="${esc(o.forma_pagamento || '')}">
            <datalist id="pag">${d.formas_pagamento.map((p) => `<option value="${esc(p)}">`).join('')}</datalist></div>
          <div class="campo"><label for="oc-prazo">Prazo de entrega</label>
            <input class="entrada" id="oc-prazo" name="prazo_entrega" value="${esc(o.prazo_entrega || '')}"></div>
          <div class="campo"><label for="oc-previsao">Previsão de entrega</label>
            <input class="entrada" type="date" id="oc-previsao" name="previsao_entrega"
                   value="${o.previsao_entrega ? paraCampoData(o.previsao_entrega) : ''}"></div>
          <div class="campo"><label for="oc-endereco">Endereço de entrega</label>
            <textarea class="area-texto" id="oc-endereco" name="endereco_entrega" rows="2">${esc(o.endereco_entrega || '')}</textarea></div>
          <div class="campo"><label for="oc-obs">Observações</label>
            <textarea class="area-texto" id="oc-obs" name="observacoes" rows="2">${esc(o.observacoes || '')}</textarea></div>
        </form>`,
      rodape: `<button class="botao botao-contorno" data-fechar>Cancelar</button>
               <button class="botao botao-principal" data-salvar>Salvar</button>`,
    });
    elemento.querySelector('[data-salvar]').onclick = async (e) => {
      ocupado(e.target, true, 'Salvando…');
      try {
        await api.ordens.salvar(o.id, coletarObjeto(elemento.querySelector('#form-oc')));
        avisar('Ordem atualizada.', 'sucesso');
        fechar(); recarregar();
      } catch (erro) { ocupado(e.target, false); avisarErro(erro); }
    };
  });

  acao('[data-cancelar]', async () => {
    const r = await confirmar({
      titulo: 'Cancelar ordem de compra',
      mensagem: 'As peças voltam para a situação de aprovadas. A ordem permanece registrada no histórico.',
      confirmarTexto: 'Cancelar ordem', pedirMotivo: true, rotuloMotivo: 'Motivo do cancelamento',
    });
    if (!r) return;
    try {
      await api.ordens.cancelar(o.id, { motivo: r.motivo, confirmar: true });
      avisar('Ordem cancelada.', 'sucesso');
      recarregar();
    } catch (erro) { avisarErro(erro); }
  });
}

// ---------------------------------------------------------------- Recebimento
function abrirRecebimento(o, recarregar) {
  const pendentes = o.itens.filter((i) => !i.recebida_em);
  const { elemento, fechar } = abrirModal({
    titulo: `Confirmar recebimento — ${o.numero}`,
    conteudo: `
      <p class="apoio mb12">Marque os itens recebidos. Ajuste a quantidade em caso de entrega parcial.</p>
      <div class="lista">
        ${pendentes.map((i) => `
          <div class="cartao" data-item="${i.id}">
            <div class="cartao-corpo">
              <label class="interruptor" style="border:0;padding:0;margin-bottom:10px">
                <input type="checkbox" data-marcar checked>
                <span class="trilho"></span>
                <span class="conteudo"><b>${esc(i.descricao)}</b>
                  <span class="mini">${esc(juntar([i.codigo, i.marca]))} · pedido: ${numero(i.quantidade, 2)} ${esc(i.unidade || 'UN')}</span></span>
              </label>
              <div class="campo">
                <label>Quantidade recebida</label>
                <input class="entrada" type="number" step="0.01" min="0" max="${i.quantidade}"
                       data-quantidade value="${i.quantidade}">
              </div>
            </div>
          </div>`).join('')}
      </div>
      <div class="grade-2 mt14">
        <div class="campo"><label for="rec-nf">Nota fiscal</label>
          <input class="entrada" id="rec-nf" placeholder="Número da NF"></div>
        <div class="campo"><label for="rec-obs">Observação</label>
          <input class="entrada" id="rec-obs" placeholder="Avarias, divergências…"></div>
      </div>`,
    rodape: `<button class="botao botao-contorno" data-fechar>Cancelar</button>
             <button class="botao botao-principal" data-confirmar>${icone('certo', 17)} Confirmar recebimento</button>`,
    largura: '620px',
  });

  elemento.querySelector('[data-confirmar]').onclick = async (e) => {
    const itens = [];
    elemento.querySelectorAll('[data-item]').forEach((bloco) => {
      if (!bloco.querySelector('[data-marcar]').checked) return;
      itens.push({
        item_id: Number(bloco.dataset.item),
        quantidade: Number(bloco.querySelector('[data-quantidade]').value),
      });
    });
    if (!itens.length) { avisar('Selecione ao menos um item recebido.', 'alerta'); return; }
    ocupado(e.target, true, 'Registrando…');
    try {
      await api.ordens.receber(o.id, {
        itens,
        nota_fiscal: elemento.querySelector('#rec-nf').value,
        observacao: elemento.querySelector('#rec-obs').value,
      });
      avisar('Recebimento registrado. O mecânico foi avisado.', 'sucesso');
      fechar();
      recarregar();
    } catch (erro) { ocupado(e.target, false); avisarErro(erro); }
  };
}

// ================================================================ Controle de recebimento
export async function telaRecebimento(raiz, { irPara, recarregar }) {
  const [aguardando, recebidas] = await Promise.all([
    api.ordens.listar({ status: 'emitida,enviada,confirmada,parcial' }),
    api.pecas.listar({ status: 'recebida,entregue', por_pagina: 60 }),
  ]);

  raiz.innerHTML = `
    <div class="pagina-cabecalho">
      <div class="texto">
        <h1 class="titulo">Controle de recebimento</h1>
        <p class="apoio">Compras a caminho e peças que já chegaram na oficina.</p>
      </div>
    </div>

    <h2 class="secao">Compras aguardando entrega (${aguardando.itens.length})</h2>
    ${aguardando.itens.length ? `
      <div class="lista">
        ${aguardando.itens.map((o) => `
          <div class="cartao">
            <div class="cartao-corpo cartao-clicavel" data-ir="#/ordens/${o.id}">
              <div class="flex entre centro g8 quebra mb8">
                <span class="numero-doc">${esc(o.numero)}</span>
                <div class="flex g6 quebra">
                  ${o.atrasada ? selo('Atrasada', 'vermelho') : ''}
                  ${seloDominio(estado.dominios.status_oc, o.status)}
                </div>
              </div>
              <div class="negrito mb8">${esc(o.fornecedor_nome)}</div>
              <div class="flex centro g8 quebra">
                ${o.placa ? `<span class="etiqueta-placa">${esc(fPlaca(o.placa))}</span>` : ''}
                <span class="mini">${esc(juntar([
                  o.ficha_numero,
                  o.previsao_entrega ? `previsão ${fData(o.previsao_entrega)}` : 'sem previsão',
                  `${o.itens_recebidos}/${o.total_itens} recebido(s)`,
                ]))}</span>
              </div>
            </div>
            <div class="cartao-rodape">
              <button class="botao botao-principal botao-pequeno" data-receber-ordem="${o.id}">
                ${icone('caixa', 15)} Confirmar recebimento</button>
              <span class="botao botao-texto botao-pequeno tabular">${moeda(o.total)}</span>
            </div>
          </div>`).join('')}
      </div>` : vazio({ icone: 'certo', titulo: 'Nenhuma compra pendente', texto: 'Todas as ordens emitidas já foram recebidas.' })}

    <h2 class="secao">Peças recebidas aguardando instalação (${recebidas.itens.length})</h2>
    ${recebidas.itens.length ? `
      <div class="lista">
        ${recebidas.itens.map((p) => `
          <div class="cartao">
            <div class="cartao-corpo cartao-clicavel" data-ir="#/fichas/${p.ficha_id}">
              <div class="flex entre centro g8 quebra mb8">
                <h3 class="sub crescer">${esc(p.nome)}</h3>
                ${seloDominio(estado.dominios.status_peca, p.status)}
              </div>
              <div class="flex centro g8 quebra">
                <span class="etiqueta-placa">${esc(fPlaca(p.placa))}</span>
                <span class="mini">${esc(juntar([p.ficha_numero, p.mecanico_nome,
                  `${numero(p.quantidade, 2)} ${p.unidade}`,
                  p.recebida_em ? `recebida ${quando(p.recebida_em)}` : null]))}</span>
              </div>
            </div>
            <div class="cartao-rodape">
              ${p.status === 'recebida'
                ? `<button class="botao botao-contorno botao-pequeno" data-entregar="${p.id}">Entregar ao mecânico</button>` : ''}
              <button class="botao botao-verde botao-pequeno" data-instalar="${p.id}">${icone('certo', 15)} Marcar instalada</button>
            </div>
          </div>`).join('')}
      </div>` : vazio({ icone: 'caixa', titulo: 'Nenhuma peça aguardando instalação' })}`;

  raiz.querySelectorAll('[data-ir]').forEach((el) => { el.onclick = () => irPara(el.dataset.ir); });

  raiz.querySelectorAll('[data-receber-ordem]').forEach((b) => {
    b.onclick = async () => {
      const ordem = await api.ordens.obter(Number(b.dataset.receberOrdem));
      abrirRecebimento(ordem, recarregar);
    };
  });
  raiz.querySelectorAll('[data-entregar]').forEach((b) => {
    b.onclick = async () => {
      try {
        await api.pecas.entregar(Number(b.dataset.entregar));
        avisar('Peça entregue ao mecânico.', 'sucesso');
        recarregar();
      } catch (erro) { avisarErro(erro); }
    };
  });
  raiz.querySelectorAll('[data-instalar]').forEach((b) => {
    b.onclick = async () => {
      const ok = await confirmar({
        titulo: 'Confirmar instalação',
        mensagem: 'Confirma que a peça foi instalada no caminhão?',
        confirmarTexto: 'Sim, instalada', tipo: 'neutro',
      });
      if (!ok) return;
      try {
        await api.pecas.instalar(Number(b.dataset.instalar), {});
        avisar('Peça marcada como instalada.', 'sucesso');
        recarregar();
      } catch (erro) { avisarErro(erro); }
    };
  });
}
