/** Consulta de peças solicitadas, com filtros e ações rápidas. */
import { api } from '../api.js';
import { estado, ehAdmin, carregarCategorias } from '../estado.js';
import {
  icone, selo, seloDominio, vazio, carregando, avisar, avisarErro, confirmar, abrirModal,
} from '../ui.js';
import { esc, placa as fPlaca, quando, moeda, numero, debounce, juntar } from '../utils.js';

const ATALHOS_ADMIN = [
  { chave: '', nome: 'Todas' },
  { chave: 'aguardando_analise,aguardando_cotacao', nome: 'Para cotar' },
  { chave: 'em_cotacao,aguardando_aprovacao', nome: 'Em cotação' },
  { chave: 'aprovada,oc_emitida,comprada', nome: 'Em compra' },
  { chave: 'recebida,entregue', nome: 'Recebidas' },
  { chave: 'instalada', nome: 'Instaladas' },
];

const ATALHOS_MECANICO = [
  { chave: '', nome: 'Todas' },
  { chave: 'rascunho,aguardando_analise', nome: 'Solicitadas' },
  { chave: 'em_cotacao,aguardando_cotacao,aguardando_aprovacao', nome: 'Em cotação' },
  { chave: 'aprovada,oc_emitida,comprada', nome: 'Compradas' },
  { chave: 'recebida,entregue', nome: 'Prontas para instalar' },
  { chave: 'instalada', nome: 'Instaladas' },
];

export async function telaPecas(raiz, { irPara, consulta, recarregar }) {
  const admin = ehAdmin();
  const filtros = {
    busca: consulta.get('busca') || '',
    status: consulta.get('status') || '',
    urgencia: consulta.get('urgencia') || '',
    categoria_id: consulta.get('categoria_id') || '',
    por_pagina: 60,
  };
  const atalhos = admin ? ATALHOS_ADMIN : ATALHOS_MECANICO;

  raiz.innerHTML = `
    <div class="pagina-cabecalho">
      <div class="texto">
        <h1 class="titulo">${admin ? 'Peças solicitadas' : 'Minhas peças'}</h1>
        <p class="apoio">${admin
          ? 'Todas as peças pedidas pelos mecânicos, por situação e urgência.'
          : 'Acompanhe o andamento das peças que você solicitou.'}</p>
      </div>
    </div>

    <div class="barra-busca">
      <div class="campo-busca">
        ${icone('busca', 18)}
        <input class="entrada" type="search" id="busca-peca" placeholder="Peça, código, ficha ou placa"
               value="${esc(filtros.busca)}" inputmode="search" autocomplete="off">
      </div>
      <button class="botao botao-contorno botao-filtro" data-filtros aria-label="Filtros">
        ${icone('filtro', 18)}<span class="marca esconder" data-marca-filtro></span>
      </button>
    </div>

    <div class="fichas-rapidas" data-atalhos>
      ${atalhos.map((a) => `<button class="ficha-rapida ${filtros.status === a.chave ? 'ativa' : ''}"
        data-status="${esc(a.chave)}">${esc(a.nome)}</button>`).join('')}
    </div>

    <div id="lista-pecas">${carregando(4)}</div>`;

  const area = raiz.querySelector('#lista-pecas');

  async function desenhar() {
    area.innerHTML = carregando(3);
    try {
      const { itens, total } = await api.pecas.listar(filtros);
      raiz.querySelector('[data-marca-filtro]').classList.toggle('esconder', !(filtros.urgencia || filtros.categoria_id));
      if (!itens.length) {
        area.innerHTML = vazio({ icone: 'peca', titulo: 'Nenhuma peça encontrada', texto: 'Ajuste os filtros ou a busca.' });
        return;
      }
      area.innerHTML = `
        <div class="mini mb8">${numero(total)} peça(s)</div>
        <div class="lista">${itens.map((p) => cartaoPeca(p, admin)).join('')}</div>`;

      area.querySelectorAll('[data-ir]').forEach((el) => { el.onclick = () => irPara(el.dataset.ir); });
      area.querySelectorAll('[data-instalar]').forEach((b) => {
        b.onclick = async (e) => {
          e.stopPropagation();
          const ok = await confirmar({
            titulo: 'Confirmar instalação',
            mensagem: 'Confirma que esta peça foi instalada no caminhão?',
            confirmarTexto: 'Sim, instalada', tipo: 'neutro',
          });
          if (!ok) return;
          try {
            await api.pecas.instalar(Number(b.dataset.instalar), {});
            avisar('Peça marcada como instalada.', 'sucesso');
            desenhar();
          } catch (erro) { avisarErro(erro); }
        };
      });
      area.querySelectorAll('[data-receber]').forEach((b) => {
        b.onclick = async (e) => {
          e.stopPropagation();
          try {
            await api.pecas.receber(Number(b.dataset.receber), {});
            avisar('Recebimento registrado.', 'sucesso');
            desenhar();
          } catch (erro) { avisarErro(erro); }
        };
      });
    } catch (erro) {
      avisarErro(erro);
      area.innerHTML = '<p class="apoio">Não foi possível carregar as peças.</p>';
    }
  }

  raiz.querySelector('#busca-peca').oninput = debounce((e) => { filtros.busca = e.target.value.trim(); desenhar(); }, 350);
  raiz.querySelectorAll('[data-atalhos] .ficha-rapida').forEach((b) => {
    b.onclick = () => {
      raiz.querySelectorAll('[data-atalhos] .ficha-rapida').forEach((x) => x.classList.remove('ativa'));
      b.classList.add('ativa');
      filtros.status = b.dataset.status;
      desenhar();
    };
  });

  raiz.querySelector('[data-filtros]').onclick = async () => {
    const categorias = await carregarCategorias();
    const d = estado.dominios;
    const { elemento, fechar } = abrirModal({
      titulo: 'Filtrar peças',
      conteudo: `
        <div class="formulario">
          <div class="campo"><label for="f-urgencia">Urgência</label>
            <select class="selecao" id="f-urgencia">
              <option value="">Todas</option>
              ${Object.entries(d.urgencias).map(([k, v]) =>
                `<option value="${k}" ${filtros.urgencia === k ? 'selected' : ''}>${esc(v.rotulo)}</option>`).join('')}
            </select></div>
          <div class="campo"><label for="f-categoria">Categoria da peça</label>
            <select class="selecao" id="f-categoria">
              <option value="">Todas</option>
              ${categorias.map((c) => `<option value="${c.id}" ${String(filtros.categoria_id) === String(c.id) ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}
            </select></div>
        </div>`,
      rodape: `<button class="botao botao-contorno" data-limpar>Limpar</button>
               <button class="botao botao-principal" data-aplicar>Aplicar</button>`,
    });
    elemento.querySelector('[data-limpar]').onclick = () => {
      filtros.urgencia = ''; filtros.categoria_id = ''; fechar(); desenhar();
    };
    elemento.querySelector('[data-aplicar]').onclick = () => {
      filtros.urgencia = elemento.querySelector('#f-urgencia').value;
      filtros.categoria_id = elemento.querySelector('#f-categoria').value;
      fechar(); desenhar();
    };
  };

  await desenhar();
}

function cartaoPeca(p, admin) {
  const d = estado.dominios;
  return `
  <div class="cartao">
    <div class="cartao-corpo cartao-clicavel" data-ir="#/fichas/${p.ficha_id}">
      <div class="flex entre centro g8 quebra mb8">
        <h3 class="sub crescer">${esc(p.nome)}</h3>
        <div class="flex g6 quebra">
          ${p.urgencia === 'critica' ? selo('Crítica', 'vermelho') : seloDominio(d.urgencias, p.urgencia)}
          ${seloDominio(d.status_peca, p.status)}
        </div>
      </div>
      <div class="mini mb8">${esc(juntar([p.categoria_nome, p.subcategoria_nome], ' › '))}</div>
      <div class="flex centro g8 quebra">
        <span class="etiqueta-placa">${esc(fPlaca(p.placa))}</span>
        <span class="mini">${esc(p.ficha_numero)} · ${numero(p.quantidade, 2)} ${esc(p.unidade)}
          ${p.codigo_referencia ? ` · ref. ${esc(p.codigo_referencia)}` : ''}</span>
      </div>
      <div class="mini mt6">${esc(juntar([
        p.empresa_nome, p.mecanico_nome, `solicitada ${quando(p.criado_em)}`,
        admin && p.valor_aprovado ? `aprovada por ${moeda(p.valor_aprovado)}` : null,
      ]))}</div>
    </div>
    ${['recebida', 'entregue'].includes(p.status) || (admin && ['aprovada', 'oc_emitida', 'comprada'].includes(p.status)) ? `
      <div class="cartao-rodape">
        ${admin && ['aprovada', 'oc_emitida', 'comprada'].includes(p.status)
          ? `<button class="botao botao-contorno botao-pequeno" data-receber="${p.id}">${icone('caixa', 15)} Registrar recebimento</button>` : ''}
        ${['recebida', 'entregue'].includes(p.status)
          ? `<button class="botao botao-verde botao-pequeno" data-instalar="${p.id}">${icone('certo', 15)} Marcar como instalada</button>` : ''}
      </div>` : ''}
  </div>`;
}
