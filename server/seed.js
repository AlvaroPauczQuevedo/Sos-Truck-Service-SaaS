'use strict';
/**
 * Popula o banco com as categorias de pecas, as configuracoes iniciais e um
 * conjunto de dados demonstrativos que percorre todo o fluxo do sistema.
 * Os dados de exemplo servem apenas para apresentacao; use `npm run reset`
 * para limpar tudo e comecar com os dados reais da SOS Truck Service.
 */
const { db, gerarNumero } = require('./db');
const { criarHash } = require('./lib/auth');
const { gravarConfiguracoes } = require('./lib/config');
const D = require('./lib/dominio');

const RESETAR = process.argv.includes('--reset');
const SEM_DEMO = process.argv.includes('--sem-demo') || process.argv.includes('--limpo');

function limpar() {
  const tabelas = [
    'historico', 'notificacoes', 'comentarios', 'fotos', 'ordens_itens', 'ordens_compra',
    'propostas', 'cotacoes', 'pecas_solicitadas', 'problemas', 'fichas', 'caminhoes',
    'fornecedores', 'empresas', 'usuarios', 'sequencias', 'configuracoes', 'categorias_pecas',
  ];
  db.pragma('foreign_keys = OFF');
  db.transaction(() => { for (const t of tabelas) db.prepare(`DELETE FROM ${t}`).run(); })();
  db.prepare("DELETE FROM sqlite_sequence").run();
  db.pragma('foreign_keys = ON');
  console.log('• Banco limpo.');
}

/** Categorias e subcategorias de pecas (idempotente). */
function semearCategorias() {
  const inserir = db.prepare(
    `INSERT INTO categorias_pecas (nome, slug, pai_id, nivel, ordem) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(slug, IFNULL(pai_id,0)) DO NOTHING`
  );
  const buscar = db.prepare('SELECT id FROM categorias_pecas WHERE slug = ? AND IFNULL(pai_id,0) = ?');
  db.transaction(() => {
    D.CATEGORIAS.forEach(([nome, subs], indice) => {
      const slug = D.slugify(nome);
      inserir.run(nome, slug, null, 1, indice);
      const pai = buscar.get(slug, 0);
      subs.forEach((sub, i) => inserir.run(sub, D.slugify(sub), pai.id, 2, i));
    });
  })();
  const total = db.prepare('SELECT COUNT(*) AS t FROM categorias_pecas').get().t;
  console.log(`• Categorias de peças: ${total} registros.`);
}

function semearConfiguracoes() {
  gravarConfiguracoes({
    empresa_nome: 'SOS TRUCK SERVICE',
    empresa_documento: '',
    empresa_telefone: '',
    empresa_email: '',
    empresa_endereco: '',
    endereco_entrega: '',
    responsavel_compras: '',
    prazo_alerta_entrega_dias: '2',
    alerta_pecas_criticas: '1',
  });
  console.log('• Configurações iniciais gravadas.');
}

function criarUsuario(nome, email, senha, perfil, telefone, matricula) {
  const existente = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email);
  if (existente) return existente.id;
  return db.prepare(
    `INSERT INTO usuarios (nome, email, senha_hash, perfil, telefone, matricula) VALUES (?,?,?,?,?,?)`
  ).run(nome, email, criarHash(senha), perfil, telefone, matricula).lastInsertRowid;
}

function semearUsuarios() {
  const admin = criarUsuario('Administração SOS', 'admin@sostruck.com.br', 'sos12345', 'admin', '41999990001', 'ADM-001');
  const mecanico = criarUsuario('Carlos Ferreira', 'mecanico@sostruck.com.br', 'sos12345', 'mecanico', '41999990002', 'MEC-001');
  const mecanico2 = criarUsuario('Jonas Ribeiro', 'jonas@sostruck.com.br', 'sos12345', 'mecanico', '41999990003', 'MEC-002');
  console.log('• Usuários criados (senha padrão: sos12345).');
  return { admin, mecanico, mecanico2 };
}

// ------------------------------------------------------------------ Demonstracao
function semearDemonstracao(usuarios) {
  if (db.prepare('SELECT COUNT(*) AS t FROM fichas').get().t > 0) {
    console.log('• Dados demonstrativos já existem — nada a fazer.');
    return;
  }
  const { admin, mecanico, mecanico2 } = usuarios;

  const empresas = [
    ['Transportes Alfa Ltda', 'Transportes Alfa Transportes Rodoviários Ltda', '12345678000190', '4133221100', 'contato@alfatransportes.com.br', 'Rod. BR-116, km 112', 'Curitiba', 'PR', '81690000', 'Marina Alves'],
    ['Frotas Beta Logística', 'Beta Logística e Transportes S.A.', '98765432000155', '4133445566', 'frota@betalog.com.br', 'Av. das Indústrias, 2450', 'São José dos Pinhais', 'PR', '83015000', 'Rodrigo Lemos'],
    ['Agro Sul Transportes', null, '45678912000133', '4230112233', 'agro@agrosul.com.br', 'Estrada do Café, 900', 'Londrina', 'PR', '86010000', 'Cleiton Souza'],
  ].map((e) => db.prepare(
    `INSERT INTO empresas (nome, razao_social, cnpj, telefone, email, endereco, cidade, estado, cep, responsavel)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).run(...e).lastInsertRowid);

  const caminhoes = [
    ['F-101', 'ABC1D23', '9BM9580848B123456', 'Scania', 'R 450', 'Highline 6x2', 2019, 2020, 486320, 'Cavalo mecânico (trucado)', 'Branco', empresas[0], 'José da Silva', '41988776655', 'em_manutencao'],
    ['F-102', 'DEF2G45', '9BM9580848B654321', 'Volvo', 'FH 540', 'Globetrotter 6x4', 2021, 2021, 312780, 'Cavalo mecânico (traçado)', 'Azul', empresas[0], 'Antônio Pereira', '41988776644', 'disponivel'],
    ['F-201', 'GHI3J67', '9BWZZZ377VT004251', 'Mercedes-Benz', 'Actros 2651', 'Standard', 2018, 2019, 725410, 'Cavalo mecânico (traçado)', 'Prata', empresas[1], 'Marcos Lima', '41977665544', 'em_manutencao'],
    ['F-202', 'JKL4M89', '93PB4NHW0LB012345', 'Volkswagen', 'Constellation 24.280', 'Bitruck', 2020, 2020, 198540, 'Bitruck', 'Vermelho', empresas[1], 'Paulo Rocha', '41977665533', 'disponivel'],
    ['F-301', 'MNO5P01', '9BM3840678B998877', 'Iveco', 'Hi-Way 480', 'Attack', 2017, 2018, 812300, 'Cavalo mecânico (trucado)', 'Branco', empresas[2], 'Sebastião Dias', '42966554433', 'parado'],
    ['F-302', 'PQR6S23', '9532E82W2LR112233', 'DAF', 'XF 480', 'Space Cab', 2022, 2022, 145600, 'Cavalo mecânico (traçado)', 'Cinza', empresas[2], 'Wagner Alves', '42966554422', 'disponivel'],
  ].map((c) => db.prepare(
    `INSERT INTO caminhoes (codigo_frota, placa, chassi, marca, modelo, versao, ano_fabricacao, ano_modelo,
       km_atual, tipo, cor, empresa_id, motorista_nome, motorista_telefone, status, data_entrada, criado_por)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, date('now','-5 days'), ?)`
  ).run(...c, admin).lastInsertRowid);

  const fornecedores = [
    ['Diesel Parts Peças', 'Diesel Parts Comércio de Peças Ltda', '11222333000144', '4133330011', '41991110011', 'vendas@dieselparts.com.br', 'Marcos Andrade', 'Av. Presidente Wenceslau, 1200', 'Curitiba', 'PR', 7, 'Boleto 30 dias', 'Motor, injeção, freios'],
    ['Truck Center Distribuidora', 'Truck Center Distribuidora de Autopeças S.A.', '22333444000155', '4133330022', '41991110022', 'comercial@truckcenter.com.br', 'Fernanda Lopes', 'Rua das Oficinas, 45', 'São José dos Pinhais', 'PR', 3, 'Boleto 30/60', 'Suspensão, freios, elétrica'],
    ['Rodo Peças Sul', null, '33444555000166', '4233330033', '42991110033', 'contato@rodopecassul.com.br', 'Ricardo Nunes', 'Av. Tiradentes, 3300', 'Londrina', 'PR', 10, 'À vista / PIX', 'Pneus, rodas, cardã'],
    ['Eletro Diesel Curitiba', null, '44555666000177', '4133330044', '41991110044', 'eletro@eletrodiesel.com.br', 'Silvana Prado', 'Rua do Comércio, 78', 'Curitiba', 'PR', 5, 'Boleto 21 dias', 'Elétrica, baterias, alternadores'],
  ].map((f) => db.prepare(
    `INSERT INTO fornecedores (nome, razao_social, cnpj, telefone, whatsapp, email, vendedor, endereco,
       cidade, estado, prazo_medio_dias, condicoes_pagamento, especialidades)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(...f).lastInsertRowid);

  const cat = (nome) => db.prepare('SELECT id FROM categorias_pecas WHERE nome = ? AND pai_id IS NULL').get(nome).id;
  const sub = (pai, nome) => {
    const r = db.prepare('SELECT id FROM categorias_pecas WHERE nome = ? AND pai_id = ?').get(nome, cat(pai));
    return r ? r.id : null;
  };
  const registrar = (entidade, entidade_id, acao, descricao, usuario_id, usuario_nome, diasAtras = 0) =>
    db.prepare(
      `INSERT INTO historico (entidade, entidade_id, acao, descricao, usuario_id, usuario_nome, criado_em)
       VALUES (?,?,?,?,?,?, datetime('now', ?))`
    ).run(entidade, entidade_id, acao, descricao, usuario_id, usuario_nome, `-${diasAtras} days`);

  /** Cria uma ficha completa com problemas e pecas. */
  function criarFicha({ caminhao, mecanico_id, mecanico_nome, dias, status, dados, problemas, pecas, statusPecas }) {
    const numero = gerarNumero('FIC');
    const fichaId = db.prepare(
      `INSERT INTO fichas (numero, caminhao_id, mecanico_id, aberta_em, km, motivo_entrada, relato_motorista,
         diagnostico, servicos_recomendados, prioridade, prazo_estimado, status, enviada_em,
         assinatura_mecanico, assinado_em, criado_em)
       VALUES (?,?,?, datetime('now', ?), ?,?,?,?,?,?,?,?, ${status === 'rascunho' ? 'NULL' : `datetime('now', ?)`},
         ?, ${status === 'rascunho' ? 'NULL' : `datetime('now', ?)`}, datetime('now', ?))`
    ).run(
      numero, caminhao, mecanico_id, `-${dias} days`, dados.km, dados.motivo_entrada, dados.relato_motorista,
      dados.diagnostico, dados.servicos_recomendados, dados.prioridade, dados.prazo_estimado, status,
      ...(status === 'rascunho' ? [] : [`-${dias} days`]),
      status === 'rascunho' ? null : mecanico_nome,
      ...(status === 'rascunho' ? [] : [`-${dias} days`]),
      `-${dias} days`
    ).lastInsertRowid;

    registrar('ficha', fichaId, 'criada', `Ficha ${numero} aberta`, mecanico_id, mecanico_nome, dias);
    if (status !== 'rascunho') {
      registrar('ficha', fichaId, 'enviada', `Ficha ${numero} enviada para a administração`, mecanico_id, mecanico_nome, dias);
    }

    const idsProblemas = problemas.map((p) => db.prepare(
      `INSERT INTO problemas (ficha_id, titulo, descricao, sistema, categoria_id, gravidade, servico_necessario, impede_uso, criado_em)
       VALUES (?,?,?,?,?,?,?,?, datetime('now', ?))`
    ).run(fichaId, p.titulo, p.descricao, p.sistema, cat(p.sistema), p.gravidade, p.servico, p.impede ? 1 : 0, `-${dias} days`).lastInsertRowid);

    const idsPecas = pecas.map((pc, i) => db.prepare(
      `INSERT INTO pecas_solicitadas (ficha_id, problema_id, categoria_id, subcategoria_id, nome, descricao,
         codigo_referencia, marca_preferencial, quantidade, unidade, posicao, tipo_peca, urgencia,
         motivo_troca, observacoes_mecanico, status, criado_por, criado_em)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now', ?))`
    ).run(
      fichaId, idsProblemas[pc.problema ?? 0] || null, cat(pc.categoria), sub(pc.categoria, pc.subcategoria),
      pc.nome, pc.descricao, pc.codigo, pc.marca, pc.qtd, pc.unidade || 'UN', pc.posicao || null,
      pc.tipo || 'indiferente', pc.urgencia || 'normal', pc.motivo, pc.obs || null,
      statusPecas || (status === 'rascunho' ? 'rascunho' : 'aguardando_analise'), mecanico_id, `-${dias} days`
    ).lastInsertRowid);

    return { fichaId, numero, idsPecas, idsProblemas };
  }

  // ---- Ficha 1: fluxo completo até a compra recebida
  const f1 = criarFicha({
    caminhao: caminhoes[0], mecanico_id: mecanico, mecanico_nome: 'Carlos Ferreira', dias: 12,
    status: 'em_compra', statusPecas: 'recebida',
    dados: {
      km: 486320, motivo_entrada: 'Perda de potência e superaquecimento em subida de serra.',
      relato_motorista: 'O motorista relatou que o caminhão perdeu força na serra e a temperatura subiu muito. Saiu fumaça branca pelo escapamento.',
      diagnostico: 'Constatada junta do cabeçote queimada entre o 3º e 4º cilindro, com passagem de água para a câmara de combustão. Radiador com obstrução parcial nas colmeias e válvula termostática travada aberta. Necessária retífica do cabeçote.',
      servicos_recomendados: 'Retífica do cabeçote, troca da junta, limpeza do radiador, substituição da válvula termostática e troca completa do fluido de arrefecimento.',
      prioridade: 'critica', prazo_estimado: '5 dias úteis',
    },
    problemas: [
      { titulo: 'Junta do cabeçote queimada', descricao: 'Passagem de água para o cilindro 3 e 4, com fumaça branca constante e perda de compressão.', sistema: 'Motor', gravidade: 'critica', servico: 'Desmontagem do cabeçote, retífica e substituição da junta.', impede: true },
      { titulo: 'Radiador obstruído', descricao: 'Colmeias entupidas por sujeira e resíduo de aditivo vencido, reduzindo a troca térmica.', sistema: 'Sistema de arrefecimento', gravidade: 'alta', servico: 'Remoção, limpeza química e teste de estanqueidade.', impede: false },
      { titulo: 'Válvula termostática travada', descricao: 'Válvula não fecha, impedindo o motor de atingir a temperatura de trabalho.', sistema: 'Sistema de arrefecimento', gravidade: 'media', servico: 'Substituição da válvula.', impede: false },
    ],
    pecas: [
      { problema: 0, categoria: 'Motor', subcategoria: 'Juntas e retentores', nome: 'Jogo de juntas do cabeçote Scania R450', descricao: 'Jogo completo de juntas do cabeçote com retentores de válvula.', codigo: 'JC-SC-450', marca: 'Sabó', qtd: 1, unidade: 'JG', tipo: 'original', urgencia: 'critica', motivo: 'Junta queimada com passagem de água para o cilindro.', obs: 'Conferir se o jogo acompanha os anéis de vedação do coletor.' },
      { problema: 0, categoria: 'Motor', subcategoria: 'Válvulas e molas', nome: 'Jogo de válvulas de admissão e escape', descricao: 'Válvulas para retífica do cabeçote — 4 por cilindro.', codigo: 'VLV-SC-450', marca: 'Mahle', qtd: 1, unidade: 'JG', tipo: 'indiferente', urgencia: 'alta', motivo: 'Válvulas empenadas pelo superaquecimento.' },
      { problema: 1, categoria: 'Sistema de arrefecimento', subcategoria: 'Radiador', nome: 'Radiador Scania série R', descricao: 'Radiador completo com tanques e colmeia de alumínio.', codigo: 'RAD-SC-R', marca: 'Valeo', qtd: 1, tipo: 'paralela', urgencia: 'alta', motivo: 'Colmeias obstruídas sem possibilidade de recuperação.' },
      { problema: 2, categoria: 'Sistema de arrefecimento', subcategoria: 'Válvula termostática', nome: 'Válvula termostática 83°C', descricao: 'Válvula com abertura em 83 graus.', codigo: 'VT-83', marca: 'Wahler', qtd: 1, tipo: 'indiferente', urgencia: 'normal', motivo: 'Válvula travada na posição aberta.' },
    ],
  });

  // ---- Ficha 2: aguardando análise (fila da administração)
  const f2 = criarFicha({
    caminhao: caminhoes[2], mecanico_id: mecanico2, mecanico_nome: 'Jonas Ribeiro', dias: 2,
    status: 'aguardando_analise',
    dados: {
      km: 725410, motivo_entrada: 'Ruído no eixo traseiro e vibração acima de 60 km/h.',
      relato_motorista: 'Barulho de rolamento vindo da traseira e trepidação no volante em velocidade de estrada.',
      diagnostico: 'Cruzeta do cardã com folga excessiva e rolamento central desgastado. Amortecedores traseiros do lado direito vazando óleo. Recomenda-se substituir o conjunto para eliminar a vibração.',
      servicos_recomendados: 'Substituição das cruzetas e do rolamento central, balanceamento do cardã e troca dos amortecedores traseiros.',
      prioridade: 'alta', prazo_estimado: '3 dias úteis',
    },
    problemas: [
      { titulo: 'Cruzeta do cardã com folga', descricao: 'Folga radial perceptível a olho nu, gerando vibração acima de 60 km/h.', sistema: 'Transmissão e cardã', gravidade: 'alta', servico: 'Substituição das cruzetas e balanceamento do cardã.', impede: false },
      { titulo: 'Amortecedores traseiros vazando', descricao: 'Amortecedores do lado direito com vazamento de óleo e perda de eficiência.', sistema: 'Suspensão', gravidade: 'media', servico: 'Substituição do par de amortecedores.', impede: false },
    ],
    pecas: [
      { problema: 0, categoria: 'Transmissão e cardã', subcategoria: 'Cruzeta', nome: 'Cruzeta do cardã 57x152mm', descricao: 'Cruzeta reforçada para eixo cardã pesado.', codigo: 'CRZ-57152', marca: 'Spicer', qtd: 2, tipo: 'original', urgencia: 'alta', motivo: 'Folga excessiva causando vibração.' },
      { problema: 0, categoria: 'Transmissão e cardã', subcategoria: 'Rolamento central', nome: 'Rolamento central do cardã', descricao: 'Rolamento com suporte de borracha.', codigo: 'RC-CARD-01', marca: 'SKF', qtd: 1, tipo: 'indiferente', urgencia: 'alta', motivo: 'Rolamento com ruído e folga.' },
      { problema: 1, categoria: 'Suspensão', subcategoria: 'Amortecedores', nome: 'Amortecedor traseiro Actros', descricao: 'Amortecedor pressurizado traseiro.', codigo: 'AMT-MB-TR', marca: 'Cofap', qtd: 2, unidade: 'PAR', posicao: 'Traseiro direito', tipo: 'paralela', urgencia: 'normal', motivo: 'Vazamento de óleo e perda de eficiência.' },
    ],
  });

  // ---- Ficha 3: em cotação
  const f3 = criarFicha({
    caminhao: caminhoes[4], mecanico_id: mecanico, mecanico_nome: 'Carlos Ferreira', dias: 5,
    status: 'em_cotacao', statusPecas: 'em_cotacao',
    dados: {
      km: 812300, motivo_entrada: 'Freios sem eficiência e luz de ABS acesa no painel.',
      relato_motorista: 'O pedal vai quase até o fim e o caminhão demora para parar. A luz amarela do ABS ficou acesa.',
      diagnostico: 'Lonas dos eixos traseiros no limite mínimo, tambores com sulcos profundos e sensor de ABS da roda traseira esquerda sem sinal. O secador de ar está saturando e liberando umidade no sistema pneumático.',
      servicos_recomendados: 'Substituição das lonas e tambores dos eixos traseiros, troca do sensor de ABS e do secador de ar, com sangria completa do sistema.',
      prioridade: 'critica', prazo_estimado: '4 dias úteis',
    },
    problemas: [
      { titulo: 'Lonas de freio no limite', descricao: 'Espessura remanescente abaixo do mínimo recomendado pelo fabricante nos dois eixos traseiros.', sistema: 'Sistema de freios', gravidade: 'critica', servico: 'Substituição das lonas e usinagem/troca dos tambores.', impede: true },
      { titulo: 'Sensor de ABS sem sinal', descricao: 'Sensor da roda traseira esquerda não envia leitura, desativando o ABS do eixo.', sistema: 'Sistema de freios', gravidade: 'alta', servico: 'Substituição do sensor e limpeza da roda fônica.', impede: true },
      { titulo: 'Secador de ar saturado', descricao: 'Elemento filtrante saturado permitindo passagem de umidade para os reservatórios.', sistema: 'Sistema pneumático', gravidade: 'media', servico: 'Troca do secador e purga dos reservatórios.', impede: false },
    ],
    pecas: [
      { problema: 0, categoria: 'Sistema de freios', subcategoria: 'Lonas e pastilhas', nome: 'Jogo de lonas de freio traseiro', descricao: 'Jogo de lonas para eixo traseiro com rebites.', codigo: 'LN-TR-4515', marca: 'Fras-le', qtd: 2, unidade: 'JG', posicao: 'Traseiro', tipo: 'original', urgencia: 'critica', motivo: 'Lonas abaixo da espessura mínima de segurança.' },
      { problema: 0, categoria: 'Sistema de freios', subcategoria: 'Tambores', nome: 'Tambor de freio traseiro 410mm', descricao: 'Tambor de freio fundido, diâmetro 410 mm.', codigo: 'TB-410', marca: 'Randon', qtd: 4, posicao: 'Traseiro', tipo: 'indiferente', urgencia: 'critica', motivo: 'Tambores com sulcos profundos e fora de medida.' },
      { problema: 1, categoria: 'Sistema de freios', subcategoria: 'ABS / EBS', nome: 'Sensor de ABS traseiro esquerdo', descricao: 'Sensor indutivo com chicote de 1,5 m.', codigo: 'ABS-TE-15', marca: 'Wabco', qtd: 1, posicao: 'Traseiro esquerdo', tipo: 'original', urgencia: 'alta', motivo: 'Sensor sem leitura, ABS inoperante no eixo.' },
      { problema: 2, categoria: 'Sistema pneumático', subcategoria: 'Purgador', nome: 'Secador de ar com filtro', descricao: 'Secador de ar completo com cartucho.', codigo: 'SEC-AR-01', marca: 'Wabco', qtd: 1, tipo: 'paralela', urgencia: 'normal', motivo: 'Elemento saturado liberando umidade no sistema.' },
    ],
  });

  // ---- Ficha 4: rascunho do mecânico
  criarFicha({
    caminhao: caminhoes[1], mecanico_id: mecanico, mecanico_nome: 'Carlos Ferreira', dias: 0,
    status: 'rascunho',
    dados: {
      km: 312780, motivo_entrada: 'Revisão preventiva de 300 mil km.',
      relato_motorista: 'Sem queixas. Entrada apenas para revisão programada.',
      diagnostico: 'Inspeção em andamento. Filtros e óleos vencidos pelo plano de manutenção.',
      servicos_recomendados: '', prioridade: 'baixa', prazo_estimado: '1 dia',
    },
    problemas: [
      { titulo: 'Revisão preventiva vencida', descricao: 'Plano de manutenção indica troca de filtros e óleo do motor.', sistema: 'Sistema de lubrificação', gravidade: 'baixa', servico: 'Troca de óleo e filtros.', impede: false },
    ],
    pecas: [
      { problema: 0, categoria: 'Sistema de lubrificação', subcategoria: 'Filtro de óleo', nome: 'Filtro de óleo Volvo FH', descricao: 'Filtro de óleo do motor, rosqueável.', codigo: 'FO-FH-540', marca: 'Mann', qtd: 2, tipo: 'original', urgencia: 'baixa', motivo: 'Troca por vencimento do plano de manutenção.' },
    ],
  });

  // ---- Ficha 5: finalizada (histórico)
  const f5 = criarFicha({
    caminhao: caminhoes[3], mecanico_id: mecanico2, mecanico_nome: 'Jonas Ribeiro', dias: 45,
    status: 'concluida', statusPecas: 'instalada',
    dados: {
      km: 190200, motivo_entrada: 'Bateria descarregando durante a noite.',
      relato_motorista: 'De manhã o caminhão não dá partida. Precisa de chupeta quase todo dia.',
      diagnostico: 'Alternador com diodo em curto, não completando a carga. Baterias no fim da vida útil, com densidade abaixo do mínimo.',
      servicos_recomendados: 'Substituição do alternador e do par de baterias, com teste de fuga de corrente.',
      prioridade: 'alta', prazo_estimado: '1 dia',
    },
    problemas: [
      { titulo: 'Alternador não carrega', descricao: 'Diodo em curto — tensão de carga em 12,4 V com o motor acelerado.', sistema: 'Baterias e alternador', gravidade: 'alta', servico: 'Substituição do alternador.', impede: false },
    ],
    pecas: [
      { problema: 0, categoria: 'Baterias e alternador', subcategoria: 'Alternador', nome: 'Alternador 28V 100A', descricao: 'Alternador 28 volts, 100 amperes.', codigo: 'ALT-28-100', marca: 'Bosch', qtd: 1, tipo: 'original', urgencia: 'alta', motivo: 'Diodo em curto, sem carga.' },
      { problema: 0, categoria: 'Baterias e alternador', subcategoria: 'Bateria', nome: 'Bateria 150Ah', descricao: 'Bateria estacionária 150 Ah.', codigo: 'BAT-150', marca: 'Moura', qtd: 2, tipo: 'indiferente', urgencia: 'alta', motivo: 'Baterias no fim da vida útil.' },
    ],
  });
  db.prepare(
    `UPDATE fichas SET finalizada_em = datetime('now','-40 days'), servico_finalizado_em = datetime('now','-41 days') WHERE id = ?`
  ).run(f5.fichaId);

  // ------------------------------------------------------------ Cotações
  /** Cria cotação com propostas de vários fornecedores. */
  function criarCotacao(ficha, propostasPorPeca, { aprovada, dias }) {
    const numero = gerarNumero('COT');
    const cotacaoId = db.prepare(
      `INSERT INTO cotacoes (numero, ficha_id, status, criado_por, aprovada_por, aprovada_em, criado_em)
       VALUES (?,?,?,?,?,?, datetime('now', ?))`
    ).run(
      numero, ficha.fichaId, aprovada ? 'aprovada' : 'aberta', admin,
      aprovada ? admin : null, aprovada ? `datetime('now','-${dias} days')` && new Date(Date.now() - dias * 86400000).toISOString().slice(0, 19).replace('T', ' ') : null,
      `-${dias} days`
    ).lastInsertRowid;

    ficha.idsPecas.forEach((pecaId, indice) => {
      const lista = propostasPorPeca[indice] || [];
      lista.forEach((p, i) => {
        const quantidade = db.prepare('SELECT quantidade FROM pecas_solicitadas WHERE id = ?').get(pecaId).quantidade;
        const bruto = Math.round(quantidade * p.unitario * 100) / 100;
        const total = Math.round((bruto - (p.desconto || 0) + (p.frete || 0)) * 100) / 100;
        db.prepare(
          `INSERT INTO propostas (cotacao_id, peca_id, fornecedor_id, marca_oferecida, codigo_peca, quantidade,
             valor_unitario, desconto, frete, valor_total, prazo_entrega_dias, forma_pagamento, garantia,
             disponibilidade, data_cotacao, validade, vendedor_nome, vendedor_telefone, selecionada, criado_por, criado_em)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, date('now', ?), date('now','+15 days'), ?, ?, ?, ?, datetime('now', ?))`
        ).run(
          cotacaoId, pecaId, fornecedores[p.fornecedor], p.marca, p.codigo, quantidade, p.unitario,
          p.desconto || 0, p.frete || 0, total, p.prazo, p.pagamento, p.garantia, p.disponibilidade,
          `-${dias} days`, p.vendedor, p.telefone, aprovada && i === (p.escolhida ? i : -1) ? 1 : 0,
          admin, `-${dias} days`
        );
      });
      if (aprovada) {
        const escolhidaIndice = lista.findIndex((p) => p.escolhida);
        if (escolhidaIndice >= 0) {
          const props = db.prepare('SELECT id FROM propostas WHERE cotacao_id = ? AND peca_id = ? ORDER BY id').all(cotacaoId, pecaId);
          db.prepare('UPDATE propostas SET selecionada = 0 WHERE peca_id = ?').run(pecaId);
          db.prepare('UPDATE propostas SET selecionada = 1 WHERE id = ?').run(props[escolhidaIndice].id);
        }
      }
    });
    registrar('cotacao', cotacaoId, 'criada', `Cotação ${numero} aberta a partir da ficha ${ficha.numero}`, admin, 'Administração SOS', dias);
    if (aprovada) registrar('cotacao', cotacaoId, 'aprovada', `Cotação ${numero} aprovada`, admin, 'Administração SOS', dias - 1);
    return { cotacaoId, numero };
  }

  const c1 = criarCotacao(f1, [
    [
      { fornecedor: 0, marca: 'Sabó', codigo: 'JC-4587', unitario: 1780, desconto: 80, frete: 0, prazo: 5, pagamento: 'Boleto 30 dias', garantia: '6 meses', disponibilidade: 'Em estoque', vendedor: 'Marcos Andrade', telefone: '41991110011', escolhida: true },
      { fornecedor: 1, marca: 'Elring', codigo: 'EL-9921', unitario: 1950, desconto: 0, frete: 120, prazo: 3, pagamento: 'Boleto 30/60', garantia: '12 meses', disponibilidade: 'Em estoque', vendedor: 'Fernanda Lopes', telefone: '41991110022' },
      { fornecedor: 3, marca: 'Sabó', codigo: 'JC-4587', unitario: 1890, desconto: 50, frete: 60, prazo: 7, pagamento: 'Boleto 21 dias', garantia: '6 meses', disponibilidade: 'Sob encomenda', vendedor: 'Silvana Prado', telefone: '41991110044' },
    ],
    [
      { fornecedor: 0, marca: 'Mahle', codigo: 'MH-VLV-450', unitario: 2350, desconto: 100, frete: 0, prazo: 6, pagamento: 'Boleto 30 dias', garantia: '6 meses', disponibilidade: 'Sob encomenda', vendedor: 'Marcos Andrade', telefone: '41991110011' },
      { fornecedor: 1, marca: 'Mahle', codigo: 'MH-VLV-450', unitario: 2180, desconto: 0, frete: 90, prazo: 4, pagamento: 'Boleto 30/60', garantia: '12 meses', disponibilidade: 'Em estoque', vendedor: 'Fernanda Lopes', telefone: '41991110022', escolhida: true },
    ],
    [
      { fornecedor: 1, marca: 'Valeo', codigo: 'VL-RAD-SCR', unitario: 4200, desconto: 200, frete: 150, prazo: 4, pagamento: 'Boleto 30/60', garantia: '12 meses', disponibilidade: 'Em estoque', vendedor: 'Fernanda Lopes', telefone: '41991110022', escolhida: true },
      { fornecedor: 2, marca: 'Behr', codigo: 'BH-RAD-01', unitario: 4600, desconto: 0, frete: 250, prazo: 8, pagamento: 'À vista / PIX', garantia: '6 meses', disponibilidade: 'Estoque parcial', vendedor: 'Ricardo Nunes', telefone: '42991110033' },
    ],
    [
      { fornecedor: 0, marca: 'Wahler', codigo: 'WH-83', unitario: 210, desconto: 0, frete: 0, prazo: 5, pagamento: 'Boleto 30 dias', garantia: '3 meses', disponibilidade: 'Em estoque', vendedor: 'Marcos Andrade', telefone: '41991110011', escolhida: true },
      { fornecedor: 3, marca: 'MTE', codigo: 'MTE-83', unitario: 185, desconto: 0, frete: 45, prazo: 9, pagamento: 'Boleto 21 dias', garantia: '3 meses', disponibilidade: 'Sob encomenda', vendedor: 'Silvana Prado', telefone: '41991110044' },
    ],
  ], { aprovada: true, dias: 9 });

  criarCotacao(f3, [
    [
      { fornecedor: 0, marca: 'Fras-le', codigo: 'FL-LN-4515', unitario: 890, desconto: 40, frete: 0, prazo: 3, pagamento: 'Boleto 30 dias', garantia: '6 meses', disponibilidade: 'Em estoque', vendedor: 'Marcos Andrade', telefone: '41991110011' },
      { fornecedor: 1, marca: 'Cobreq', codigo: 'CB-LN-45', unitario: 820, desconto: 0, frete: 80, prazo: 2, pagamento: 'Boleto 30/60', garantia: '6 meses', disponibilidade: 'Em estoque', vendedor: 'Fernanda Lopes', telefone: '41991110022' },
    ],
    [
      { fornecedor: 1, marca: 'Randon', codigo: 'RD-TB-410', unitario: 720, desconto: 0, frete: 180, prazo: 4, pagamento: 'Boleto 30/60', garantia: '12 meses', disponibilidade: 'Em estoque', vendedor: 'Fernanda Lopes', telefone: '41991110022' },
      { fornecedor: 2, marca: 'Fremax', codigo: 'FX-410', unitario: 680, desconto: 0, frete: 260, prazo: 7, pagamento: 'À vista / PIX', garantia: '6 meses', disponibilidade: 'Estoque parcial', vendedor: 'Ricardo Nunes', telefone: '42991110033' },
    ],
    [
      { fornecedor: 3, marca: 'Wabco', codigo: 'WB-ABS-15', unitario: 640, desconto: 0, frete: 0, prazo: 5, pagamento: 'Boleto 21 dias', garantia: '12 meses', disponibilidade: 'Em estoque', vendedor: 'Silvana Prado', telefone: '41991110044' },
    ],
    [],
  ], { aprovada: false, dias: 3 });

  // ------------------------------------------------------------ Ordem de compra da ficha 1
  const selecionadas = db.prepare(
    `SELECT p.*, ps.nome, ps.unidade, ps.posicao, ps.codigo_referencia
       FROM propostas p JOIN pecas_solicitadas ps ON ps.id = p.peca_id
      WHERE p.cotacao_id = ? AND p.selecionada = 1 ORDER BY p.fornecedor_id, p.id`
  ).all(c1.cotacaoId);

  const porFornecedor = new Map();
  for (const s of selecionadas) {
    if (!porFornecedor.has(s.fornecedor_id)) porFornecedor.set(s.fornecedor_id, []);
    porFornecedor.get(s.fornecedor_id).push(s);
  }

  let primeiraOrdem = null;
  for (const [fornecedorId, itens] of porFornecedor) {
    const subtotal = Math.round(itens.reduce((s, i) => s + i.quantidade * i.valor_unitario, 0) * 100) / 100;
    const desconto = Math.round(itens.reduce((s, i) => s + (i.desconto || 0), 0) * 100) / 100;
    const frete = Math.round(itens.reduce((s, i) => s + (i.frete || 0), 0) * 100) / 100;
    const total = Math.round((subtotal - desconto + frete) * 100) / 100;
    const numero = gerarNumero('OC');
    const ordemId = db.prepare(
      `INSERT INTO ordens_compra (numero, ficha_id, cotacao_id, fornecedor_id, caminhao_id, empresa_id,
         subtotal, desconto, frete, total, forma_pagamento, prazo_entrega, previsao_entrega, endereco_entrega,
         responsavel_id, status, data_emissao, criado_em)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?, date('now','-2 days'), ?, ?, ?, datetime('now','-8 days'), datetime('now','-8 days'))`
    ).run(
      numero, f1.fichaId, c1.cotacaoId, fornecedorId, caminhoes[0], empresas[0],
      subtotal, desconto, frete, total, itens[0].forma_pagamento,
      `${Math.max(...itens.map((i) => i.prazo_entrega_dias || 0))} dia(s)`,
      'Oficina SOS Truck Service — Rod. BR-116, km 112, Curitiba/PR', admin,
      primeiraOrdem === null ? 'recebida' : 'confirmada'
    ).lastInsertRowid;

    for (const i of itens) {
      db.prepare(
        `INSERT INTO ordens_itens (ordem_id, peca_id, proposta_id, descricao, codigo, marca, unidade,
           quantidade, quantidade_recebida, valor_unitario, desconto, total, recebida_em)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?, ${primeiraOrdem === null ? "datetime('now','-2 days')" : 'NULL'})`
      ).run(
        ordemId, i.peca_id, i.id, i.nome, i.codigo_peca || i.codigo_referencia, i.marca_oferecida,
        i.unidade, i.quantidade, primeiraOrdem === null ? i.quantidade : 0,
        i.valor_unitario, i.desconto || 0, Math.round((i.quantidade * i.valor_unitario - (i.desconto || 0)) * 100) / 100
      );
    }
    const nomeFornecedor = db.prepare('SELECT nome FROM fornecedores WHERE id = ?').get(fornecedorId).nome;
    registrar('ordem_compra', ordemId, 'emitida', `Ordem ${numero} emitida para ${nomeFornecedor}`, admin, 'Administração SOS', 8);
    registrar('ficha', f1.fichaId, 'ordem_emitida', `Ordem de compra ${numero} emitida (${nomeFornecedor})`, admin, 'Administração SOS', 8);
    if (primeiraOrdem === null) {
      registrar('ordem_compra', ordemId, 'recebimento', `Recebimento total registrado na ordem ${numero}`, admin, 'Administração SOS', 2);
      primeiraOrdem = ordemId;
    }
  }

  db.prepare(`UPDATE pecas_solicitadas SET status='oc_emitida' WHERE ficha_id = ?`).run(f1.fichaId);
  db.prepare(
    `UPDATE pecas_solicitadas SET status='recebida', recebida_em=datetime('now','-2 days')
      WHERE id IN (SELECT peca_id FROM ordens_itens WHERE recebida_em IS NOT NULL)`
  ).run();
  db.prepare(`UPDATE pecas_solicitadas SET status='instalada', instalada_em=datetime('now','-41 days'),
    recebida_em=datetime('now','-43 days'), entregue_em=datetime('now','-42 days') WHERE ficha_id = ?`).run(f5.fichaId);

  // ------------------------------------------------------------ Comentários e notificações
  db.prepare(
    `INSERT INTO comentarios (ficha_id, usuario_id, mensagem, interno, criado_em)
     VALUES (?,?,?,?, datetime('now','-8 days'))`
  ).run(f1.fichaId, admin, 'Peças aprovadas. O radiador chega pela Truck Center em até 4 dias úteis.', 0);
  db.prepare(
    `INSERT INTO comentarios (ficha_id, usuario_id, mensagem, interno, criado_em)
     VALUES (?,?,?,?, datetime('now','-7 days'))`
  ).run(f1.fichaId, mecanico, 'Certo. Vou adiantar a desmontagem do cabeçote enquanto as peças não chegam.', 0);
  db.prepare(
    `INSERT INTO comentarios (ficha_id, usuario_id, mensagem, interno, criado_em)
     VALUES (?,?,?,?, datetime('now','-6 days'))`
  ).run(f1.fichaId, admin, 'Negociar desconto adicional com a Diesel Parts na próxima compra.', 1);

  db.prepare(
    `INSERT INTO notificacoes (usuario_id, titulo, mensagem, tipo, link, criado_em)
     VALUES (?,?,?,?,?, datetime('now','-2 days'))`
  ).run(mecanico, 'Peças recebidas', `${f1.numero} — jogo de juntas e válvulas disponíveis na oficina.`, 'sucesso', `/#/fichas/${f1.fichaId}`);
  db.prepare(
    `INSERT INTO notificacoes (usuario_id, perfil_destino, titulo, mensagem, tipo, link, criado_em)
     VALUES (?,?,?,?,?,?, datetime('now','-2 days'))`
  ).run(admin, 'admin', 'Nova ficha para análise', `${f2.numero} — GHI3J67 (Jonas Ribeiro)`, 'info', `/#/fichas/${f2.fichaId}`);

  console.log('• Dados demonstrativos criados:');
  console.log(`  - ${empresas.length} empresas, ${caminhoes.length} caminhões, ${fornecedores.length} fornecedores`);
  console.log(`  - 5 fichas (${f1.numero}, ${f2.numero}, ${f3.numero} + rascunho e finalizada)`);
  console.log(`  - 2 cotações e ${porFornecedor.size} ordens de compra`);
}

// ------------------------------------------------------------------ Execucao
function main() {
  if (RESETAR) limpar();
  semearCategorias();
  semearConfiguracoes();
  const usuarios = semearUsuarios();
  if (!SEM_DEMO) semearDemonstracao(usuarios);
  console.log('\nPronto! Acesse o sistema com:');
  console.log('  Administração → admin@sostruck.com.br / sos12345');
  console.log('  Mecânico      → mecanico@sostruck.com.br / sos12345');
}

main();
