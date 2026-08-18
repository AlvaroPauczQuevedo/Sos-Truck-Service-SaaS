'use strict';
/** Configuracoes gerais do sistema (dados da empresa, prazos e alertas). */
const { db } = require('./../db');

const PADRAO = {
  empresa_nome: 'SOS TRUCK SERVICE',
  empresa_documento: '',
  empresa_telefone: '',
  empresa_email: '',
  empresa_endereco: '',
  endereco_entrega: '',
  responsavel_compras: '',
  prazo_alerta_entrega_dias: '2',
  alerta_pecas_criticas: '1',
  moeda: 'BRL',
  fuso: 'America/Sao_Paulo',
};

function lerConfiguracoes() {
  const linhas = db.prepare('SELECT chave, valor FROM configuracoes').all();
  const mapa = { ...PADRAO };
  for (const l of linhas) mapa[l.chave] = l.valor;
  return mapa;
}

function gravarConfiguracoes(pares) {
  const stmt = db.prepare(
    `INSERT INTO configuracoes (chave, valor, atualizado_em) VALUES (?, ?, datetime('now'))
     ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado_em = datetime('now')`
  );
  const lote = db.transaction((entradas) => {
    for (const [chave, valor] of entradas) stmt.run(chave, valor === null || valor === undefined ? '' : String(valor));
  });
  lote(Object.entries(pares));
  return lerConfiguracoes();
}

module.exports = { lerConfiguracoes, gravarConfiguracoes, PADRAO };
