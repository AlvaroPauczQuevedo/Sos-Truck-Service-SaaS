/** Cadastro, consulta, detalhe e histórico dos caminhões. */
import { api } from '../api.js';
import { estado, ehAdmin } from '../estado.js';
import {
  icone, seloDominio, selo, vazio, carregando, avisar, avisarErro, confirmar, abrirModal,
  campoFotos, ativarCampoFotos, coletar, galeria, ativarGaleria, marcarErro, ocupado, dado, eventoHistorico,
} from '../ui.js';
import {
  esc, placa as fPlaca, telefone as fTelefone, km as fKm, data as fData, dataHora, quando,
  moeda, mascaras, debounce, paraCampoData, hoje, numero,
} from '../utils.js';

// ================================================================ Listagem
export async function telaCaminhoes(raiz, { irPara, consulta }) {
  const filtros = {
    busca: consulta.get('busca') || '',
    status: consulta.get('status') || '',
    empresa_id: consulta.get('empresa_id') || '',
    pagina: 1,
  };

  raiz.innerHTML = `
    <div class="pagina-cabecalho">
      <div class="texto">
        <h1 class="titulo">Caminhões</h1>
        <p class="apoio">Consulte a frota, o histórico de serviços e cadastre novos veículos.</p>
      </div>
      <a class="botao botao-principal so-desktop" href="#/caminhoes/novo">${icone('mais', 18)} Cadastrar caminhão</a>
    </div>

    <div class="barra-busca">
      <div class="campo-busca">
        ${icone('busca', 18)}
        <input class="entrada" type="search" id="busca-caminhao" placeholder="Placa, chassi, frota, modelo ou motorista"
               value="${esc(filtros.busca)}" inputmode="search" autocomplete="off">
      </div>
      <button class="botao botao-contorno botao-filtro" data-filtros aria-label="Filtros">
        ${icone('filtro', 18)}<span class="marca esconder" data-marca-filtro></span>
      </button>
    </div>

    <div class="fichas-rapidas" data-atalhos>
      <button class="ficha-rapida ${!filtros.status ? 'ativa' : ''}" data-status="">Todos</button>
      <button class="ficha-rapida ${filtros.status === 'em_manutencao' ? 'ativa' : ''}" data-status="em_manutencao">Em manutenção</button>
      <button class="ficha-rapida ${filtros.status === 'parado' ? 'ativa' : ''}" data-status="parado">Parados</button>
      <button class="ficha-rapida ${filtros.status === 'disponivel' ? 'ativa' : ''}" data-status="disponivel">Disponíveis</button>
    </div>

    <div id="lista-caminhoes">${carregando(4)}</div>
    <a class="acao-flutuante" href="#/caminhoes/novo">${icone('mais', 20)} Caminhão</a>`;

  const area = raiz.querySelector('#lista-caminhoes');

  async function desenhar() {
    area.innerHTML = carregando(3);
    try {
      const { itens, total } = await api.caminhoes.listar(filtros);
      raiz.querySelector('[data-marca-filtro]').classList.toggle('esconder', !filtros.empresa_id);
      if (!itens.length) {
        area.innerHTML = vazio({
          icone: 'caminhao',
          titulo: 'Nenhum caminhão encontrado',
          texto: filtros.busca ? 'Tente outro termo de busca ou limpe os filtros.' : 'Cadastre o primeiro caminhão da frota.',
          acao: '<a class="botao botao-principal" href="#/caminhoes/novo">Cadastrar caminhão</a>',
        });
        return;
      }
      area.innerHTML = `
        <div class="mini mb8">${numero(total)} caminhã${total === 1 ? 'o' : 'es'} encontrado${total === 1 ? '' : 's'}</div>
        <div class="lista">${itens.map(cartaoCaminhao).join('')}</div>`;
      area.querySelectorAll('[data-ir]').forEach((el) => { el.onclick = () => irPara(el.dataset.ir); });
    } catch (erro) {
      avisarErro(erro);
      area.innerHTML = '<p class="apoio">Não foi possível carregar a lista.</p>';
    }
  }

  raiz.querySelector('#busca-caminhao').oninput = debounce((e) => {
    filtros.busca = e.target.value.trim();
    desenhar();
  }, 350);

  raiz.querySelectorAll('[data-atalhos] .ficha-rapida').forEach((b) => {
    b.onclick = () => {
      raiz.querySelectorAll('[data-atalhos] .ficha-rapida').forEach((x) => x.classList.remove('ativa'));
      b.classList.add('ativa');
      filtros.status = b.dataset.status;
      desenhar();
    };
  });

  raiz.querySelector('[data-filtros]').onclick = async () => {
    const { itens: empresas } = await api.empresas.listar();
    const { elemento, fechar } = abrirModal({
      titulo: 'Filtrar caminhões',
      conteudo: `
        <div class="campo">
          <label for="filtro-empresa">Empresa ou proprietário</label>
          <select class="selecao" id="filtro-empresa">
            <option value="">Todas as empresas</option>
            ${empresas.map((e) => `<option value="${e.id}" ${String(filtros.empresa_id) === String(e.id) ? 'selected' : ''}>${esc(e.nome)}</option>`).join('')}
          </select>
        </div>`,
      rodape: `<button class="botao botao-contorno" data-limpar>Limpar</button>
               <button class="botao botao-principal" data-aplicar>Aplicar</button>`,
    });
    elemento.querySelector('[data-limpar]').onclick = () => { filtros.empresa_id = ''; fechar(); desenhar(); };
    elemento.querySelector('[data-aplicar]').onclick = () => {
      filtros.empresa_id = elemento.querySelector('#filtro-empresa').value;
      fechar(); desenhar();
    };
  };

  await desenhar();
}

const cartaoCaminhao = (c) => `
  <div class="cartao cartao-clicavel" data-ir="#/caminhoes/${c.id}">
    <div class="cartao-corpo flex g12 centro">
      ${c.foto_capa
        ? `<img src="/arquivos/${esc(c.foto_capa)}" alt="" style="width:62px;height:62px;object-fit:cover;border-radius:10px;flex:none">`
        : `<div style="width:62px;height:62px;border-radius:10px;background:var(--cinza-bg);display:grid;place-items:center;color:var(--cinza-suave);flex:none">${icone('caminhao', 26)}</div>`}
      <div class="crescer" style="min-width:0">
        <div class="flex centro g8 quebra mb8">
          <span class="etiqueta-placa">${esc(fPlaca(c.placa))}</span>
          ${c.codigo_frota ? `<span class="etiqueta-frota">${esc(c.codigo_frota)}</span>` : ''}
          ${seloDominio(estado.dominios.status_caminhao, c.status)}
        </div>
        <div class="negrito truncar">${esc([c.marca, c.modelo].filter(Boolean).join(' ') || 'Sem modelo informado')}</div>
        <div class="mini truncar">${esc(c.empresa_nome || 'Sem empresa')} · ${fKm(c.km_atual)}${c.fichas_abertas ? ` · <span style="color:var(--laranja);font-weight:600">${c.fichas_abertas} ficha(s) aberta(s)</span>` : ''}</div>
      </div>
      ${icone('avancar', 18)}
    </div>
  </div>`;

// ================================================================ Formulário
export async function telaCaminhaoForm(raiz, { partes, irPara, voltar }) {
  const id = partes[0] ? Number(partes[0]) : null;
  const [caminhao, { itens: empresas }] = await Promise.all([
    id ? api.caminhoes.obter(id) : Promise.resolve(null),
    api.empresas.listar(),
  ]);
  const d = estado.dominios;
  const anoAtual = new Date().getFullYear();

  raiz.innerHTML = `
    <div class="pagina-cabecalho">
      <div class="texto">
        <h1 class="titulo">${id ? 'Editar caminhão' : 'Cadastrar caminhão'}</h1>
        <p class="apoio">A placa e o chassi identificam o veículo e evitam cadastros repetidos.</p>
      </div>
    </div>

    <form id="form-caminhao" class="formulario" novalidate>
      <fieldset class="grupo-campos">
        <legend>Identificação</legend>
        <div class="formulario">
          <div class="campo">
            <label for="placa">Placa <span class="obrigatorio">*</span></label>
            <input class="entrada entrada-placa" id="placa" name="placa" maxlength="7" required
                   autocapitalize="characters" autocomplete="off" placeholder="ABC1D23"
                   value="${esc(caminhao ? caminhao.placa : '')}">
            <span class="dica" data-aviso-placa>Formato antigo (ABC1234) ou Mercosul (ABC1D23).</span>
          </div>
          <div class="grade-2">
            <div class="campo">
              <label for="codigo_frota">Número / código da frota</label>
              <input class="entrada" id="codigo_frota" name="codigo_frota" placeholder="F-101" autocomplete="off"
                     value="${esc(caminhao ? caminhao.codigo_frota || '' : '')}">
            </div>
            <div class="campo">
              <label for="cor">Cor</label>
              <input class="entrada" id="cor" name="cor" placeholder="Branco"
                     value="${esc(caminhao ? caminhao.cor || '' : '')}">
            </div>
          </div>
          <div class="campo">
            <label for="chassi">Chassi</label>
            <input class="entrada" id="chassi" name="chassi" maxlength="21" autocapitalize="characters" autocomplete="off"
                   placeholder="9BM9580848B123456" value="${esc(caminhao ? caminhao.chassi || '' : '')}">
            <span class="dica" data-aviso-chassi>Entre 11 e 21 caracteres, sem pontos ou espaços.</span>
          </div>
        </div>
      </fieldset>

      <fieldset class="grupo-campos">
        <legend>Veículo</legend>
        <div class="formulario">
          <div class="grade-2">
            <div class="campo">
              <label for="marca">Marca</label>
              <input class="entrada" id="marca" name="marca" list="lista-marcas" placeholder="Scania"
                     value="${esc(caminhao ? caminhao.marca || '' : '')}">
              <datalist id="lista-marcas">
                ${['Scania','Volvo','Mercedes-Benz','Volkswagen','Iveco','DAF','Ford','MAN','International','Hyundai','Agrale','Outra']
                  .map((m) => `<option value="${m}">`).join('')}
              </datalist>
            </div>
            <div class="campo">
              <label for="modelo">Modelo</label>
              <input class="entrada" id="modelo" name="modelo" placeholder="R 450"
                     value="${esc(caminhao ? caminhao.modelo || '' : '')}">
            </div>
          </div>
          <div class="campo">
            <label for="versao">Versão</label>
            <input class="entrada" id="versao" name="versao" placeholder="Highline 6x2"
                   value="${esc(caminhao ? caminhao.versao || '' : '')}">
          </div>
          <div class="grade-2">
            <div class="campo">
              <label for="ano_fabricacao">Ano de fabricação</label>
              <input class="entrada" type="number" inputmode="numeric" id="ano_fabricacao" name="ano_fabricacao"
                     min="1950" max="${anoAtual + 1}" placeholder="${anoAtual - 4}"
                     value="${caminhao && caminhao.ano_fabricacao ? caminhao.ano_fabricacao : ''}">
            </div>
            <div class="campo">
              <label for="ano_modelo">Ano do modelo</label>
              <input class="entrada" type="number" inputmode="numeric" id="ano_modelo" name="ano_modelo"
                     min="1950" max="${anoAtual + 2}" placeholder="${anoAtual - 3}"
                     value="${caminhao && caminhao.ano_modelo ? caminhao.ano_modelo : ''}">
            </div>
          </div>
          <div class="campo">
            <label for="tipo">Tipo de caminhão</label>
            <select class="selecao" id="tipo" name="tipo">
              <option value="">Selecione o tipo</option>
              ${d.tipos_caminhao.map((t) => `<option value="${esc(t)}" ${caminhao && caminhao.tipo === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
            </select>
          </div>
          <div class="grade-2">
            <div class="campo">
              <label for="km_atual">Quilometragem atual</label>
              <input class="entrada" type="number" inputmode="numeric" id="km_atual" name="km_atual" min="0"
                     placeholder="0" value="${caminhao ? caminhao.km_atual || 0 : ''}">
            </div>
            <div class="campo">
              <label for="status">Situação</label>
              <select class="selecao" id="status" name="status">
                ${Object.entries(d.status_caminhao).map(([k, v]) =>
                  `<option value="${k}" ${caminhao && caminhao.status === k ? 'selected' : ''}>${esc(v.rotulo)}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>
      </fieldset>

      <fieldset class="grupo-campos">
        <legend>Proprietário e motorista</legend>
        <div class="formulario">
          <div class="campo">
            <label for="empresa_id">Empresa ou proprietário</label>
            <select class="selecao" id="empresa_id" name="empresa_id">
              <option value="">Sem empresa vinculada</option>
              ${empresas.map((e) => `<option value="${e.id}" ${caminhao && String(caminhao.empresa_id) === String(e.id) ? 'selected' : ''}>${esc(e.nome)}</option>`).join('')}
            </select>
            ${ehAdmin() ? '<span class="dica">Cadastre novas empresas em Configurações › Empresas.</span>' : ''}
          </div>
          <div class="grade-2">
            <div class="campo">
              <label for="motorista_nome">Nome do motorista</label>
              <input class="entrada" id="motorista_nome" name="motorista_nome" autocomplete="off"
                     value="${esc(caminhao ? caminhao.motorista_nome || '' : '')}">
            </div>
            <div class="campo">
              <label for="motorista_telefone">Telefone do motorista</label>
              <input class="entrada" id="motorista_telefone" name="motorista_telefone" inputmode="tel"
                     placeholder="(41) 99999-9999" value="${esc(caminhao ? fTelefone(caminhao.motorista_telefone) === '—' ? '' : fTelefone(caminhao.motorista_telefone) : '')}">
            </div>
          </div>
          <div class="campo">
            <label for="data_entrada">Data de entrada</label>
            <input class="entrada" type="date" id="data_entrada" name="data_entrada"
                   value="${caminhao && caminhao.data_entrada ? paraCampoData(caminhao.data_entrada) : hoje()}">
          </div>
        </div>
      </fieldset>

      <fieldset class="grupo-campos">
        <legend>Complemento</legend>
        <div class="formulario">
          <div class="campo">
            <label for="observacoes">Observações gerais</label>
            <textarea class="area-texto" id="observacoes" name="observacoes" rows="3"
              placeholder="Particularidades do veículo, adaptações, avarias conhecidas…">${esc(caminhao ? caminhao.observacoes || '' : '')}</textarea>
          </div>
          ${campoFotos('fotos', id ? 'Adicionar novas fotos' : 'Fotos do caminhão')}
          ${caminhao && caminhao.fotos && caminhao.fotos.length ? `
            <div class="campo">
              <label>Fotos já cadastradas</label>
              <div data-galeria-existente>${galeria(caminhao.fotos, { removivel: true })}</div>
            </div>` : ''}
        </div>
      </fieldset>

      <div class="botoes-empilhados">
        <button class="botao botao-principal botao-grande botao-bloco" type="submit">
          ${icone('certo', 18)} ${id ? 'Salvar alterações' : 'Cadastrar caminhão'}
        </button>
        <button class="botao botao-contorno botao-bloco" type="button" data-cancelar>Cancelar</button>
      </div>
    </form>`;

  const form = raiz.querySelector('#form-caminhao');
  const fotos = ativarCampoFotos(raiz, 'fotos');
  raiz.querySelector('[data-cancelar]').onclick = voltar;

  const galeriaExistente = raiz.querySelector('[data-galeria-existente]');
  if (galeriaExistente) {
    ativarGaleria(galeriaExistente, async (fotoId) => {
      try {
        await api.fotos.excluir(fotoId);
        avisar('Foto removida da ficha. O arquivo original continua guardado.', 'sucesso');
        irPara(`#/caminhoes/${id}/editar`);
      } catch (erro) { avisarErro(erro); }
    });
  }

  // Máscaras
  const campoPlaca = form.placa;
  const campoChassi = form.chassi;
  campoPlaca.oninput = () => { campoPlaca.value = mascaras.placa(campoPlaca.value); };
  campoChassi.oninput = () => { campoChassi.value = mascaras.chassi(campoChassi.value); };
  form.motorista_telefone.oninput = (e) => { e.target.value = mascaras.telefone(e.target.value); };

  // Aviso de duplicidade em tempo real
  const conferirDuplicidade = debounce(async () => {
    const avisoPlaca = raiz.querySelector('[data-aviso-placa]');
    const avisoChassi = raiz.querySelector('[data-aviso-chassi]');
    if (campoPlaca.value.length < 7 && campoChassi.value.length < 11) return;
    try {
      const r = await api.caminhoes.duplicidade({ placa: campoPlaca.value, chassi: campoChassi.value });
      const conflitoPlaca = r.placa && r.placa.id !== id;
      const conflitoChassi = r.chassi && r.chassi.id !== id;
      avisoPlaca.innerHTML = conflitoPlaca
        ? `<span style="color:var(--vermelho);font-weight:600">Placa já cadastrada — ${esc(fPlaca(r.placa.placa))} ${esc(r.placa.marca || '')} ${esc(r.placa.modelo || '')}</span>`
        : 'Formato antigo (ABC1234) ou Mercosul (ABC1D23).';
      avisoChassi.innerHTML = conflitoChassi
        ? `<span style="color:var(--vermelho);font-weight:600">Chassi já usado pelo caminhão ${esc(fPlaca(r.chassi.placa))}.</span>`
        : 'Entre 11 e 21 caracteres, sem pontos ou espaços.';
    } catch (_) { /* verificação é apenas um apoio */ }
  }, 500);
  campoPlaca.addEventListener('input', conferirDuplicidade);
  campoChassi.addEventListener('input', conferirDuplicidade);

  form.onsubmit = async (e) => {
    e.preventDefault();
    const botao = form.querySelector('[type=submit]');
    const dados = coletar(form, fotos);
    dados.set('motorista_telefone', form.motorista_telefone.value.replace(/\D/g, ''));
    ocupado(botao, true, 'Salvando…');
    try {
      const salvo = id ? await api.caminhoes.salvar(id, dados) : await api.caminhoes.criar(dados);
      avisar(id ? 'Caminhão atualizado.' : `Caminhão ${fPlaca(salvo.placa)} cadastrado.`, 'sucesso');
      irPara(`#/caminhoes/${salvo.id}`);
    } catch (erro) {
      ocupado(botao, false);
      if (erro.detalhes && erro.detalhes.requer_confirmacao && erro.campo === 'km_atual') {
        const ok = await confirmar({ titulo: 'Confirmar quilometragem', mensagem: erro.message, confirmarTexto: 'Confirmar' });
        if (ok) {
          dados.set('confirmar_km', '1');
          try {
            const salvo = await api.caminhoes.salvar(id, dados);
            avisar('Caminhão atualizado.', 'sucesso');
            irPara(`#/caminhoes/${salvo.id}`);
          } catch (e2) { avisarErro(e2); }
        }
        return;
      }
      if (erro.campo) marcarErro(form, erro.campo, erro.message);
      avisarErro(erro);
    }
  };
}

// ================================================================ Detalhe
export async function telaCaminhaoDetalhe(raiz, { partes, irPara, recarregar }) {
  const id = Number(partes[0]);
  const c = await api.caminhoes.obter(id);
  const admin = ehAdmin();

  raiz.innerHTML = `
    <div class="cartao mb12">
      <div class="cartao-corpo">
        <div class="flex centro g10 quebra mb12">
          <span class="etiqueta-placa" style="font-size:16px;padding:5px 12px">${esc(fPlaca(c.placa))}</span>
          ${c.codigo_frota ? `<span class="etiqueta-frota">${esc(c.codigo_frota)}</span>` : ''}
          ${seloDominio(estado.dominios.status_caminhao, c.status, 'selo-grande')}
          ${c.ativo ? '' : selo('Inativo', 'cinza')}
        </div>
        <h1 class="titulo mb8">${esc([c.marca, c.modelo, c.versao].filter(Boolean).join(' ') || 'Caminhão sem modelo')}</h1>
        <div class="dados-grade mt14">
          ${dado('Empresa / proprietário', esc(c.empresa_nome || '—'))}
          ${dado('Quilometragem', fKm(c.km_atual))}
          ${dado('Ano fab./modelo', c.ano_fabricacao ? `${c.ano_fabricacao}/${c.ano_modelo || c.ano_fabricacao}` : '—')}
          ${dado('Tipo', esc(c.tipo || '—'))}
          ${dado('Cor', esc(c.cor || '—'))}
          ${dado('Chassi', `<span style="font-size:12.5px;word-break:break-all">${esc(c.chassi || '—')}</span>`)}
          ${dado('Motorista', esc(c.motorista_nome || '—'))}
          ${dado('Telefone', c.motorista_telefone
            ? `<a href="tel:${esc(c.motorista_telefone)}">${esc(fTelefone(c.motorista_telefone))}</a>` : '—')}
          ${dado('Data de entrada', fData(c.data_entrada))}
          ${admin && c.total_investido !== undefined ? dado('Total já investido', `<span class="cor-vermelho">${moeda(c.total_investido)}</span>`) : ''}
        </div>
        ${c.observacoes ? `<div class="mt14"><div class="rotulo-campo">Observações</div>
          <div class="texto-bloco mt6">${esc(c.observacoes)}</div></div>` : ''}
      </div>
      <div class="cartao-rodape">
        <a class="botao botao-principal botao-pequeno" href="#/ficha/nova?caminhao=${c.id}">${icone('mais', 16)} Abrir ficha</a>
        <a class="botao botao-contorno botao-pequeno" href="#/caminhoes/${c.id}/editar">${icone('lapis', 16)} Editar</a>
        ${admin ? `<button class="botao ${c.ativo ? 'botao-perigo' : 'botao-contorno'} botao-pequeno" data-inativar>
          ${c.ativo ? 'Inativar' : 'Reativar'}</button>` : ''}
      </div>
    </div>

    ${c.fotos.length ? `
      <h2 class="secao">Fotos do caminhão</h2>
      <div class="cartao"><div class="cartao-corpo" data-galeria>${galeria(c.fotos)}</div></div>` : ''}

    <h2 class="secao">Histórico de fichas e serviços</h2>
    ${c.fichas.length ? `
      <div class="lista">
        ${c.fichas.map((f) => `
          <div class="cartao cartao-clicavel" data-ir="#/fichas/${f.id}">
            <div class="cartao-corpo">
              <div class="flex entre centro g8 quebra mb8">
                <span class="numero-doc">${esc(f.numero)}</span>
                ${seloDominio(estado.dominios.status_ficha, f.status)}
              </div>
              <div class="apoio truncar">${esc(f.motivo_entrada || 'Sem motivo informado')}</div>
              <div class="mini mt6">
                ${fData(f.aberta_em)} · ${esc(f.mecanico_nome)} ·
                ${f.total_problemas} problema(s) · ${f.total_pecas} peça(s)
                ${f.km ? ` · ${fKm(f.km)}` : ''}
              </div>
            </div>
          </div>`).join('')}
      </div>` : vazio({
        icone: 'ficha', titulo: 'Nenhuma ficha registrada',
        texto: 'Este caminhão ainda não passou por inspeção no sistema.',
        acao: `<a class="botao botao-principal" href="#/ficha/nova?caminhao=${c.id}">Abrir primeira ficha</a>`,
      })}

    <h2 class="secao">Alterações do cadastro</h2>
    <div class="cartao"><div class="cartao-corpo">
      ${c.historico.length
        ? `<div class="linha-tempo">${c.historico.map((h, i) => eventoHistorico(h, i === 0)).join('')}</div>`
        : '<p class="apoio">Nenhuma alteração registrada.</p>'}
    </div></div>`;

  raiz.querySelectorAll('[data-ir]').forEach((el) => { el.onclick = () => irPara(el.dataset.ir); });
  const areaGaleria = raiz.querySelector('[data-galeria]');
  if (areaGaleria) ativarGaleria(areaGaleria);

  const botaoInativar = raiz.querySelector('[data-inativar]');
  if (botaoInativar) {
    botaoInativar.onclick = async () => {
      const resposta = await confirmar({
        titulo: c.ativo ? 'Inativar caminhão' : 'Reativar caminhão',
        mensagem: c.ativo
          ? 'O caminhão deixa de aparecer nas listas, mas todo o histórico é preservado. Deseja continuar?'
          : 'O caminhão volta a ficar disponível para novas fichas.',
        confirmarTexto: c.ativo ? 'Inativar' : 'Reativar',
        pedirMotivo: !!c.ativo,
        rotuloMotivo: 'Motivo da inativação',
      });
      if (!resposta) return;
      try {
        await api.caminhoes.inativar(c.id, { motivo: resposta.motivo });
        avisar(c.ativo ? 'Caminhão inativado.' : 'Caminhão reativado.', 'sucesso');
        recarregar();
      } catch (erro) { avisarErro(erro); }
    };
  }
}
