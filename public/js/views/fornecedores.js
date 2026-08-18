/** Cadastro e consulta de fornecedores. */
import { api } from '../api.js';
import {
  icone, selo, vazio, carregando, avisar, avisarErro, confirmar, abrirModal,
  coletarObjeto, marcarErro, ocupado, dado, linhaInfo,
} from '../ui.js';
import { esc, moeda, numero, telefone as fTelefone, documento as fDoc, debounce, juntar, linkWhatsapp, mascaras } from '../utils.js';

export async function telaFornecedores(raiz, { recarregar }) {
  const filtros = { busca: '' };

  raiz.innerHTML = `
    <div class="pagina-cabecalho">
      <div class="texto">
        <h1 class="titulo">Fornecedores</h1>
        <p class="apoio">Cadastro de parceiros usados nas cotações e ordens de compra.</p>
      </div>
      <button class="botao botao-principal so-desktop" data-novo>${icone('mais', 18)} Cadastrar fornecedor</button>
    </div>

    <div class="barra-busca">
      <div class="campo-busca">
        ${icone('busca', 18)}
        <input class="entrada" type="search" id="busca-fornecedor" placeholder="Nome, CNPJ, cidade ou especialidade"
               inputmode="search" autocomplete="off">
      </div>
    </div>

    <div id="lista-fornecedores">${carregando(3)}</div>
    <button class="acao-flutuante" data-novo>${icone('mais', 20)} Fornecedor</button>`;

  const area = raiz.querySelector('#lista-fornecedores');

  async function desenhar() {
    area.innerHTML = carregando(3);
    try {
      const { itens } = await api.fornecedores.listar(filtros);
      if (!itens.length) {
        area.innerHTML = vazio({
          icone: 'loja', titulo: 'Nenhum fornecedor cadastrado',
          texto: 'Cadastre os fornecedores para registrar as propostas nas cotações.',
          acao: '<button class="botao botao-principal" data-novo>Cadastrar fornecedor</button>',
        });
        area.querySelectorAll('[data-novo]').forEach((b) => { b.onclick = () => abrirForm(null, desenhar); });
        return;
      }
      area.innerHTML = `
        <div class="mini mb8">${numero(itens.length)} fornecedor(es)</div>
        <div class="lista">
          ${itens.map((f) => {
            const zap = linkWhatsapp(f.whatsapp || f.telefone);
            return `
            <div class="cartao">
              <div class="cartao-corpo">
                <div class="flex entre centro g8 quebra mb8">
                  <h3 class="sub crescer">${esc(f.nome)}</h3>
                  ${f.ativo ? '' : selo('Inativo', 'cinza')}
                </div>
                <div class="mini mb8">${esc(juntar([
                  f.cnpj ? fDoc(f.cnpj) : null, [f.cidade, f.estado].filter(Boolean).join('/'), f.especialidades,
                ]))}</div>
                <div class="dados-grade">
                  ${dado('Vendedor', esc(f.vendedor || '—'))}
                  ${dado('Telefone', f.telefone ? `<a href="tel:${esc(f.telefone)}">${esc(fTelefone(f.telefone))}</a>` : '—')}
                  ${dado('Prazo médio', f.prazo_medio_dias ? `${f.prazo_medio_dias} dia(s)` : '—')}
                  ${dado('Propostas', `${f.total_propostas} · ${f.propostas_vencedoras} vencedora(s)`)}
                  ${dado('Total comprado', moeda(f.total_comprado))}
                </div>
              </div>
              <div class="cartao-rodape">
                <button class="botao botao-contorno botao-pequeno" data-editar="${f.id}">${icone('lapis', 15)} Editar</button>
                ${zap ? `<a class="botao botao-contorno botao-pequeno" href="${esc(zap)}" target="_blank" rel="noopener">
                  ${icone('conversa', 15)} WhatsApp</a>` : ''}
                <button class="botao botao-texto botao-pequeno" data-detalhe="${f.id}">Histórico de compras</button>
                <button class="botao botao-texto botao-pequeno ${f.ativo ? 'cor-vermelho' : ''}" data-inativar="${f.id}">
                  ${f.ativo ? 'Inativar' : 'Reativar'}</button>
              </div>
            </div>`;
          }).join('')}
        </div>`;

      area.querySelectorAll('[data-editar]').forEach((b) => {
        b.onclick = async () => abrirForm(await api.fornecedores.obter(Number(b.dataset.editar)), desenhar);
      });
      area.querySelectorAll('[data-detalhe]').forEach((b) => {
        b.onclick = () => abrirDetalhe(Number(b.dataset.detalhe));
      });
      area.querySelectorAll('[data-inativar]').forEach((b) => {
        b.onclick = async () => {
          const ok = await confirmar({
            titulo: 'Alterar situação do fornecedor',
            mensagem: 'Fornecedores inativos deixam de aparecer nas cotações, mas o histórico é preservado.',
            confirmarTexto: 'Confirmar', tipo: 'neutro',
          });
          if (!ok) return;
          try {
            await api.fornecedores.inativar(Number(b.dataset.inativar));
            avisar('Situação atualizada.', 'sucesso');
            desenhar();
          } catch (erro) { avisarErro(erro); }
        };
      });
    } catch (erro) {
      avisarErro(erro);
      area.innerHTML = '<p class="apoio">Não foi possível carregar os fornecedores.</p>';
    }
  }

  raiz.querySelector('#busca-fornecedor').oninput = debounce((e) => { filtros.busca = e.target.value.trim(); desenhar(); }, 350);
  raiz.querySelectorAll('[data-novo]').forEach((b) => { b.onclick = () => abrirForm(null, desenhar); });

  await desenhar();
}

function abrirForm(fornecedor, aoSalvar) {
  const { elemento, fechar } = abrirModal({
    titulo: fornecedor ? 'Editar fornecedor' : 'Cadastrar fornecedor',
    conteudo: `
      <form id="form-fornecedor" class="formulario">
        <div class="campo">
          <label for="fo-nome">Nome / apelido comercial <span class="obrigatorio">*</span></label>
          <input class="entrada" id="fo-nome" name="nome" required value="${esc(fornecedor ? fornecedor.nome : '')}">
        </div>
        <div class="campo">
          <label for="fo-razao">Razão social</label>
          <input class="entrada" id="fo-razao" name="razao_social" value="${esc(fornecedor ? fornecedor.razao_social || '' : '')}">
        </div>
        <div class="campo">
          <label for="fo-cnpj">CNPJ / CPF</label>
          <input class="entrada" id="fo-cnpj" name="cnpj" inputmode="numeric"
                 value="${fornecedor && fornecedor.cnpj ? esc(fDoc(fornecedor.cnpj)) : ''}">
        </div>
        <div class="grade-2">
          <div class="campo"><label for="fo-telefone">Telefone</label>
            <input class="entrada" id="fo-telefone" name="telefone" inputmode="tel"
                   value="${fornecedor && fornecedor.telefone ? esc(fTelefone(fornecedor.telefone)) : ''}"></div>
          <div class="campo"><label for="fo-whatsapp">WhatsApp</label>
            <input class="entrada" id="fo-whatsapp" name="whatsapp" inputmode="tel"
                   value="${fornecedor && fornecedor.whatsapp ? esc(fTelefone(fornecedor.whatsapp)) : ''}"></div>
        </div>
        <div class="grade-2">
          <div class="campo"><label for="fo-email">E-mail</label>
            <input class="entrada" type="email" id="fo-email" name="email" inputmode="email"
                   value="${esc(fornecedor ? fornecedor.email || '' : '')}"></div>
          <div class="campo"><label for="fo-vendedor">Vendedor de contato</label>
            <input class="entrada" id="fo-vendedor" name="vendedor" value="${esc(fornecedor ? fornecedor.vendedor || '' : '')}"></div>
        </div>
        <div class="campo"><label for="fo-endereco">Endereço</label>
          <input class="entrada" id="fo-endereco" name="endereco" value="${esc(fornecedor ? fornecedor.endereco || '' : '')}"></div>
        <div class="grade-2">
          <div class="campo"><label for="fo-cidade">Cidade</label>
            <input class="entrada" id="fo-cidade" name="cidade" value="${esc(fornecedor ? fornecedor.cidade || '' : '')}"></div>
          <div class="campo"><label for="fo-estado">UF</label>
            <input class="entrada" id="fo-estado" name="estado" maxlength="2" style="text-transform:uppercase"
                   value="${esc(fornecedor ? fornecedor.estado || '' : '')}"></div>
        </div>
        <div class="grade-2">
          <div class="campo"><label for="fo-cep">CEP</label>
            <input class="entrada" id="fo-cep" name="cep" inputmode="numeric"
                   value="${esc(fornecedor ? fornecedor.cep || '' : '')}"></div>
          <div class="campo"><label for="fo-prazo">Prazo médio (dias)</label>
            <input class="entrada" type="number" min="0" id="fo-prazo" name="prazo_medio_dias"
                   value="${fornecedor && fornecedor.prazo_medio_dias !== null ? fornecedor.prazo_medio_dias : ''}"></div>
        </div>
        <div class="campo"><label for="fo-pagamento">Condições de pagamento</label>
          <input class="entrada" id="fo-pagamento" name="condicoes_pagamento" placeholder="Ex.: boleto 30/60 dias"
                 value="${esc(fornecedor ? fornecedor.condicoes_pagamento || '' : '')}"></div>
        <div class="campo"><label for="fo-especialidades">Especialidades</label>
          <input class="entrada" id="fo-especialidades" name="especialidades" placeholder="Ex.: motor, freios, elétrica"
                 value="${esc(fornecedor ? fornecedor.especialidades || '' : '')}"></div>
        <div class="campo"><label for="fo-obs">Observações</label>
          <textarea class="area-texto" id="fo-obs" name="observacoes" rows="2">${esc(fornecedor ? fornecedor.observacoes || '' : '')}</textarea></div>
      </form>`,
    rodape: `<button class="botao botao-contorno" data-fechar>Cancelar</button>
             <button class="botao botao-principal" data-salvar>${fornecedor ? 'Salvar' : 'Cadastrar'}</button>`,
  });

  const form = elemento.querySelector('#form-fornecedor');
  form.cnpj.oninput = (e) => { e.target.value = mascaras.documento(e.target.value); };
  form.telefone.oninput = (e) => { e.target.value = mascaras.telefone(e.target.value); };
  form.whatsapp.oninput = (e) => { e.target.value = mascaras.telefone(e.target.value); };
  form.cep.oninput = (e) => { e.target.value = mascaras.cep(e.target.value); };

  elemento.querySelector('[data-salvar]').onclick = async (e) => {
    if (!form.nome.value.trim()) { avisar('Informe o nome do fornecedor.', 'alerta'); return; }
    const dados = coletarObjeto(form);
    ocupado(e.target, true, 'Salvando…');
    try {
      if (fornecedor) await api.fornecedores.salvar(fornecedor.id, dados);
      else await api.fornecedores.criar(dados);
      avisar(fornecedor ? 'Fornecedor atualizado.' : 'Fornecedor cadastrado.', 'sucesso');
      fechar();
      aoSalvar();
    } catch (erro) {
      ocupado(e.target, false);
      if (erro.campo) marcarErro(form, erro.campo, erro.message);
      avisarErro(erro);
    }
  };
}

async function abrirDetalhe(id) {
  const f = await api.fornecedores.obter(id);
  abrirModal({
    titulo: f.nome,
    conteudo: `
      <div class="dados-grade mb16">
        ${dado('CNPJ', f.cnpj ? esc(fDoc(f.cnpj)) : '—')}
        ${dado('Vendedor', esc(f.vendedor || '—'))}
        ${dado('Telefone', f.telefone ? esc(fTelefone(f.telefone)) : '—')}
        ${dado('E-mail', esc(f.email || '—'))}
        ${dado('Propostas enviadas', `${f.desempenho.propostas || 0}`)}
        ${dado('Propostas vencedoras', `${f.desempenho.vencedoras || 0}`)}
        ${dado('Prazo médio informado', f.desempenho.prazo_medio ? `${Math.round(f.desempenho.prazo_medio)} dia(s)` : '—')}
      </div>
      <h3 class="sub mb8">Ordens de compra</h3>
      ${f.ordens.length ? `
        <div class="tabela-rolagem">
          <table class="tabela">
            <thead><tr><th>Ordem</th><th>Caminhão</th><th>Situação</th><th class="num">Total</th></tr></thead>
            <tbody>
              ${f.ordens.map((o) => `<tr>
                <td><a href="#/ordens/${o.id}">${esc(o.numero)}</a><div class="mini">${esc(o.ficha_numero || '')}</div></td>
                <td>${esc(o.placa || '—')}</td>
                <td>${esc(o.status)}</td>
                <td class="num negrito">${moeda(o.total)}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>` : '<p class="apoio">Nenhuma compra realizada com este fornecedor.</p>'}`,
    rodape: `<button class="botao botao-contorno" data-fechar>Fechar</button>`,
    largura: '640px',
  });
}
