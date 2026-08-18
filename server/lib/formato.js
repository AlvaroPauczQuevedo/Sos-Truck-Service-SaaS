'use strict';
/** Formatacao pt-BR: moeda em real, datas em DD/MM/AAAA. */

const moeda = (valor) =>
  'R$ ' + Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const numero = (valor, casas = 2) =>
  Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas });

/**
 * Converte o valor em Date. O banco grava data e hora em UTC no formato
 * "AAAA-MM-DD HH:MM:SS"; datas puras viram meio-dia para não trocar de dia
 * na conversão de fuso. Textos que já trazem fuso (ISO com Z) são usados
 * como estão.
 */
function paraData(valor) {
  if (!valor) return null;
  const texto = String(valor).trim();
  let d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) d = new Date(`${texto}T12:00:00Z`);
  else if (/[Zz]$|[+-]\d{2}:?\d{2}$/.test(texto)) d = new Date(texto);
  else d = new Date(`${texto.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dataBR(valor) {
  const d = paraData(valor);
  return d ? d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
}

function dataHoraBR(valor) {
  const d = paraData(valor);
  return d ? d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—';
}

const telefone = (v) => {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v || '—';
};

const documento = (v) => {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length === 14) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  return v || '—';
};

const placaBR = (v) => {
  const p = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return p.length === 7 ? `${p.slice(0, 3)}-${p.slice(3)}` : (v || '—');
};

module.exports = { moeda, numero, dataBR, dataHoraBR, telefone, documento, placaBR };
