'use strict';
/**
 * Camada de banco de dados - SQLite (better-sqlite3).
 * Estrutura preparada para crescimento: chaves estrangeiras, indices,
 * numeracao sequencial por ano, historico de alteracoes e soft delete.
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, '..', 'data', 'sos-truck.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

const SCHEMA = `
-- ------------------------------------------------------------------
-- Usuarios e acesso
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  nome           TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  senha_hash     TEXT NOT NULL,
  perfil         TEXT NOT NULL CHECK (perfil IN ('mecanico','admin')),
  telefone       TEXT,
  matricula      TEXT,
  ativo          INTEGER NOT NULL DEFAULT 1,
  ultimo_acesso  TEXT,
  reset_token    TEXT,
  reset_expira   TEXT,
  criado_em      TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_usuarios_perfil ON usuarios(perfil, ativo);

-- ------------------------------------------------------------------
-- Empresas / proprietarios
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS empresas (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nome          TEXT NOT NULL,
  razao_social  TEXT,
  cnpj          TEXT,
  telefone      TEXT,
  email         TEXT,
  endereco      TEXT,
  cidade        TEXT,
  estado        TEXT,
  cep           TEXT,
  responsavel   TEXT,
  observacoes   TEXT,
  ativo         INTEGER NOT NULL DEFAULT 1,
  criado_em     TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_empresas_cnpj ON empresas(cnpj) WHERE cnpj IS NOT NULL AND cnpj <> '';

-- ------------------------------------------------------------------
-- Caminhoes (placa e chassi sao identificadores unicos)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS caminhoes (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo_frota        TEXT,
  placa               TEXT NOT NULL COLLATE NOCASE,
  chassi              TEXT COLLATE NOCASE,
  marca               TEXT,
  modelo              TEXT,
  versao              TEXT,
  ano_fabricacao      INTEGER,
  ano_modelo          INTEGER,
  km_atual            INTEGER DEFAULT 0,
  tipo                TEXT,
  cor                 TEXT,
  empresa_id          INTEGER REFERENCES empresas(id),
  motorista_nome      TEXT,
  motorista_telefone  TEXT,
  data_entrada        TEXT,
  observacoes         TEXT,
  status              TEXT NOT NULL DEFAULT 'disponivel',
  ativo               INTEGER NOT NULL DEFAULT 1,
  criado_por          INTEGER REFERENCES usuarios(id),
  criado_em           TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_caminhoes_placa  ON caminhoes(placa);
CREATE UNIQUE INDEX IF NOT EXISTS ux_caminhoes_chassi ON caminhoes(chassi) WHERE chassi IS NOT NULL AND chassi <> '';
CREATE INDEX IF NOT EXISTS ix_caminhoes_empresa ON caminhoes(empresa_id);
CREATE INDEX IF NOT EXISTS ix_caminhoes_frota   ON caminhoes(codigo_frota);
CREATE INDEX IF NOT EXISTS ix_caminhoes_status  ON caminhoes(status, ativo);

-- ------------------------------------------------------------------
-- Categorias de pecas (arvore: sistema -> subcategoria -> item)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categorias_pecas (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  nome      TEXT NOT NULL,
  slug      TEXT NOT NULL,
  pai_id    INTEGER REFERENCES categorias_pecas(id),
  nivel     INTEGER NOT NULL DEFAULT 1,
  ordem     INTEGER NOT NULL DEFAULT 0,
  ativo     INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_categorias_slug_pai ON categorias_pecas(slug, IFNULL(pai_id,0));
CREATE INDEX IF NOT EXISTS ix_categorias_pai ON categorias_pecas(pai_id, ordem);

-- ------------------------------------------------------------------
-- Fichas de inspecao mecanica
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fichas (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  numero                 TEXT NOT NULL UNIQUE,
  caminhao_id            INTEGER NOT NULL REFERENCES caminhoes(id),
  mecanico_id            INTEGER NOT NULL REFERENCES usuarios(id),
  aberta_em              TEXT NOT NULL DEFAULT (datetime('now')),
  km                     INTEGER,
  motivo_entrada         TEXT,
  relato_motorista       TEXT,
  diagnostico            TEXT,
  servicos_recomendados  TEXT,
  prioridade             TEXT NOT NULL DEFAULT 'media' CHECK (prioridade IN ('baixa','media','alta','critica')),
  prazo_estimado         TEXT,
  observacoes_internas   TEXT,
  assinatura_mecanico    TEXT,
  assinado_em            TEXT,
  status                 TEXT NOT NULL DEFAULT 'rascunho',
  enviada_em             TEXT,
  devolvida_em           TEXT,
  devolvida_motivo       TEXT,
  servico_finalizado_em  TEXT,
  finalizada_em          TEXT,
  cancelada_em           TEXT,
  cancelada_motivo       TEXT,
  criado_em              TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_fichas_status    ON fichas(status);
CREATE INDEX IF NOT EXISTS ix_fichas_caminhao  ON fichas(caminhao_id);
CREATE INDEX IF NOT EXISTS ix_fichas_mecanico  ON fichas(mecanico_id);
CREATE INDEX IF NOT EXISTS ix_fichas_abertura  ON fichas(aberta_em);
CREATE INDEX IF NOT EXISTS ix_fichas_prio      ON fichas(prioridade, status);

-- ------------------------------------------------------------------
-- Problemas encontrados (varios por ficha)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS problemas (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  ficha_id           INTEGER NOT NULL REFERENCES fichas(id) ON DELETE CASCADE,
  titulo             TEXT NOT NULL,
  descricao          TEXT,
  sistema            TEXT,
  categoria_id       INTEGER REFERENCES categorias_pecas(id),
  gravidade          TEXT NOT NULL DEFAULT 'media' CHECK (gravidade IN ('baixa','media','alta','critica')),
  servico_necessario TEXT,
  impede_uso         INTEGER NOT NULL DEFAULT 0,
  resolvido          INTEGER NOT NULL DEFAULT 0,
  resolvido_em       TEXT,
  criado_em          TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_problemas_ficha ON problemas(ficha_id);

-- ------------------------------------------------------------------
-- Solicitacoes de pecas
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pecas_solicitadas (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  ficha_id              INTEGER NOT NULL REFERENCES fichas(id) ON DELETE CASCADE,
  problema_id           INTEGER REFERENCES problemas(id) ON DELETE SET NULL,
  categoria_id          INTEGER REFERENCES categorias_pecas(id),
  subcategoria_id       INTEGER REFERENCES categorias_pecas(id),
  nome                  TEXT NOT NULL,
  descricao             TEXT,
  codigo_referencia     TEXT,
  marca_preferencial    TEXT,
  quantidade            REAL NOT NULL DEFAULT 1,
  unidade               TEXT NOT NULL DEFAULT 'UN',
  posicao               TEXT,
  tipo_peca             TEXT NOT NULL DEFAULT 'indiferente' CHECK (tipo_peca IN ('original','paralela','indiferente')),
  urgencia              TEXT NOT NULL DEFAULT 'normal' CHECK (urgencia IN ('baixa','normal','alta','critica')),
  motivo_troca          TEXT NOT NULL,
  observacoes_mecanico  TEXT,
  status                TEXT NOT NULL DEFAULT 'rascunho',
  recebida_em           TEXT,
  entregue_em           TEXT,
  instalada_em          TEXT,
  cancelada_em          TEXT,
  cancelada_motivo      TEXT,
  criado_por            INTEGER REFERENCES usuarios(id),
  criado_em             TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_pecas_ficha     ON pecas_solicitadas(ficha_id);
CREATE INDEX IF NOT EXISTS ix_pecas_status    ON pecas_solicitadas(status);
CREATE INDEX IF NOT EXISTS ix_pecas_categoria ON pecas_solicitadas(categoria_id);
CREATE INDEX IF NOT EXISTS ix_pecas_urgencia  ON pecas_solicitadas(urgencia, status);

-- ------------------------------------------------------------------
-- Fornecedores
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fornecedores (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  nome                  TEXT NOT NULL,
  razao_social          TEXT,
  cnpj                  TEXT,
  telefone              TEXT,
  whatsapp              TEXT,
  email                 TEXT,
  vendedor              TEXT,
  endereco              TEXT,
  cidade                TEXT,
  estado                TEXT,
  cep                   TEXT,
  prazo_medio_dias      INTEGER,
  condicoes_pagamento   TEXT,
  especialidades        TEXT,
  observacoes           TEXT,
  ativo                 INTEGER NOT NULL DEFAULT 1,
  criado_em             TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_fornecedores_cnpj ON fornecedores(cnpj) WHERE cnpj IS NOT NULL AND cnpj <> '';
CREATE INDEX IF NOT EXISTS ix_fornecedores_nome ON fornecedores(nome);

-- ------------------------------------------------------------------
-- Cotacoes e propostas
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cotacoes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  numero         TEXT NOT NULL UNIQUE,
  ficha_id       INTEGER NOT NULL REFERENCES fichas(id),
  status         TEXT NOT NULL DEFAULT 'aberta',
  observacoes    TEXT,
  criado_por     INTEGER REFERENCES usuarios(id),
  aprovada_por   INTEGER REFERENCES usuarios(id),
  aprovada_em    TEXT,
  cancelada_em   TEXT,
  cancelada_motivo TEXT,
  criado_em      TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_cotacoes_ficha  ON cotacoes(ficha_id);
CREATE INDEX IF NOT EXISTS ix_cotacoes_status ON cotacoes(status);

CREATE TABLE IF NOT EXISTS propostas (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  cotacao_id         INTEGER NOT NULL REFERENCES cotacoes(id) ON DELETE CASCADE,
  peca_id            INTEGER NOT NULL REFERENCES pecas_solicitadas(id) ON DELETE CASCADE,
  fornecedor_id      INTEGER NOT NULL REFERENCES fornecedores(id),
  marca_oferecida    TEXT,
  codigo_peca        TEXT,
  quantidade         REAL NOT NULL DEFAULT 1,
  valor_unitario     REAL NOT NULL DEFAULT 0,
  desconto           REAL NOT NULL DEFAULT 0,
  frete              REAL NOT NULL DEFAULT 0,
  valor_total        REAL NOT NULL DEFAULT 0,
  prazo_entrega_dias INTEGER,
  forma_pagamento    TEXT,
  garantia           TEXT,
  disponibilidade    TEXT,
  data_cotacao       TEXT,
  validade           TEXT,
  vendedor_nome      TEXT,
  vendedor_telefone  TEXT,
  observacoes        TEXT,
  selecionada        INTEGER NOT NULL DEFAULT 0,
  criado_por         INTEGER REFERENCES usuarios(id),
  criado_em          TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_propostas_cotacao    ON propostas(cotacao_id);
CREATE INDEX IF NOT EXISTS ix_propostas_peca       ON propostas(peca_id, selecionada);
CREATE INDEX IF NOT EXISTS ix_propostas_fornecedor ON propostas(fornecedor_id);

-- ------------------------------------------------------------------
-- Ordens de compra
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ordens_compra (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  numero            TEXT NOT NULL UNIQUE,
  ficha_id          INTEGER NOT NULL REFERENCES fichas(id),
  cotacao_id        INTEGER REFERENCES cotacoes(id),
  fornecedor_id     INTEGER NOT NULL REFERENCES fornecedores(id),
  caminhao_id       INTEGER REFERENCES caminhoes(id),
  empresa_id        INTEGER REFERENCES empresas(id),
  subtotal          REAL NOT NULL DEFAULT 0,
  desconto          REAL NOT NULL DEFAULT 0,
  frete             REAL NOT NULL DEFAULT 0,
  total             REAL NOT NULL DEFAULT 0,
  forma_pagamento   TEXT,
  prazo_entrega     TEXT,
  previsao_entrega  TEXT,
  endereco_entrega  TEXT,
  responsavel_id    INTEGER REFERENCES usuarios(id),
  observacoes       TEXT,
  status            TEXT NOT NULL DEFAULT 'emitida',
  data_emissao      TEXT NOT NULL DEFAULT (datetime('now')),
  recebida_em       TEXT,
  cancelada_em      TEXT,
  cancelada_motivo  TEXT,
  criado_em         TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_oc_ficha      ON ordens_compra(ficha_id);
CREATE INDEX IF NOT EXISTS ix_oc_status     ON ordens_compra(status);
CREATE INDEX IF NOT EXISTS ix_oc_fornecedor ON ordens_compra(fornecedor_id);
CREATE INDEX IF NOT EXISTS ix_oc_previsao   ON ordens_compra(previsao_entrega, status);

CREATE TABLE IF NOT EXISTS ordens_itens (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  ordem_id            INTEGER NOT NULL REFERENCES ordens_compra(id) ON DELETE CASCADE,
  peca_id             INTEGER REFERENCES pecas_solicitadas(id),
  proposta_id         INTEGER REFERENCES propostas(id),
  descricao           TEXT NOT NULL,
  codigo              TEXT,
  marca               TEXT,
  unidade             TEXT DEFAULT 'UN',
  quantidade          REAL NOT NULL DEFAULT 1,
  quantidade_recebida REAL NOT NULL DEFAULT 0,
  valor_unitario      REAL NOT NULL DEFAULT 0,
  desconto            REAL NOT NULL DEFAULT 0,
  total               REAL NOT NULL DEFAULT 0,
  recebida_em         TEXT
);
CREATE INDEX IF NOT EXISTS ix_oci_ordem ON ordens_itens(ordem_id);
CREATE INDEX IF NOT EXISTS ix_oci_peca  ON ordens_itens(peca_id);

-- ------------------------------------------------------------------
-- Fotos (originais preservadas)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fotos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  entidade      TEXT NOT NULL CHECK (entidade IN ('caminhao','ficha','problema','peca')),
  entidade_id   INTEGER NOT NULL,
  arquivo       TEXT NOT NULL,
  nome_original TEXT,
  mime          TEXT,
  tamanho       INTEGER,
  legenda       TEXT,
  criado_por    INTEGER REFERENCES usuarios(id),
  criado_em     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_fotos_entidade ON fotos(entidade, entidade_id);

-- ------------------------------------------------------------------
-- Comentarios entre mecanico e administracao
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comentarios (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ficha_id   INTEGER NOT NULL REFERENCES fichas(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  mensagem   TEXT NOT NULL,
  interno    INTEGER NOT NULL DEFAULT 0,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_comentarios_ficha ON comentarios(ficha_id, criado_em);

-- ------------------------------------------------------------------
-- Historico de alteracoes (auditoria: usuario, data e hora de cada acao)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS historico (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  entidade     TEXT NOT NULL,
  entidade_id  INTEGER,
  acao         TEXT NOT NULL,
  descricao    TEXT,
  detalhes     TEXT,
  usuario_id   INTEGER REFERENCES usuarios(id),
  usuario_nome TEXT,
  ip           TEXT,
  criado_em    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_historico_entidade ON historico(entidade, entidade_id, id DESC);
CREATE INDEX IF NOT EXISTS ix_historico_data     ON historico(criado_em DESC);

-- ------------------------------------------------------------------
-- Notificacoes
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notificacoes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id     INTEGER REFERENCES usuarios(id),
  perfil_destino TEXT,
  titulo         TEXT NOT NULL,
  mensagem       TEXT,
  tipo           TEXT NOT NULL DEFAULT 'info',
  link           TEXT,
  lida           INTEGER NOT NULL DEFAULT 0,
  lida_em        TEXT,
  criado_em      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_notif_usuario ON notificacoes(usuario_id, lida, id DESC);
CREATE INDEX IF NOT EXISTS ix_notif_perfil  ON notificacoes(perfil_destino, lida, id DESC);

-- ------------------------------------------------------------------
-- Sequencias de numeracao automatica (FIC / COT / OC) por ano
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sequencias (
  tipo   TEXT NOT NULL,
  ano    INTEGER NOT NULL,
  ultimo INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tipo, ano)
);

-- ------------------------------------------------------------------
-- Configuracoes gerais do sistema
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS configuracoes (
  chave     TEXT PRIMARY KEY,
  valor     TEXT,
  grupo     TEXT,
  descricao TEXT,
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

db.exec(SCHEMA);

/** Gera o proximo numero sequencial no formato PREFIXO-ANO-0000. */
const proximoNumero = db.transaction((tipo, ano) => {
  db.prepare(
    `INSERT INTO sequencias (tipo, ano, ultimo) VALUES (?, ?, 0)
     ON CONFLICT(tipo, ano) DO NOTHING`
  ).run(tipo, ano);
  db.prepare(`UPDATE sequencias SET ultimo = ultimo + 1 WHERE tipo = ? AND ano = ?`).run(tipo, ano);
  const { ultimo } = db.prepare(`SELECT ultimo FROM sequencias WHERE tipo = ? AND ano = ?`).get(tipo, ano);
  return `${tipo}-${ano}-${String(ultimo).padStart(4, '0')}`;
});

function gerarNumero(tipo) {
  return proximoNumero(tipo, new Date().getFullYear());
}

module.exports = { db, gerarNumero, DB_PATH };
