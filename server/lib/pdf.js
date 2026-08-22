'use strict';
/** Geracao de PDF (ordem de compra e ficha mecanica) com PDFKit. */
const PDFDocument = require('pdfkit');
const f = require('./formato');
const imagem = require('./imagem');
const { STATUS_OC, STATUS_FICHA, PRIORIDADES, GRAVIDADES, URGENCIAS, STATUS_PECA, TIPOS_PECA } = require('./dominio');

const VERMELHO = '#C81E1E';
const GRAFITE = '#23262B';
const CINZA = '#6B7280';
const CINZA_CLARO = '#F1F2F4';
const BORDA = '#D8DADE';

const MARGEM = 40;
const LARGURA = 595.28 - MARGEM * 2; // A4 retrato

function novoDocumento(titulo) {
  const doc = new PDFDocument({
    size: 'A4', margin: MARGEM, bufferPages: true,
    info: { Title: titulo, Author: 'SOS Truck Service', Creator: 'SOS Truck Service' },
  });
  return doc;
}

function cabecalho(doc, titulo, subtitulo, config) {
  const y0 = MARGEM;
  doc.rect(MARGEM, y0, LARGURA, 62).fill(GRAFITE);
  doc.rect(MARGEM, y0, 6, 62).fill(VERMELHO);

  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(16)
    .text(config.empresa_nome || 'SOS TRUCK SERVICE', MARGEM + 18, y0 + 12, { width: LARGURA - 220 });
  doc.font('Helvetica').fontSize(8).fillColor('#C9CCD2')
    .text(
      [config.empresa_documento && `CNPJ ${f.documento(config.empresa_documento)}`,
       config.empresa_telefone && f.telefone(config.empresa_telefone),
       config.empresa_email].filter(Boolean).join('  •  ') || 'Gestão de Fichas e Peças',
      MARGEM + 18, y0 + 33, { width: LARGURA - 220 }
    );

  doc.font('Helvetica-Bold').fontSize(13).fillColor('#FFFFFF')
    .text(titulo, MARGEM, y0 + 14, { width: LARGURA - 18, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor(VERMELHO)
    .text(subtitulo || '', MARGEM, y0 + 33, { width: LARGURA - 18, align: 'right' });

  doc.y = y0 + 78;
  doc.fillColor(GRAFITE);
}

function secao(doc, titulo) {
  garantirEspaco(doc, 40);
  const y = doc.y;
  doc.rect(MARGEM, y, LARGURA, 20).fill(CINZA_CLARO);
  doc.rect(MARGEM, y, 3, 20).fill(VERMELHO);
  doc.fillColor(GRAFITE).font('Helvetica-Bold').fontSize(9)
    .text(titulo.toUpperCase(), MARGEM + 10, y + 6, { width: LARGURA - 20 });
  doc.y = y + 28;
  doc.fillColor(GRAFITE);
}

/** Grade de rotulo/valor em N colunas. */
function grade(doc, itens, colunas = 3) {
  const larguraCol = LARGURA / colunas;
  let linha = [];
  const desenhar = () => {
    if (!linha.length) return;
    const alturas = linha.map((it) => {
      const h = doc.font('Helvetica').fontSize(9).heightOfString(String(it.valor ?? '—'), { width: larguraCol - 12 });
      return h + 16;
    });
    const altura = Math.max(...alturas, 30);
    garantirEspaco(doc, altura);
    const y = doc.y;
    linha.forEach((it, i) => {
      const x = MARGEM + i * larguraCol;
      doc.font('Helvetica-Bold').fontSize(6.5).fillColor(CINZA)
        .text(String(it.rotulo).toUpperCase(), x, y, { width: larguraCol - 12 });
      doc.font('Helvetica').fontSize(9).fillColor(GRAFITE)
        .text(String(it.valor ?? '—'), x, y + 9, { width: larguraCol - 12 });
    });
    doc.y = y + altura;
    linha = [];
  };
  for (const item of itens) {
    linha.push(item);
    if (linha.length === colunas) desenhar();
  }
  desenhar();
  doc.moveDown(0.2);
}

function paragrafo(doc, rotulo, texto) {
  if (!texto) return;
  garantirEspaco(doc, 40);
  doc.font('Helvetica-Bold').fontSize(6.5).fillColor(CINZA)
    .text(String(rotulo).toUpperCase(), MARGEM, doc.y, { width: LARGURA });
  doc.font('Helvetica').fontSize(9).fillColor(GRAFITE)
    .text(String(texto), MARGEM, doc.y + 2, { width: LARGURA, align: 'justify' });
  doc.moveDown(0.6);
}

function garantirEspaco(doc, altura) {
  const limite = doc.page.height - MARGEM - 18;
  if (doc.y + altura > limite) {
    doc.addPage();
    doc.y = MARGEM;
  }
}

/** Tabela simples com colunas proporcionais. */
function tabela(doc, colunas, linhas) {
  const total = colunas.reduce((s, c) => s + c.largura, 0);
  const larguras = colunas.map((c) => (c.largura / total) * LARGURA);

  const desenharCabecalho = () => {
    const y = doc.y;
    doc.rect(MARGEM, y, LARGURA, 18).fill(GRAFITE);
    let x = MARGEM;
    colunas.forEach((c, i) => {
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7)
        .text(c.titulo.toUpperCase(), x + 5, y + 6, { width: larguras[i] - 10, align: c.alinhar || 'left' });
      x += larguras[i];
    });
    doc.y = y + 18;
    doc.fillColor(GRAFITE);
  };

  garantirEspaco(doc, 60);
  desenharCabecalho();

  linhas.forEach((linha, indice) => {
    const alturas = colunas.map((c, i) =>
      doc.font('Helvetica').fontSize(8).heightOfString(String(linha[i] ?? ''), { width: larguras[i] - 10 })
    );
    const altura = Math.max(...alturas) + 10;
    if (doc.y + altura > doc.page.height - MARGEM - 18) {
      doc.addPage();
      doc.y = MARGEM;
      desenharCabecalho();
    }
    const y = doc.y;
    if (indice % 2 === 1) doc.rect(MARGEM, y, LARGURA, altura).fill('#FAFAFB');
    let x = MARGEM;
    colunas.forEach((c, i) => {
      doc.fillColor(GRAFITE).font(c.negrito ? 'Helvetica-Bold' : 'Helvetica').fontSize(8)
        .text(String(linha[i] ?? ''), x + 5, y + 5, { width: larguras[i] - 10, align: c.alinhar || 'left' });
      x += larguras[i];
    });
    doc.strokeColor(BORDA).lineWidth(0.5)
      .moveTo(MARGEM, y + altura).lineTo(MARGEM + LARGURA, y + altura).stroke();
    doc.y = y + altura;
  });
  doc.moveDown(0.5);
}

function totais(doc, linhas) {
  const largura = 230;
  const x = MARGEM + LARGURA - largura;
  garantirEspaco(doc, linhas.length * 16 + 20);
  linhas.forEach((l) => {
    const y = doc.y;
    if (l.destaque) {
      doc.rect(x, y, largura, 22).fill(VERMELHO);
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(10)
        .text(l.rotulo, x + 10, y + 6, { width: largura / 2 })
        .text(l.valor, x + largura / 2, y + 6, { width: largura / 2 - 10, align: 'right' });
      doc.y = y + 22;
    } else {
      doc.fillColor(CINZA).font('Helvetica').fontSize(9)
        .text(l.rotulo, x + 10, y + 3, { width: largura / 2 });
      doc.fillColor(GRAFITE).font(l.forte ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
        .text(l.valor, x + largura / 2, y + 3, { width: largura / 2 - 10, align: 'right' });
      doc.y = y + 16;
    }
  });
  doc.fillColor(GRAFITE);
}

// ------------------------------------------------------------------ Fotos
const FOTOS_POR_GRUPO = 8;   // por problema / peca / item
const FOTOS_POR_PDF = 32;    // teto do documento inteiro
const FOTO_ALTURA = 148;                    // moldura da imagem
const FOTO_CELULA = FOTO_ALTURA + 26;       // moldura + as duas linhas de legenda

/**
 * Subtitulo que separa as fotos de cada problema, peca ou item. Reserva o
 * espaco do titulo MAIS o da primeira fileira de fotos: sem isso o titulo fica
 * orfao no pe da pagina e as fotos dele comecam so na pagina seguinte.
 */
function subsecao(doc, texto, alturaJunto = 0) {
  garantirEspaco(doc, 26 + alturaJunto);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(GRAFITE)
    .text(texto, MARGEM, doc.y, { width: LARGURA });
  doc.y += 4;
}

function nota(doc, texto) {
  garantirEspaco(doc, 20);
  doc.font('Helvetica-Oblique').fontSize(7.5).fillColor(CINZA)
    .text(texto, MARGEM, doc.y, { width: LARGURA });
  doc.moveDown(0.4);
  doc.fillColor(GRAFITE);
}

/**
 * Monta os blocos de fotos a partir da lista achatada que a rota entrega.
 * `blocos` descreve a ordem e o titulo de cada agrupamento.
 */
function agruparFotos(fotos, blocos) {
  const lista = fotos || [];
  const grupos = [];
  for (const bloco of blocos) {
    const doBloco = lista.filter(
      (ft) => ft.entidade === bloco.entidade && Number(ft.entidade_id) === Number(bloco.id)
    );
    if (doBloco.length) grupos.push({ titulo: bloco.titulo, fotos: doBloco });
  }
  return grupos;
}

const totalDeFotos = (grupos) => grupos.reduce((s, g) => s + g.fotos.length, 0);

/** Grade de duas colunas com moldura, foto ajustada e legenda. */
function galeria(doc, grupo, restante) {
  const colunas = 2;
  const vao = 12;
  const larguraCel = (LARGURA - vao * (colunas - 1)) / colunas;
  const alturaImg = FOTO_ALTURA;
  const alturaCel = FOTO_CELULA;
  const fotos = grupo.fotos;

  const mostrar = fotos.slice(0, Math.max(0, Math.min(FOTOS_POR_GRUPO, restante.disponivel)));
  subsecao(doc, grupo.titulo, mostrar.length ? alturaCel : 0);

  for (let i = 0; i < mostrar.length; i += colunas) {
    const linha = mostrar.slice(i, i + colunas);
    garantirEspaco(doc, alturaCel + 6);
    const y = doc.y;

    linha.forEach((foto, c) => {
      const x = MARGEM + c * (larguraCel + vao);
      doc.rect(x, y, larguraCel, alturaImg).fillAndStroke('#FAFAFB', BORDA);

      const preparada = imagem.paraImpressao(foto);
      let impressa = false;
      if (preparada) {
        try {
          doc.image(preparada.buffer, x + 4, y + 4, {
            fit: [larguraCel - 8, alturaImg - 8], align: 'center', valign: 'center',
          });
          impressa = true;
        } catch { /* imagem recusada pelo PDFKit: cai no aviso abaixo */ }
      }
      if (!impressa) {
        doc.font('Helvetica-Oblique').fontSize(7.5).fillColor(CINZA).text(
          'Esta foto não pôde ser impressa\n(formato não suportado no PDF).\nVeja a imagem no sistema.',
          x + 8, y + alturaImg / 2 - 16, { width: larguraCel - 16, align: 'center' }
        );
      }

      const yTexto = y + alturaImg + 4;
      doc.font('Helvetica-Bold').fontSize(7).fillColor(GRAFITE).text(
        foto.legenda || `Foto ${i + c + 1}`,
        x, yTexto, { width: larguraCel, lineBreak: false, ellipsis: true }
      );
      doc.font('Helvetica').fontSize(6.5).fillColor(CINZA).text(
        [foto.enviado_por, foto.criado_em && f.dataHoraBR(foto.criado_em)].filter(Boolean).join(' • '),
        x, yTexto + 9, { width: larguraCel, lineBreak: false, ellipsis: true }
      );
    });

    doc.y = y + alturaCel;
    doc.fillColor(GRAFITE);
  }

  restante.disponivel -= mostrar.length;
  if (fotos.length > mostrar.length) {
    doc.moveDown(0.2);
    nota(doc, `+ ${fotos.length - mostrar.length} foto(s) deste item não impressa(s) — consulte no sistema.`);
  }
  doc.moveDown(0.4);
}

/** Secao completa de fotos; nao desenha nada quando nao ha imagem anexada. */
function secaoFotos(doc, grupos, titulo) {
  const total = totalDeFotos(grupos);
  if (!total) return;

  // Faixa da seção + subtítulo do primeiro grupo + uma fileira de fotos: assim a
  // seção nunca abre no pé de uma página com as imagens só na seguinte.
  garantirEspaco(doc, 28 + 26 + FOTO_CELULA);
  secao(doc, `${titulo} (${total})`);
  const restante = { disponivel: FOTOS_POR_PDF };
  for (const grupo of grupos) {
    if (restante.disponivel <= 0) break;
    galeria(doc, grupo, restante);
  }
  if (total > FOTOS_POR_PDF) {
    nota(doc, `Este documento imprime as ${FOTOS_POR_PDF} primeiras fotos. As demais permanecem disponíveis no sistema.`);
  }
}

function rodape(doc, config) {
  const paginas = doc.bufferedPageRange();
  for (let i = 0; i < paginas.count; i++) {
    doc.switchToPage(paginas.start + i);
    // Escrever na faixa da margem exige zerar o limite inferior; caso contrário
    // o PDFKit entende como transbordo e cria uma página em branco.
    const margemOriginal = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    const y = doc.page.height - MARGEM + 8;
    doc.strokeColor(BORDA).lineWidth(0.5).moveTo(MARGEM, y - 8).lineTo(MARGEM + LARGURA, y - 8).stroke();
    doc.font('Helvetica').fontSize(7).fillColor(CINZA)
      .text(`${config.empresa_nome || 'SOS Truck Service'} — gerado em ${f.dataHoraBR(new Date().toISOString())}`,
        MARGEM, y, { width: LARGURA / 2, lineBreak: false })
      .text(`Página ${i + 1} de ${paginas.count}`,
        MARGEM + LARGURA / 2, y, { width: LARGURA / 2, align: 'right', lineBreak: false });

    doc.page.margins.bottom = margemOriginal;
  }
}

// ------------------------------------------------------------------ Ordem de compra
function ordemCompraPDF(dados, config = {}) {
  const { ordem, itens, fornecedor, caminhao, empresa, ficha, responsavel, fotos } = dados;
  const doc = novoDocumento(`Ordem de compra ${ordem.numero}`);

  cabecalho(doc, 'ORDEM DE COMPRA', ordem.numero, config);

  grade(doc, [
    { rotulo: 'Emissão', valor: f.dataBR(ordem.data_emissao) },
    { rotulo: 'Situação', valor: (STATUS_OC[ordem.status] || {}).rotulo || ordem.status },
    { rotulo: 'Ficha mecânica', valor: ficha ? ficha.numero : '—' },
    { rotulo: 'Responsável pela compra', valor: responsavel ? responsavel.nome : '—' },
    { rotulo: 'Forma de pagamento', valor: ordem.forma_pagamento || '—' },
    { rotulo: 'Prazo de entrega', valor: ordem.prazo_entrega || (ordem.previsao_entrega ? f.dataBR(ordem.previsao_entrega) : '—') },
  ], 3);

  secao(doc, 'Fornecedor');
  grade(doc, [
    { rotulo: 'Razão social / nome', valor: fornecedor ? (fornecedor.razao_social || fornecedor.nome) : '—' },
    { rotulo: 'CNPJ', valor: fornecedor && fornecedor.cnpj ? f.documento(fornecedor.cnpj) : '—' },
    { rotulo: 'Telefone', valor: fornecedor ? f.telefone(fornecedor.telefone || fornecedor.whatsapp) : '—' },
    { rotulo: 'Vendedor', valor: (fornecedor && fornecedor.vendedor) || '—' },
    { rotulo: 'E-mail', valor: (fornecedor && fornecedor.email) || '—' },
    { rotulo: 'Cidade / UF', valor: fornecedor ? [fornecedor.cidade, fornecedor.estado].filter(Boolean).join(' / ') || '—' : '—' },
  ], 3);

  secao(doc, 'Caminhão e proprietário');
  grade(doc, [
    { rotulo: 'Placa', valor: caminhao ? f.placaBR(caminhao.placa) : '—' },
    { rotulo: 'Frota', valor: (caminhao && caminhao.codigo_frota) || '—' },
    { rotulo: 'Marca / modelo', valor: caminhao ? [caminhao.marca, caminhao.modelo].filter(Boolean).join(' ') || '—' : '—' },
    { rotulo: 'Chassi', valor: (caminhao && caminhao.chassi) || '—' },
    { rotulo: 'Ano', valor: caminhao && caminhao.ano_fabricacao ? `${caminhao.ano_fabricacao}/${caminhao.ano_modelo || caminhao.ano_fabricacao}` : '—' },
    { rotulo: 'Empresa / proprietário', valor: (empresa && empresa.nome) || '—' },
  ], 3);

  secao(doc, 'Peças aprovadas');
  tabela(doc,
    [
      { titulo: '#', largura: 5, alinhar: 'center' },
      { titulo: 'Descrição da peça', largura: 34 },
      { titulo: 'Código', largura: 12 },
      { titulo: 'Marca', largura: 12 },
      { titulo: 'Qtd', largura: 7, alinhar: 'center' },
      { titulo: 'Vl. unit.', largura: 12, alinhar: 'right' },
      { titulo: 'Desc.', largura: 10, alinhar: 'right' },
      { titulo: 'Total', largura: 13, alinhar: 'right', negrito: true },
    ],
    itens.map((it, i) => [
      String(i + 1).padStart(2, '0'),
      it.descricao,
      it.codigo || '—',
      it.marca || '—',
      `${f.numero(it.quantidade)} ${it.unidade || 'UN'}`,
      f.moeda(it.valor_unitario),
      it.desconto ? f.moeda(it.desconto) : '—',
      f.moeda(it.total),
    ])
  );

  totais(doc, [
    { rotulo: 'Subtotal', valor: f.moeda(ordem.subtotal) },
    { rotulo: 'Desconto', valor: `- ${f.moeda(ordem.desconto)}` },
    { rotulo: 'Frete', valor: f.moeda(ordem.frete) },
    { rotulo: 'TOTAL GERAL', valor: f.moeda(ordem.total), destaque: true },
  ]);

  doc.moveDown(1);
  secao(doc, 'Entrega e observações');
  paragrafo(doc, 'Endereço de entrega', ordem.endereco_entrega || config.endereco_entrega || 'A combinar com a administração.');
  paragrafo(doc, 'Observações', ordem.observacoes || 'Sem observações.');

  // Fotos da peca ajudam o fornecedor a confirmar que separou o item certo.
  // A numeracao acompanha a tabela de pecas acima, por isso o indice vem antes do filtro.
  secaoFotos(doc, agruparFotos(fotos, itens
    .map((it, i) => ({
      entidade: 'peca', id: it.peca_id, titulo: `Item ${String(i + 1).padStart(2, '0')} — ${it.descricao}`,
    }))
    .filter((bloco) => bloco.id)), 'Fotos das peças');

  garantirEspaco(doc, 90);
  doc.moveDown(2);
  const yAss = doc.y;
  const larguraAss = (LARGURA - 40) / 2;
  doc.strokeColor(GRAFITE).lineWidth(0.7)
    .moveTo(MARGEM, yAss).lineTo(MARGEM + larguraAss, yAss).stroke()
    .moveTo(MARGEM + larguraAss + 40, yAss).lineTo(MARGEM + LARGURA, yAss).stroke();
  doc.font('Helvetica').fontSize(8).fillColor(CINZA)
    .text(responsavel ? responsavel.nome : 'Responsável pela compra', MARGEM, yAss + 5, { width: larguraAss, align: 'center' })
    .text('Fornecedor — ciente e de acordo', MARGEM + larguraAss + 40, yAss + 5, { width: larguraAss, align: 'center' });

  rodape(doc, config);
  doc.end();
  return doc;
}

// ------------------------------------------------------------------ Ficha mecanica
function fichaPDF(dados, config = {}, { incluirValores = false } = {}) {
  const { ficha, caminhao, empresa, mecanico, problemas, pecas, comentarios, fotos } = dados;
  const doc = novoDocumento(`Ficha ${ficha.numero}`);

  cabecalho(doc, 'FICHA DE INSPEÇÃO MECÂNICA', ficha.numero, config);

  grade(doc, [
    { rotulo: 'Abertura', valor: f.dataHoraBR(ficha.aberta_em) },
    { rotulo: 'Situação', valor: (STATUS_FICHA[ficha.status] || {}).rotulo || ficha.status },
    { rotulo: 'Prioridade', valor: (PRIORIDADES[ficha.prioridade] || {}).rotulo || ficha.prioridade },
    { rotulo: 'Mecânico responsável', valor: mecanico ? mecanico.nome : '—' },
    { rotulo: 'Quilometragem', valor: ficha.km ? `${f.numero(ficha.km, 0)} km` : '—' },
    { rotulo: 'Prazo estimado', valor: ficha.prazo_estimado || '—' },
  ], 3);

  secao(doc, 'Caminhão');
  grade(doc, [
    { rotulo: 'Placa', valor: caminhao ? f.placaBR(caminhao.placa) : '—' },
    { rotulo: 'Frota', valor: (caminhao && caminhao.codigo_frota) || '—' },
    { rotulo: 'Marca / modelo', valor: caminhao ? [caminhao.marca, caminhao.modelo, caminhao.versao].filter(Boolean).join(' ') || '—' : '—' },
    { rotulo: 'Chassi', valor: (caminhao && caminhao.chassi) || '—' },
    { rotulo: 'Ano fab./mod.', valor: caminhao && caminhao.ano_fabricacao ? `${caminhao.ano_fabricacao}/${caminhao.ano_modelo || caminhao.ano_fabricacao}` : '—' },
    { rotulo: 'Tipo', valor: (caminhao && caminhao.tipo) || '—' },
    { rotulo: 'Empresa / proprietário', valor: (empresa && empresa.nome) || '—' },
    { rotulo: 'Motorista', valor: (caminhao && caminhao.motorista_nome) || '—' },
    { rotulo: 'Telefone', valor: caminhao && caminhao.motorista_telefone ? f.telefone(caminhao.motorista_telefone) : '—' },
  ], 3);

  secao(doc, 'Entrada e diagnóstico');
  paragrafo(doc, 'Motivo da entrada', ficha.motivo_entrada);
  paragrafo(doc, 'Relato do motorista', ficha.relato_motorista);
  paragrafo(doc, 'Diagnóstico do mecânico', ficha.diagnostico);
  paragrafo(doc, 'Serviços recomendados', ficha.servicos_recomendados);

  secao(doc, `Problemas encontrados (${problemas.length})`);
  if (!problemas.length) {
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(CINZA)
      .text('Nenhum problema registrado nesta ficha.', MARGEM, doc.y, { width: LARGURA });
    doc.moveDown(1);
  } else {
    tabela(doc,
      [
        { titulo: '#', largura: 5, alinhar: 'center' },
        { titulo: 'Problema', largura: 26 },
        { titulo: 'Sistema', largura: 18 },
        { titulo: 'Gravidade', largura: 11, alinhar: 'center' },
        { titulo: 'Impede', largura: 8, alinhar: 'center' },
        { titulo: 'Serviço necessário', largura: 26 },
      ],
      problemas.map((p, i) => [
        String(i + 1).padStart(2, '0'),
        p.titulo + (p.descricao ? `\n${p.descricao}` : ''),
        p.sistema || '—',
        (GRAVIDADES[p.gravidade] || {}).rotulo || p.gravidade,
        p.impede_uso ? 'SIM' : 'Não',
        p.servico_necessario || '—',
      ])
    );
  }

  secao(doc, `Peças solicitadas (${pecas.length})`);
  if (!pecas.length) {
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(CINZA)
      .text('Nenhuma peça solicitada nesta ficha.', MARGEM, doc.y, { width: LARGURA });
    doc.moveDown(1);
  } else {
    const colunas = [
      { titulo: '#', largura: 5, alinhar: 'center' },
      { titulo: 'Peça', largura: 26 },
      { titulo: 'Categoria', largura: 20 },
      { titulo: 'Qtd', largura: 7, alinhar: 'center' },
      { titulo: 'Tipo', largura: 10 },
      { titulo: 'Urgência', largura: 12, alinhar: 'center' },
      { titulo: 'Situação', largura: 18 },
    ];
    const linhas = pecas.map((p, i) => [
      String(i + 1).padStart(2, '0'),
      p.nome + (p.codigo_referencia ? `\nRef.: ${p.codigo_referencia}` : '') + (p.posicao ? `\n${p.posicao}` : ''),
      [p.categoria_nome, p.subcategoria_nome].filter(Boolean).join(' › ') || '—',
      `${f.numero(p.quantidade)} ${p.unidade}`,
      TIPOS_PECA[p.tipo_peca] || p.tipo_peca,
      (URGENCIAS[p.urgencia] || {}).rotulo || p.urgencia,
      (STATUS_PECA[p.status] || {}).rotulo || p.status,
    ]);
    if (incluirValores) {
      colunas.push({ titulo: 'Valor', largura: 12, alinhar: 'right', negrito: true });
      pecas.forEach((p, i) => linhas[i].push(p.valor_aprovado ? f.moeda(p.valor_aprovado) : '—'));
    }
    tabela(doc, colunas, linhas);

    if (incluirValores) {
      const soma = pecas.reduce((s, p) => s + Number(p.valor_aprovado || 0), 0);
      totais(doc, [{ rotulo: 'TOTAL DAS PEÇAS', valor: f.moeda(soma), destaque: true }]);
    }
  }

  if (ficha.observacoes_internas && incluirValores) {
    secao(doc, 'Observações internas');
    paragrafo(doc, 'Anotações da administração', ficha.observacoes_internas);
  }

  if (comentarios && comentarios.length) {
    secao(doc, 'Comunicação da ficha');
    comentarios.forEach((c) => {
      garantirEspaco(doc, 34);
      doc.font('Helvetica-Bold').fontSize(8).fillColor(GRAFITE)
        .text(`${c.autor_nome} — ${f.dataHoraBR(c.criado_em)}`, MARGEM, doc.y, { width: LARGURA });
      doc.font('Helvetica').fontSize(9).fillColor(GRAFITE)
        .text(c.mensagem, MARGEM, doc.y + 1, { width: LARGURA });
      doc.moveDown(0.5);
    });
  }

  // As fotos vao no fim, agrupadas pelo problema ou pela peca que documentam,
  // para nao quebrar a leitura das tabelas.
  secaoFotos(doc, agruparFotos(fotos, [
    { entidade: 'ficha', id: ficha.id, titulo: 'Fotos gerais da ficha' },
    ...problemas.map((p, i) => ({
      entidade: 'problema', id: p.id, titulo: `Problema ${String(i + 1).padStart(2, '0')} — ${p.titulo}`,
    })),
    ...pecas.map((p, i) => ({
      entidade: 'peca', id: p.id, titulo: `Peça ${String(i + 1).padStart(2, '0')} — ${p.nome}`,
    })),
  ]), 'Fotos anexadas');

  garantirEspaco(doc, 90);
  doc.moveDown(2);
  const yAss = doc.y;
  doc.strokeColor(GRAFITE).lineWidth(0.7)
    .moveTo(MARGEM + LARGURA / 4, yAss).lineTo(MARGEM + (LARGURA * 3) / 4, yAss).stroke();
  doc.font('Helvetica-Bold').fontSize(9).fillColor(GRAFITE)
    .text(ficha.assinatura_mecanico || (mecanico ? mecanico.nome : ''), MARGEM, yAss + 6, { width: LARGURA, align: 'center' });
  doc.font('Helvetica').fontSize(8).fillColor(CINZA)
    .text(
      ficha.assinado_em ? `Mecânico responsável — confirmado em ${f.dataHoraBR(ficha.assinado_em)}` : 'Mecânico responsável',
      MARGEM, yAss + 18, { width: LARGURA, align: 'center' }
    );

  rodape(doc, config);
  doc.end();
  return doc;
}

module.exports = { ordemCompraPDF, fichaPDF };
