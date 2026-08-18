/** Telas de acesso: login, recuperação e redefinição de senha. */
import { api } from '../api.js';
import { estado } from '../estado.js';
import { avisar, avisarErro, icone, ocupado } from '../ui.js';
import { esc } from '../utils.js';

const moldura = (conteudo, rodape = '') => `
  <div class="tela-acesso">
    <div class="acesso-caixa">
      <div class="acesso-marca">
        <img src="/img/logo.png" alt="SOS Truck Service" class="acesso-marca-logo" width="84" height="84">
        <div class="sub">Gestão de Fichas e Peças</div>
      </div>
      <div class="acesso-cartao">${conteudo}</div>
      ${rodape}
      <div class="acesso-rodape">SOS Truck Service · Sistema interno de manutenção de frota</div>
    </div>
  </div>`;

export function telaLogin(raiz, { aoEntrar, irPara }) {
  raiz.innerHTML = moldura(`
    <h1>Entrar no sistema</h1>
    <p class="apoio">Use o e-mail e a senha cadastrados pela administração.</p>
    <form class="formulario" id="form-login" novalidate>
      <div class="campo">
        <label for="email">E-mail</label>
        <input class="entrada" type="email" id="email" name="email" inputmode="email"
               autocomplete="username" placeholder="seu.nome@sostruck.com.br" required>
      </div>
      <div class="campo">
        <label for="senha">Senha</label>
        <div style="position:relative">
          <input class="entrada" type="password" id="senha" name="senha" autocomplete="current-password"
                 placeholder="Sua senha" required style="padding-right:52px">
          <button type="button" class="botao-texto" data-ver-senha
                  style="position:absolute;right:4px;top:50%;transform:translateY(-50%);min-height:40px">Ver</button>
        </div>
      </div>
      <button class="botao botao-principal botao-bloco botao-grande" type="submit">Entrar</button>
      <button class="botao botao-texto botao-bloco" type="button" data-esqueci>Esqueci minha senha</button>
    </form>`, `
    <div class="acesso-demo">
      <b>Acessos de demonstração</b>
      <button type="button" data-demo="admin@sostruck.com.br">
        <span>Administração</span><span>admin@sostruck.com.br</span>
      </button>
      <button type="button" data-demo="mecanico@sostruck.com.br">
        <span>Mecânico</span><span>mecanico@sostruck.com.br</span>
      </button>
    </div>`);

  const form = raiz.querySelector('#form-login');
  const email = raiz.querySelector('#email');
  const senha = raiz.querySelector('#senha');

  raiz.querySelector('[data-ver-senha]').onclick = (e) => {
    const mostrando = senha.type === 'text';
    senha.type = mostrando ? 'password' : 'text';
    e.target.textContent = mostrando ? 'Ver' : 'Ocultar';
  };
  raiz.querySelector('[data-esqueci]').onclick = () => irPara('#/recuperar-senha');
  raiz.querySelectorAll('[data-demo]').forEach((b) => {
    b.onclick = () => { email.value = b.dataset.demo; senha.value = 'sos12345'; senha.focus(); };
  });

  form.onsubmit = async (e) => {
    e.preventDefault();
    const botao = form.querySelector('[type=submit]');
    if (!email.value.trim() || !senha.value) {
      avisar('Informe o e-mail e a senha para entrar.', 'alerta');
      return;
    }
    ocupado(botao, true, 'Entrando…');
    try {
      const { usuario } = await api.autenticacao.entrar(email.value.trim(), senha.value);
      estado.usuario = usuario;
      avisar(`Bem-vindo, ${usuario.nome.split(' ')[0]}!`, 'sucesso', 2600);
      await aoEntrar();
    } catch (erro) {
      ocupado(botao, false);
      avisarErro(erro);
      senha.value = '';
      senha.focus();
    }
  };
}

export function telaRecuperarSenha(raiz, { irPara }) {
  raiz.innerHTML = moldura(`
    <h1>Recuperar senha</h1>
    <p class="apoio">Informe seu e-mail cadastrado. Se ele existir no sistema, um link de redefinição será gerado.</p>
    <form class="formulario" id="form-recuperar" novalidate>
      <div class="campo">
        <label for="email">E-mail cadastrado</label>
        <input class="entrada" type="email" id="email" name="email" inputmode="email"
               autocomplete="username" placeholder="seu.nome@sostruck.com.br" required>
      </div>
      <button class="botao botao-principal botao-bloco botao-grande" type="submit">Gerar link de recuperação</button>
      <button class="botao botao-texto botao-bloco" type="button" data-voltar-login>Voltar para o login</button>
    </form>
    <div id="resultado-recuperacao" class="mt14"></div>`);

  raiz.querySelector('[data-voltar-login]').onclick = () => irPara('#/');

  raiz.querySelector('#form-recuperar').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const botao = form.querySelector('[type=submit]');
    ocupado(botao, true, 'Enviando…');
    try {
      const resposta = await api.autenticacao.recuperar(form.email.value.trim());
      const area = raiz.querySelector('#resultado-recuperacao');
      area.innerHTML = `
        <div class="faixa-alerta ${resposta.link_recuperacao ? 'sucesso' : 'info'}">
          ${icone(resposta.link_recuperacao ? 'certo' : 'info', 19)}
          <div><b>${esc(resposta.mensagem)}</b>
          ${resposta.link_recuperacao
            ? `<a class="botao botao-principal botao-bloco mt10" href="${esc(resposta.link_recuperacao.replace(/^\//, ''))}">Redefinir minha senha agora</a>`
            : ''}</div>
        </div>`;
      ocupado(botao, false);
    } catch (erro) {
      ocupado(botao, false);
      avisarErro(erro);
    }
  };
}

export function telaRedefinirSenha(raiz, { irPara, token }) {
  if (!token) {
    raiz.innerHTML = moldura(`
      <h1>Link inválido</h1>
      <p class="apoio">Este link de redefinição não é válido ou já foi usado.</p>
      <button class="botao botao-principal botao-bloco mt14" data-novo>Solicitar novo link</button>`);
    raiz.querySelector('[data-novo]').onclick = () => irPara('#/recuperar-senha');
    return;
  }

  raiz.innerHTML = moldura(`
    <h1>Criar nova senha</h1>
    <p class="apoio">Escolha uma senha com pelo menos 6 caracteres.</p>
    <form class="formulario" id="form-redefinir" novalidate>
      <div class="campo">
        <label for="senha">Nova senha</label>
        <input class="entrada" type="password" id="senha" name="senha" autocomplete="new-password" minlength="6" required>
      </div>
      <div class="campo">
        <label for="confirmacao">Repita a nova senha</label>
        <input class="entrada" type="password" id="confirmacao" name="confirmacao" autocomplete="new-password" minlength="6" required>
      </div>
      <button class="botao botao-principal botao-bloco botao-grande" type="submit">Salvar nova senha</button>
    </form>`);

  raiz.querySelector('#form-redefinir').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const botao = form.querySelector('[type=submit]');
    if (form.senha.value !== form.confirmacao.value) {
      avisar('As senhas digitadas não são iguais.', 'alerta');
      return;
    }
    ocupado(botao, true, 'Salvando…');
    try {
      await api.autenticacao.redefinir({ token, senha: form.senha.value, confirmacao: form.confirmacao.value });
      avisar('Senha redefinida. Faça login com a nova senha.', 'sucesso');
      irPara('#/');
    } catch (erro) {
      ocupado(botao, false);
      avisarErro(erro);
    }
  };
}
