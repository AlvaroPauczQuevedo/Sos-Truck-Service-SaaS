/** Configurações do sistema, dados da conta e cadastro de empresas. */
import { api } from '../api.js';
import { estado, ehAdmin, carregarConfiguracoes } from '../estado.js';
import {
  icone, selo, carregando, avisar, avisarErro, confirmar, abrirModal,
  coletarObjeto, marcarErro, ocupado, dado, vazio,
} from '../ui.js';
import { esc, telefone as fTelefone, documento as fDoc, numero, mascaras, dataHora } from '../utils.js';

export async function telaConfiguracoes(raiz, { recarregar }) {
  const admin = ehAdmin();
  const config = admin ? await carregarConfiguracoes(true) : null;

  raiz.innerHTML = `
    <div class="pagina-cabecalho">
      <div class="texto">
        <h1 class="titulo">${admin ? 'Configurações' : 'Meus dados'}</h1>
        <p class="apoio">${admin
          ? 'Dados da empresa usados nos documentos, preferências e cadastros auxiliares.'
          : 'Atualize seus dados de contato e sua senha de acesso.'}</p>
      </div>
    </div>

    <h2 class="secao">Minha conta</h2>
    <div class="cartao mb12">
      <div class="cartao-corpo">
        <form id="form-perfil" class="formulario">
          <div class="flex centro g10 mb12">
            <div style="width:48px;height:48px;border-radius:50%;background:var(--vermelho);color:#fff;display:grid;place-items:center;font-weight:700;font-size:17px;flex:none">
              ${esc((estado.usuario.nome || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase())}
            </div>
            <div class="crescer">
              <div class="negrito">${esc(estado.usuario.nome)}</div>
              <div class="mini">${esc(estado.usuario.email)} · ${admin ? 'Administração' : 'Mecânico'}</div>
            </div>
          </div>
          <div class="grade-2">
            <div class="campo"><label for="pf-nome">Nome</label>
              <input class="entrada" id="pf-nome" name="nome" value="${esc(estado.usuario.nome)}"></div>
            <div class="campo"><label for="pf-telefone">Telefone</label>
              <input class="entrada" id="pf-telefone" name="telefone" inputmode="tel"
                     value="${estado.usuario.telefone ? esc(fTelefone(estado.usuario.telefone)) : ''}"></div>
          </div>
          <div class="botoes-linha">
            <button class="botao botao-principal" type="submit">${icone('certo', 17)} Salvar meus dados</button>
            <button class="botao botao-contorno" type="button" data-trocar-senha>${icone('chave', 17)} Trocar senha</button>
          </div>
        </form>
      </div>
    </div>

    ${admin ? `
      <h2 class="secao">Dados da empresa (usados nos PDFs)</h2>
      <div class="cartao mb12">
        <div class="cartao-corpo">
          <form id="form-config" class="formulario">
            <div class="campo"><label for="cf-nome">Nome da empresa</label>
              <input class="entrada" id="cf-nome" name="empresa_nome" value="${esc(config.empresa_nome || '')}"></div>
            <div class="grade-2">
              <div class="campo"><label for="cf-doc">CNPJ</label>
                <input class="entrada" id="cf-doc" name="empresa_documento" inputmode="numeric"
                       value="${config.empresa_documento ? esc(fDoc(config.empresa_documento)) : ''}"></div>
              <div class="campo"><label for="cf-tel">Telefone</label>
                <input class="entrada" id="cf-tel" name="empresa_telefone" inputmode="tel"
                       value="${config.empresa_telefone ? esc(fTelefone(config.empresa_telefone)) : ''}"></div>
            </div>
            <div class="campo"><label for="cf-email">E-mail</label>
              <input class="entrada" type="email" id="cf-email" name="empresa_email" value="${esc(config.empresa_email || '')}"></div>
            <div class="campo"><label for="cf-endereco">Endereço da oficina</label>
              <input class="entrada" id="cf-endereco" name="empresa_endereco" value="${esc(config.empresa_endereco || '')}"></div>
            <div class="campo"><label for="cf-entrega">Endereço padrão de entrega</label>
              <textarea class="area-texto" id="cf-entrega" name="endereco_entrega" rows="2"
                placeholder="Preenchido automaticamente nas ordens de compra">${esc(config.endereco_entrega || '')}</textarea></div>
            <div class="grade-2">
              <div class="campo"><label for="cf-responsavel">Responsável pelas compras</label>
                <input class="entrada" id="cf-responsavel" name="responsavel_compras" value="${esc(config.responsavel_compras || '')}"></div>
              <div class="campo"><label for="cf-alerta">Alerta de atraso (dias antes)</label>
                <input class="entrada" type="number" min="0" max="30" id="cf-alerta" name="prazo_alerta_entrega_dias"
                       value="${esc(config.prazo_alerta_entrega_dias || '2')}"></div>
            </div>
            <button class="botao botao-principal" type="submit">${icone('certo', 17)} Salvar configurações</button>
          </form>
        </div>
      </div>

      <h2 class="secao">Empresas e proprietários</h2>
      <div id="lista-empresas">${carregando(2)}</div>

      <h2 class="secao">Histórico geral do sistema</h2>
      <div class="cartao mb12">
        <div class="cartao-corpo">
          <p class="apoio mb12">Todas as ações ficam registradas com usuário, data e hora.</p>
          <button class="botao botao-contorno" data-ver-historico>${icone('bloco', 17)} Abrir histórico completo</button>
        </div>
      </div>` : `
      <div class="cartao">
        <div class="cartao-corpo">
          <div class="faixa-alerta info">${icone('info', 19)}
            <div><b>Precisa de mais acesso?</b>Fale com a administração para alterar seu perfil ou cadastrar novos caminhões e empresas.</div>
          </div>
        </div>
      </div>`}`;

  // Perfil
  const formPerfil = raiz.querySelector('#form-perfil');
  formPerfil.telefone.oninput = (e) => { e.target.value = mascaras.telefone(e.target.value); };
  formPerfil.onsubmit = async (e) => {
    e.preventDefault();
    const botao = formPerfil.querySelector('[type=submit]');
    ocupado(botao, true, 'Salvando…');
    try {
      const { usuario } = await api.autenticacao.salvarPerfil({
        nome: formPerfil.nome.value,
        telefone: formPerfil.telefone.value.replace(/\D/g, ''),
      });
      estado.usuario = { ...estado.usuario, ...usuario };
      avisar('Dados atualizados.', 'sucesso');
      ocupado(botao, false);
    } catch (erro) { ocupado(botao, false); avisarErro(erro); }
  };

  raiz.querySelector('[data-trocar-senha]').onclick = abrirTrocaSenha;

  if (!admin) return;

  // Configurações da empresa
  const formConfig = raiz.querySelector('#form-config');
  formConfig.empresa_documento.oninput = (e) => { e.target.value = mascaras.documento(e.target.value); };
  formConfig.empresa_telefone.oninput = (e) => { e.target.value = mascaras.telefone(e.target.value); };
  formConfig.onsubmit = async (e) => {
    e.preventDefault();
    const botao = formConfig.querySelector('[type=submit]');
    const dados = coletarObjeto(formConfig);
    dados.empresa_documento = String(dados.empresa_documento || '').replace(/\D/g, '');
    dados.empresa_telefone = String(dados.empresa_telefone || '').replace(/\D/g, '');
    ocupado(botao, true, 'Salvando…');
    try {
      estado.configuracoes = await api.sistema.salvarConfiguracoes(dados);
      avisar('Configurações salvas.', 'sucesso');
      ocupado(botao, false);
    } catch (erro) { ocupado(botao, false); avisarErro(erro); }
  };

  const botaoHistorico = raiz.querySelector('[data-ver-historico]');
  if (botaoHistorico) botaoHistorico.onclick = abrirHistoricoGeral;

  await desenharEmpresas(raiz.querySelector('#lista-empresas'));
}

async function desenharEmpresas(area) {
  const desenhar = async () => {
    area.innerHTML = carregando(2);
    try {
      const { itens } = await api.empresas.listar({ inativas: 1 });
      area.innerHTML = `
        <div class="cartao mb12">
          <div class="cartao-corpo">
            <button class="botao botao-principal botao-bloco mb12" data-nova-empresa>${icone('mais', 17)} Cadastrar empresa</button>
            ${itens.length ? itens.map((e) => `
              <div class="linha-info">
                <span class="rot crescer">
                  <span class="negrito" style="color:var(--grafite)">${esc(e.nome)}</span>
                  ${e.ativo ? '' : ` ${selo('Inativa', 'cinza')}`}
                  <div class="mini">${esc([e.cnpj ? fDoc(e.cnpj) : null, [e.cidade, e.estado].filter(Boolean).join('/'),
                    `${e.total_caminhoes} caminhã${e.total_caminhoes === 1 ? 'o' : 'es'}`].filter(Boolean).join(' · '))}</div>
                </span>
                <span class="val">
                  <button class="botao botao-texto botao-pequeno" data-editar-empresa="${e.id}">Editar</button>
                </span>
              </div>`).join('') : '<p class="apoio">Nenhuma empresa cadastrada.</p>'}
          </div>
        </div>`;

      area.querySelector('[data-nova-empresa]').onclick = () => abrirFormEmpresa(null, desenhar);
      area.querySelectorAll('[data-editar-empresa]').forEach((b) => {
        b.onclick = async () => abrirFormEmpresa(await api.empresas.obter(Number(b.dataset.editarEmpresa)), desenhar);
      });
    } catch (erro) {
      avisarErro(erro);
      area.innerHTML = '<p class="apoio">Não foi possível carregar as empresas.</p>';
    }
  };
  await desenhar();
}

function abrirFormEmpresa(empresa, aoSalvar) {
  const { elemento, fechar } = abrirModal({
    titulo: empresa ? 'Editar empresa' : 'Cadastrar empresa',
    conteudo: `
      <form id="form-empresa" class="formulario">
        <div class="campo"><label for="em-nome">Nome <span class="obrigatorio">*</span></label>
          <input class="entrada" id="em-nome" name="nome" required value="${esc(empresa ? empresa.nome : '')}"></div>
        <div class="campo"><label for="em-razao">Razão social</label>
          <input class="entrada" id="em-razao" name="razao_social" value="${esc(empresa ? empresa.razao_social || '' : '')}"></div>
        <div class="grade-2">
          <div class="campo"><label for="em-cnpj">CNPJ</label>
            <input class="entrada" id="em-cnpj" name="cnpj" inputmode="numeric"
                   value="${empresa && empresa.cnpj ? esc(fDoc(empresa.cnpj)) : ''}"></div>
          <div class="campo"><label for="em-telefone">Telefone</label>
            <input class="entrada" id="em-telefone" name="telefone" inputmode="tel"
                   value="${empresa && empresa.telefone ? esc(fTelefone(empresa.telefone)) : ''}"></div>
        </div>
        <div class="campo"><label for="em-email">E-mail</label>
          <input class="entrada" type="email" id="em-email" name="email" value="${esc(empresa ? empresa.email || '' : '')}"></div>
        <div class="campo"><label for="em-endereco">Endereço</label>
          <input class="entrada" id="em-endereco" name="endereco" value="${esc(empresa ? empresa.endereco || '' : '')}"></div>
        <div class="grade-2">
          <div class="campo"><label for="em-cidade">Cidade</label>
            <input class="entrada" id="em-cidade" name="cidade" value="${esc(empresa ? empresa.cidade || '' : '')}"></div>
          <div class="campo"><label for="em-estado">UF</label>
            <input class="entrada" id="em-estado" name="estado" maxlength="2" style="text-transform:uppercase"
                   value="${esc(empresa ? empresa.estado || '' : '')}"></div>
        </div>
        <div class="grade-2">
          <div class="campo"><label for="em-cep">CEP</label>
            <input class="entrada" id="em-cep" name="cep" inputmode="numeric" value="${esc(empresa ? empresa.cep || '' : '')}"></div>
          <div class="campo"><label for="em-responsavel">Responsável</label>
            <input class="entrada" id="em-responsavel" name="responsavel" value="${esc(empresa ? empresa.responsavel || '' : '')}"></div>
        </div>
        <div class="campo"><label for="em-obs">Observações</label>
          <textarea class="area-texto" id="em-obs" name="observacoes" rows="2">${esc(empresa ? empresa.observacoes || '' : '')}</textarea></div>
      </form>`,
    rodape: `${empresa ? `<button class="botao botao-perigo" data-inativar>${empresa.ativo ? 'Inativar' : 'Reativar'}</button>` : ''}
             <button class="botao botao-principal" data-salvar>${empresa ? 'Salvar' : 'Cadastrar'}</button>`,
  });

  const form = elemento.querySelector('#form-empresa');
  form.cnpj.oninput = (e) => { e.target.value = mascaras.documento(e.target.value); };
  form.telefone.oninput = (e) => { e.target.value = mascaras.telefone(e.target.value); };
  form.cep.oninput = (e) => { e.target.value = mascaras.cep(e.target.value); };

  elemento.querySelector('[data-salvar]').onclick = async (e) => {
    if (!form.nome.value.trim()) { avisar('Informe o nome da empresa.', 'alerta'); return; }
    ocupado(e.target, true, 'Salvando…');
    try {
      const dados = coletarObjeto(form);
      if (empresa) await api.empresas.salvar(empresa.id, dados);
      else await api.empresas.criar(dados);
      avisar(empresa ? 'Empresa atualizada.' : 'Empresa cadastrada.', 'sucesso');
      fechar();
      aoSalvar();
    } catch (erro) {
      ocupado(e.target, false);
      if (erro.campo) marcarErro(form, erro.campo, erro.message);
      avisarErro(erro);
    }
  };

  const botaoInativar = elemento.querySelector('[data-inativar]');
  if (botaoInativar) {
    botaoInativar.onclick = async () => {
      const ok = await confirmar({
        titulo: 'Alterar situação da empresa',
        mensagem: 'Empresas inativas deixam de aparecer nas listas, mas o histórico é preservado.',
        confirmarTexto: 'Confirmar', tipo: 'neutro',
      });
      if (!ok) return;
      try {
        await api.empresas.inativar(empresa.id);
        avisar('Situação atualizada.', 'sucesso');
        fechar();
        aoSalvar();
      } catch (erro) { avisarErro(erro); }
    };
  }
}

function abrirTrocaSenha() {
  const { elemento, fechar } = abrirModal({
    titulo: 'Trocar minha senha',
    conteudo: `
      <form id="form-senha" class="formulario">
        <div class="campo"><label for="sa">Senha atual <span class="obrigatorio">*</span></label>
          <input class="entrada" type="password" id="sa" name="senha_atual" autocomplete="current-password" required></div>
        <div class="campo"><label for="sn">Nova senha <span class="obrigatorio">*</span></label>
          <input class="entrada" type="password" id="sn" name="senha_nova" minlength="8" autocomplete="new-password" required></div>
        <div class="campo"><label for="sc">Repita a nova senha <span class="obrigatorio">*</span></label>
          <input class="entrada" type="password" id="sc" name="confirmacao" minlength="8" autocomplete="new-password" required></div>
      </form>`,
    rodape: `<button class="botao botao-contorno" data-fechar>Cancelar</button>
             <button class="botao botao-principal" data-salvar>Trocar senha</button>`,
  });
  elemento.querySelector('[data-salvar]').onclick = async (e) => {
    const form = elemento.querySelector('#form-senha');
    if (form.senha_nova.value !== form.confirmacao.value) {
      avisar('A confirmação não confere com a nova senha.', 'alerta');
      return;
    }
    ocupado(e.target, true, 'Salvando…');
    try {
      await api.autenticacao.trocarSenha(coletarObjeto(form));
      avisar('Senha alterada com sucesso.', 'sucesso');
      fechar();
    } catch (erro) { ocupado(e.target, false); avisarErro(erro); }
  };
}

async function abrirHistoricoGeral() {
  const { elemento } = abrirModal({
    titulo: 'Histórico do sistema',
    conteudo: carregando(4),
    largura: '760px',
  });
  const corpo = elemento.querySelector('.modal-corpo');
  try {
    const { itens, total } = await api.sistema.historico({ por_pagina: 120 });
    corpo.innerHTML = `
      <p class="mini mb12">${numero(total)} registro(s) — exibindo os ${itens.length} mais recentes.</p>
      <div class="tabela-rolagem">
        <table class="tabela">
          <thead><tr><th>Quando</th><th>Usuário</th><th>Registro</th><th>Ação</th></tr></thead>
          <tbody>
            ${itens.map((h) => `<tr>
              <td class="mini">${dataHora(h.criado_em)}</td>
              <td>${esc(h.usuario_nome || 'Sistema')}</td>
              <td class="mini">${esc(h.entidade)}${h.entidade_id ? ` #${h.entidade_id}` : ''}</td>
              <td>${esc(h.descricao || h.acao)}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (erro) {
    corpo.innerHTML = '<p class="apoio">Não foi possível carregar o histórico.</p>';
  }
}
