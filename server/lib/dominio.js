'use strict';
/** Regras de dominio: status, transicoes, categorias e rotulos em pt-BR. */

const PERFIS = ['mecanico', 'admin'];

// ---------------------------------------------------------------- Fichas
const STATUS_FICHA = {
  rascunho:              { rotulo: 'Rascunho',                cor: 'cinza'    },
  aguardando_analise:    { rotulo: 'Aguardando análise',      cor: 'azul'     },
  devolvida:             { rotulo: 'Devolvida para correção', cor: 'laranja'  },
  em_cotacao:            { rotulo: 'Em cotação',              cor: 'roxo'     },
  aguardando_aprovacao:  { rotulo: 'Aguardando aprovação',    cor: 'amarelo'  },
  aprovada:              { rotulo: 'Aprovada',                cor: 'verde'    },
  em_compra:             { rotulo: 'Em compra',               cor: 'ciano'    },
  aguardando_recebimento:{ rotulo: 'Aguardando recebimento',  cor: 'ciano'    },
  em_execucao:           { rotulo: 'Em execução',             cor: 'azul'     },
  servico_concluido:     { rotulo: 'Serviço concluído',       cor: 'verde'    },
  concluida:             { rotulo: 'Finalizada',              cor: 'verde'    },
  cancelada:             { rotulo: 'Cancelada',               cor: 'vermelho' },
};

// ---------------------------------------------------------------- Pecas
const STATUS_PECA = {
  rascunho:             { rotulo: 'Rascunho',              cor: 'cinza'   },
  aguardando_analise:   { rotulo: 'Aguardando análise',    cor: 'azul'    },
  devolvida:            { rotulo: 'Devolvida para correção', cor: 'laranja' },
  aguardando_cotacao:   { rotulo: 'Aguardando cotação',    cor: 'roxo'    },
  em_cotacao:           { rotulo: 'Em cotação',            cor: 'roxo'    },
  aguardando_aprovacao: { rotulo: 'Aguardando aprovação',  cor: 'amarelo' },
  aprovada:             { rotulo: 'Aprovada',              cor: 'verde'   },
  oc_emitida:           { rotulo: 'Ordem de compra emitida', cor: 'ciano' },
  comprada:             { rotulo: 'Comprada',              cor: 'ciano'   },
  recebida:             { rotulo: 'Recebida',              cor: 'verde'   },
  entregue:             { rotulo: 'Entregue ao mecânico',  cor: 'verde'   },
  instalada:            { rotulo: 'Instalada',             cor: 'verde'   },
  cancelada:            { rotulo: 'Cancelada',             cor: 'vermelho'},
};

// ---------------------------------------------------------------- Cotacao / OC
const STATUS_COTACAO = {
  aberta:               { rotulo: 'Em cotação',           cor: 'roxo'    },
  aguardando_aprovacao: { rotulo: 'Aguardando aprovação', cor: 'amarelo' },
  aprovada:             { rotulo: 'Aprovada',             cor: 'verde'   },
  cancelada:            { rotulo: 'Cancelada',            cor: 'vermelho'},
};

const STATUS_OC = {
  emitida:    { rotulo: 'Emitida',            cor: 'azul'     },
  enviada:    { rotulo: 'Enviada ao fornecedor', cor: 'roxo'  },
  confirmada: { rotulo: 'Confirmada',         cor: 'ciano'    },
  parcial:    { rotulo: 'Recebida parcial',   cor: 'laranja'  },
  recebida:   { rotulo: 'Recebida',           cor: 'verde'    },
  cancelada:  { rotulo: 'Cancelada',          cor: 'vermelho' },
};

const STATUS_CAMINHAO = {
  disponivel:     { rotulo: 'Disponível',       cor: 'verde'    },
  em_manutencao:  { rotulo: 'Em manutenção',    cor: 'laranja'  },
  parado:         { rotulo: 'Parado / inoperante', cor: 'vermelho' },
};

const PRIORIDADES = {
  baixa:   { rotulo: 'Baixa',   cor: 'cinza'    },
  media:   { rotulo: 'Média',   cor: 'azul'     },
  alta:    { rotulo: 'Alta',    cor: 'laranja'  },
  critica: { rotulo: 'Crítica', cor: 'vermelho' },
};

const GRAVIDADES = PRIORIDADES;

const URGENCIAS = {
  baixa:   { rotulo: 'Baixa',   cor: 'cinza'    },
  normal:  { rotulo: 'Normal',  cor: 'azul'     },
  alta:    { rotulo: 'Alta',    cor: 'laranja'  },
  critica: { rotulo: 'Crítica', cor: 'vermelho' },
};

const TIPOS_PECA = {
  original:    'Original (genuína)',
  paralela:    'Paralela / similar',
  indiferente: 'Indiferente',
};

const POSICOES = [
  'Não se aplica', 'Dianteiro', 'Traseiro', 'Esquerdo', 'Direito',
  'Dianteiro esquerdo', 'Dianteiro direito', 'Traseiro esquerdo', 'Traseiro direito',
  'Central', 'Superior', 'Inferior',
];

const UNIDADES = ['UN', 'PAR', 'JG', 'KIT', 'PC', 'M', 'CM', 'L', 'ML', 'KG', 'G', 'CX', 'RL', 'MT'];

const TIPOS_CAMINHAO = [
  'Cavalo mecânico (toco)', 'Cavalo mecânico (trucado)', 'Cavalo mecânico (traçado)',
  'Truck / Toco', 'Bitruck', 'VUC', '3/4', 'Carreta', 'Bitrem', 'Rodotrem',
  'Basculante', 'Baú', 'Sider', 'Tanque', 'Graneleiro', 'Betoneira',
  'Guincho', 'Munck', 'Poliguindaste', 'Frigorífico', 'Prancha', 'Outro',
];

const FORMAS_PAGAMENTO = [
  'À vista', 'PIX', 'Boleto 7 dias', 'Boleto 14 dias', 'Boleto 21 dias', 'Boleto 28 dias',
  'Boleto 30 dias', 'Boleto 30/60', 'Boleto 30/60/90', 'Cartão de crédito',
  'Cartão parcelado 2x', 'Cartão parcelado 3x', 'Depósito antecipado', 'Faturado', 'Outro',
];

const DISPONIBILIDADES = [
  'Em estoque', 'Sob encomenda', 'Estoque parcial', 'Indisponível', 'A confirmar',
];

// ------------------------------------------------ Categorias de pecas (arvore)
const CATEGORIAS = [
  ['Motor', ['Bloco do motor','Cabeçote','Pistões e anéis','Bielas e bronzinas','Virabrequim','Comando de válvulas','Válvulas e molas','Juntas e retentores','Correias e tensores','Cárter','Volante do motor','Turbina / turbocompressor','Outros - Motor']],
  ['Sistema de alimentação e injeção', ['Bomba injetora','Bicos injetores','Bomba de combustível','Filtro de combustível','Tanque de combustível','Linhas e mangueiras','Sensor de pressão (rail)','Common rail','Unidade de controle (ECU)','Outros - Alimentação']],
  ['Admissão e escapamento', ['Filtro de ar','Coletor de admissão','Coletor de escape','Intercooler','Silencioso','Catalisador / SCR','Sistema ARLA 32','Tubulações de escape','Outros - Admissão e escape']],
  ['Sistema de arrefecimento', ['Radiador','Bomba d’água','Válvula termostática','Mangueiras de água','Reservatório de expansão','Ventoinha / hélice','Embreagem viscosa','Intercooler de água','Aditivo e fluido','Outros - Arrefecimento']],
  ['Sistema de lubrificação', ['Bomba de óleo','Filtro de óleo','Trocador de calor','Cárter e bujão','Sensor de pressão de óleo','Óleo lubrificante','Outros - Lubrificação']],
  ['Caixa de câmbio', ['Carcaça do câmbio','Engrenagens','Sincronizados','Rolamentos','Retentores','Alavanca e trambulador','Câmbio automatizado (atuadores)','Óleo de câmbio','Outros - Câmbio']],
  ['Embreagem', ['Platô','Disco de embreagem','Rolamento / atuador','Cilindro mestre','Cilindro auxiliar','Garfo e colar','Servo embreagem','Outros - Embreagem']],
  ['Diferencial', ['Coroa e pinhão','Satélites e planetárias','Rolamentos do diferencial','Bloqueio do diferencial','Retentores','Cubo de roda','Óleo do diferencial','Outros - Diferencial']],
  ['Transmissão e cardã', ['Cardã / eixo cardã','Cruzeta','Luva deslizante','Rolamento central','Flanges','Balanceamento','Outros - Transmissão']],
  ['Suspensão', ['Molas / feixe de molas','Bolsa de ar (suspensão pneumática)','Amortecedores','Barra estabilizadora','Buchas e pinos','Jumelos','Válvula niveladora','Braços e tirantes','Outros - Suspensão']],
  ['Direção', ['Caixa de direção','Bomba de direção hidráulica','Barra de direção','Terminais de direção','Pivôs','Coluna e volante','Reservatório e fluido','Outros - Direção']],
  ['Sistema de freios', ['Lonas e pastilhas','Tambores','Discos de freio','Pinças de freio','Cuícas / catracas','Válvula relé','Válvula de pé','Compressor de ar','Secador de ar','Freio motor','Freio de estacionamento','ABS / EBS','Outros - Freios']],
  ['Sistema elétrico e eletrônico', ['Chicote elétrico','Fusíveis e relés','Módulos eletrônicos','Sensores','Painel de instrumentos','Tacógrafo','Chaves e comandos','Central multiplexada','Outros - Elétrica']],
  ['Baterias e alternador', ['Bateria','Alternador','Motor de partida','Regulador de voltagem','Cabos de bateria','Chave geral','Outros - Baterias e alternador']],
  ['Chassi', ['Longarinas','Travessas','Suportes','Para-choque','Quinta roda','Engate / pino rei','Tanque de ar','Outros - Chassi']],
  ['Cabine e acabamento', ['Portas','Vidros','Retrovisores','Bancos','Painéis internos','Fechaduras e maçanetas','Suspensão da cabine','Ar-condicionado','Limpador de para-brisa','Para-brisa','Outros - Cabine']],
  ['Rodas e pneus', ['Pneus','Rodas / aros','Câmaras de ar','Parafusos e porcas de roda','Cubos e rolamentos','Calibragem e válvulas','Alinhamento e balanceamento','Outros - Rodas e pneus']],
  ['Iluminação e sinalização', ['Faróis','Lanternas traseiras','Setas / pisca','Luz de freio','Farol de neblina','Lâmpadas','Sinalizadores e giroflex','Refletivos','Outros - Iluminação']],
  ['Sistema pneumático', ['Válvulas pneumáticas','Mangueiras de ar','Reservatórios de ar','Engates rápidos','Pulmão de ar','Purgador','Compressor pneumático','Outros - Pneumático']],
  ['Sistema hidráulico', ['Bomba hidráulica','Cilindros hidráulicos','Mangueiras hidráulicas','Comando hidráulico','Reservatório e filtro','Tomada de força (PTO)','Óleo hidráulico','Outros - Hidráulico']],
  ['Acessórios', ['Rastreador','Som e mídia','Câmeras','Ferramentas e macaco','Extintor','Tapetes e capas','Kit de emergência','Outros - Acessórios']],
  ['Outros', ['Diversos','Materiais de consumo','Serviços de terceiros','Não classificado']],
];

const SISTEMAS_CAMINHAO = CATEGORIAS.map((c) => c[0]);

function slugify(texto) {
  return String(texto)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Fichas que ainda podem ser editadas pelo mecanico. */
const FICHA_EDITAVEL_MECANICO = ['rascunho', 'devolvida'];

/** Status considerados "em andamento" (nao finalizados nem cancelados). */
const FICHA_ABERTA = Object.keys(STATUS_FICHA).filter(
  (s) => !['concluida', 'cancelada'].includes(s)
);

module.exports = {
  PERFIS, STATUS_FICHA, STATUS_PECA, STATUS_COTACAO, STATUS_OC, STATUS_CAMINHAO,
  PRIORIDADES, GRAVIDADES, URGENCIAS, TIPOS_PECA, POSICOES, UNIDADES,
  TIPOS_CAMINHAO, FORMAS_PAGAMENTO, DISPONIBILIDADES, CATEGORIAS, SISTEMAS_CAMINHAO,
  FICHA_EDITAVEL_MECANICO, FICHA_ABERTA, slugify,
};
