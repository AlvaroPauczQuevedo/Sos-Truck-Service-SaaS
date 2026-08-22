/** Gestão de usuários (administração). */
import { api } from '../api.js';
import { estado } from '../estado.js';
import {
  icone, selo, vazio, carregando, avisar, avisarErro, confirmar, abrirModal,
  coletarObjeto, marcarErro, ocupado, dado,
} from '../ui.js';
import { esc, telefone as fTelefone, dataHora, numero, debounce, juntar, mascaras } from '../utils.js';

export async function telaUsuarios(raiz) {
  const filtros = { busca: '', perfil: '', inativos: '' };

  raiz.innerHTML = `
    <div class="pagina-cabecalho">
      <div class="texto">
        <h1 class="titulo">Gestão de usuários</h1>
        <p class="apoio">Cadastre mecânicos e administradores e defina o nível de acesso.</p>
      </div>
      <button class="botao botao-principal so-desktop" data-novo>${icone('mais', 18)} Novo usuário</button>
    </div>

    <div class="barra-busca">
      <div class="campo-busca">
        ${icone('busca', 18)}
        <input class="entrada" type="search" id="busca-usuario" placeholder="Nome, e-mail ou matrícula"
               inputmode="search" autocomplete="off">
      </div>
    </div>

    <div class="fichas-rapidas" data-atalhos>
      <button class="ficha-rapida ativa" data-perfil="">Todos</button>
      <button class="ficha-rapida" data-perfil="mecanico">Mecânicos</button>
      <button class="ficha-rapida" data-perfil="admin">Administração</button>
      <button class="ficha-rapida" data-inativos="1">Inativos</button>
    </div>

    <div id="lista-usuarios">${carregando(3)}</div>
    <button class="acao-flutuante" data-novo>${icone('mais', 20)} Usuário</button>`;

  const area = raiz.querySelector('#lista-usuarios');

  async function desenhar() {
    area.innerHTML = carregando(3);
    try {
      const { itens } = await api.usuarios.listar(filtros);
      if (!itens.length) {
        area.innerHTML = vazio({ icone: 'usuarios', titulo: 'Nenhum usuário encontrado' });
        return;
      }
      area.innerHTML = `
        <div class="mini mb8">${numero(itens.length)} usuário(s)</div>
        <div class="lista">
          ${itens.map((u) => `
            <div class="cartao">
              <div class="cartao-corpo">
                <div class="flex entre centro g8 quebra mb8">
                  <h3 class="sub crescer">${esc(u.nome)}</h3>
                  <div class="flex g6">
                    ${selo(u.perfil === 'admin' ? 'Administração' : 'Mecânico', u.perfil === 'admin' ? 'vermelho' : 'azul')}
                    ${u.ativo ? '' : selo('Inativo', 'cinza')}
                  </div>
                </div>
                <div class="dados-grade">
                  ${dado('E-mail', esc(u.email))}
                  ${dado('Telefone', u.telefone ? esc(fTelefone(u.telefone)) : '—')}
                  ${dado('Matrícula', esc(u.matricula || '—'))}
                  ${dado('Fichas', `${u.total_fichas} · ${u.fichas_abertas} em aberto`)}
                  ${dado('Último acesso', u.ultimo_acesso ? dataHora(u.ultimo_acesso) : 'Nunca acessou')}
                </div>
              </div>
              <div class="cartao-rodape">
                <button class="botao botao-contorno botao-pequeno" data-editar="${u.id}">${icone('lapis', 15)} Editar</button>
                <button class="botao botao-contorno botao-pequeno" data-senha="${u.id}" data-nome="${esc(u.nome)}">${icone('chave', 15)} Redefinir senha</button>
                ${u.ativo ? `<button class="botao botao-contorno botao-pequeno" data-link="${u.id}" data-nome="${esc(u.nome)}">${icone('compartilhar', 15)} Gerar link</button>` : ''}
                ${u.id === estado.usuario.id ? '<span class="mini" style="align-self:center">Seu usuário</span>' : `
                  <button class="botao botao-texto botao-pequeno ${u.ativo ? 'cor-vermelho' : ''}" data-inativar="${u.id}">
                    ${u.ativo ? 'Inativar' : 'Reativar'}</button>`}
              </div>
            </div>`).join('')}
        </div>`;

      area.querySelectorAll('[data-editar]').forEach((b) => {
        b.onclick = () => {
          const u = itens.find((x) => x.id === Number(b.dataset.editar));
          abrirForm(u, desenhar);
        };
      });
      area.querySelectorAll('[data-senha]').forEach((b) => {
        b.onclick = () => abrirRedefinicao(Number(b.dataset.senha), b.dataset.nome);
      });
      area.querySelectorAll('[data-link]').forEach((b) => {
        b.onclick = () => gerarLinkRecuperacao(Number(b.dataset.link), b.dataset.nome, b);
      });
      area.querySelectorAll('[data-inativar]').forEach((b) => {
        b.onclick = async () => {
          const ok = await confirmar({
            titulo: 'Alterar situação do usuário',
            mensagem: 'Usuários inativos não conseguem acessar o sistema, mas o histórico é preservado.',
            confirmarTexto: 'Confirmar', tipo: 'neutro',
          });
          if (!ok) return;
          try {
            await api.usuarios.inativar(Number(b.dataset.inativar));
            avisar('Situação atualizada.', 'sucesso');
            desenhar();
          } catch (erro) { avisarErro(erro); }
        };
      });
    } catch (erro) {
      avisarErro(erro);
      area.innerHTML = '<p class="apoio">Não foi possível carregar os usuários.</p>';
    }
  }

  raiz.querySelector('#busca-usuario').oninput = debounce((e) => { filtros.busca = e.target.value.trim(); desenhar(); }, 350);
  raiz.querySelectorAll('[data-atalhos] .ficha-rapida').forEach((b) => {
    b.onclick = () => {
      raiz.querySelectorAll('[data-atalhos] .ficha-rapida').forEach((x) => x.classList.remove('ativa'));
      b.classList.add('ativa');
      filtros.perfil = b.dataset.perfil || '';
      filtros.inativos = b.dataset.inativos || '';
      desenhar();
    };
  });
  raiz.querySelectorAll('[data-novo]').forEach((b) => { b.onclick = () => abrirForm(null, desenhar); });

  await desenhar();
}

function abrirForm(usuario, aoSalvar) {
  const { elemento, fechar } = abrirModal({
    titulo: usuario ? 'Editar usuário' : 'Novo usuário',
    conteudo: `
      <form id="form-usuario" class="formulario">
        <div class="campo">
          <label for="us-nome">Nome completo <span class="obrigatorio">*</span></label>
          <input class="entrada" id="us-nome" name="nome" required minlength="3" value="${esc(usuario ? usuario.nome : '')}">
        </div>
        <div class="campo">
          <label for="us-email">E-mail de acesso <span class="obrigatorio">*</span></label>
          <input class="entrada" type="email" id="us-email" name="email" inputmode="email" required
                 value="${esc(usuario ? usuario.email : '')}">
        </div>
        <div class="campo">
          <label>Perfil de acesso <span class="obrigatorio">*</span></label>
          <div class="opcoes-toque">
            <input type="radio" name="perfil" id="us-perfil-mec" value="mecanico" ${!usuario || usuario.perfil === 'mecanico' ? 'checked' : ''}>
            <label for="us-perfil-mec">Mecânico</label>
            <input type="radio" name="perfil" id="us-perfil-adm" value="admin" ${usuario && usuario.perfil === 'admin' ? 'checked' : ''}>
            <label for="us-perfil-adm">Administração</label>
          </div>
          <span class="dica">O mecânico não acessa valores, fornecedores nem ordens de compra.</span>
        </div>
        <div class="grade-2">
          <div class="campo"><label for="us-telefone">Telefone</label>
            <input class="entrada" id="us-telefone" name="telefone" inputmode="tel"
                   value="${usuario && usuario.telefone ? esc(fTelefone(usuario.telefone)) : ''}"></div>
          <div class="campo"><label for="us-matricula">Matrícula</label>
            <input class="entrada" id="us-matricula" name="matricula" value="${esc(usuario ? usuario.matricula || '' : '')}"></div>
        </div>
        ${usuario ? '' : `
          <div class="campo">
            <label for="us-senha">Senha inicial <span class="obrigatorio">*</span></label>
            <input class="entrada" type="text" id="us-senha" name="senha" minlength="8" required
                   placeholder="Mínimo de 8 caracteres" autocomplete="new-password">
            <span class="dica">Informe esta senha ao usuário — ele poderá alterá-la depois.</span>
          </div>`}
      </form>`,
    rodape: `<button class="botao botao-contorno" data-fechar>Cancelar</button>
             <button class="botao botao-principal" data-salvar>${usuario ? 'Salvar' : 'Cadastrar'}</button>`,
  });

  const form = elemento.querySelector('#form-usuario');
  form.telefone.oninput = (e) => { e.target.value = mascaras.telefone(e.target.value); };

  elemento.querySelector('[data-salvar]').onclick = async (e) => {
    const dados = coletarObjeto(form);
    dados.telefone = String(dados.telefone || '').replace(/\D/g, '');
    if (!dados.nome || dados.nome.trim().length < 3 || !dados.email) {
      avisar('Informe o nome completo e o e-mail.', 'alerta');
      return;
    }
    ocupado(e.target, true, 'Salvando…');
    try {
      if (usuario) await api.usuarios.salvar(usuario.id, dados);
      else await api.usuarios.criar(dados);
      avisar(usuario ? 'Usuário atualizado.' : 'Usuário cadastrado.', 'sucesso');
      fechar();
      aoSalvar();
    } catch (erro) {
      ocupado(e.target, false);
      if (erro.campo) marcarErro(form, erro.campo, erro.message);
      avisarErro(erro);
    }
  };
}

/**
 * Gera o link de redefinição para a administração entregar ao usuário.
 * O link vale por uma hora e substitui o antigo "gerar link" da tela de login,
 * que entregava o token para qualquer um que soubesse o e-mail.
 */
async function gerarLinkRecuperacao(id, nome, botao) {
  ocupado(botao, true, 'Gerando…');
  let resposta;
  try {
    resposta = await api.usuarios.linkRecuperacao(id);
  } catch (erro) {
    ocupado(botao, false);
    avisarErro(erro);
    return;
  }
  ocupado(botao, false);

  const url = `${window.location.origin}/${resposta.link.replace(/^\//, '')}`;
  const { elemento, fechar } = abrirModal({
    titulo: 'Link de redefinição',
    conteudo: `
      <p class="apoio mb12">Entregue este link a <b>${esc(nome)}</b>. Ele vale
        <b>1 hora</b>, serve uma única vez e permite escolher uma nova senha.</p>
      <div class="campo">
        <label for="link-recuperacao">Link</label>
        <input class="entrada" id="link-recuperacao" type="text" readonly value="${esc(url)}">
      </div>
      <div class="faixa-alerta alerta mt12">${icone('alerta', 19)}
        <div>Quem tiver este link troca a senha de ${esc(nome)} sem precisar da senha atual.
        Envie apenas para a própria pessoa.</div>
      </div>`,
    rodape: `<button class="botao botao-contorno" data-fechar>Fechar</button>
             <button class="botao botao-principal" data-copiar>${icone('compartilhar', 16)} Copiar link</button>`,
  });

  const campo = elemento.querySelector('#link-recuperacao');
  campo.onfocus = () => campo.select();

  elemento.querySelector('[data-copiar]').onclick = async () => {
    try {
      await navigator.clipboard.writeText(url);
      avisar('Link copiado para a área de transferência.', 'sucesso');
      fechar();
    } catch (_) {
      campo.select();
      avisar('Copie o link selecionado acima.', 'info');
    }
  };
}

function abrirRedefinicao(id, nome) {
  const { elemento, fechar } = abrirModal({
    titulo: 'Redefinir senha',
    conteudo: `
      <p class="apoio mb12">Defina uma nova senha para <b>${esc(nome)}</b> e informe ao usuário.</p>
      <div class="campo">
        <label for="nova-senha">Nova senha <span class="obrigatorio">*</span></label>
        <input class="entrada" type="text" id="nova-senha" minlength="8" placeholder="Mínimo de 8 caracteres" autocomplete="new-password">
      </div>`,
    rodape: `<button class="botao botao-contorno" data-fechar>Cancelar</button>
             <button class="botao botao-principal" data-salvar>Redefinir senha</button>`,
  });
  elemento.querySelector('[data-salvar]').onclick = async (e) => {
    const senha = elemento.querySelector('#nova-senha').value;
    if (senha.length < 8) { avisar('A senha precisa ter ao menos 8 caracteres.', 'alerta'); return; }
    ocupado(e.target, true, 'Salvando…');
    try {
      await api.usuarios.redefinirSenha(id, senha);
      avisar('Senha redefinida. Informe a nova senha ao usuário.', 'sucesso');
      fechar();
    } catch (erro) { ocupado(e.target, false); avisarErro(erro); }
  };
}
