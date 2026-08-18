'use strict';
const { erro } = require('./http');

const vazio = (v) => v === undefined || v === null || String(v).trim() === '';

function texto(valor, campo, { obrigatorio = false, max = 5000, min = 0 } = {}) {
  if (vazio(valor)) {
    if (obrigatorio) throw erro.requisicao(`O campo "${campo}" é obrigatório.`, { campo });
    return null;
  }
  const v = String(valor).trim();
  if (v.length < min) throw erro.requisicao(`"${campo}" deve ter ao menos ${min} caracteres.`, { campo });
  if (v.length > max) throw erro.requisicao(`"${campo}" deve ter no máximo ${max} caracteres.`, { campo });
  return v;
}

function numero(valor, campo, { obrigatorio = false, min = null, max = null, inteiro = false } = {}) {
  if (vazio(valor)) {
    if (obrigatorio) throw erro.requisicao(`O campo "${campo}" é obrigatório.`, { campo });
    return null;
  }
  const n = typeof valor === 'number' ? valor : Number(String(valor).replace(',', '.'));
  if (!Number.isFinite(n)) throw erro.requisicao(`"${campo}" deve ser um número válido.`, { campo });
  if (inteiro && !Number.isInteger(n)) throw erro.requisicao(`"${campo}" deve ser um número inteiro.`, { campo });
  if (min !== null && n < min) throw erro.requisicao(`"${campo}" deve ser maior ou igual a ${min}.`, { campo });
  if (max !== null && n > max) throw erro.requisicao(`"${campo}" deve ser menor ou igual a ${max}.`, { campo });
  return n;
}

function opcao(valor, campo, opcoes, { obrigatorio = false, padrao = null } = {}) {
  if (vazio(valor)) {
    if (obrigatorio) throw erro.requisicao(`Selecione uma opção para "${campo}".`, { campo });
    return padrao;
  }
  const v = String(valor).trim();
  const lista = Array.isArray(opcoes) ? opcoes : Object.keys(opcoes);
  if (!lista.includes(v)) throw erro.requisicao(`Valor inválido para "${campo}".`, { campo });
  return v;
}

function booleano(valor, padrao = false) {
  if (valor === undefined || valor === null || valor === '') return padrao ? 1 : 0;
  if (typeof valor === 'boolean') return valor ? 1 : 0;
  const v = String(valor).toLowerCase();
  return ['1', 'true', 'sim', 'on', 'yes'].includes(v) ? 1 : 0;
}

/** Normaliza a placa: remove separadores e coloca em maiusculas (Mercosul ou antiga). */
function placa(valor, { obrigatorio = true } = {}) {
  if (vazio(valor)) {
    if (obrigatorio) throw erro.requisicao('A placa do caminhão é obrigatória.', { campo: 'placa' });
    return null;
  }
  const v = String(valor).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z]{3}[0-9][0-9A-Z][0-9]{2}$/.test(v)) {
    throw erro.requisicao('Placa inválida. Use o formato ABC1234 ou ABC1D23.', { campo: 'placa' });
  }
  return v;
}

function chassi(valor, { obrigatorio = false } = {}) {
  if (vazio(valor)) {
    if (obrigatorio) throw erro.requisicao('O chassi é obrigatório.', { campo: 'chassi' });
    return null;
  }
  const v = String(valor).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (v.length < 11 || v.length > 21) {
    throw erro.requisicao('Chassi inválido. Informe entre 11 e 21 caracteres.', { campo: 'chassi' });
  }
  return v;
}

function email(valor, campo = 'e-mail', { obrigatorio = true } = {}) {
  if (vazio(valor)) {
    if (obrigatorio) throw erro.requisicao(`O campo "${campo}" é obrigatório.`, { campo: 'email' });
    return null;
  }
  const v = String(valor).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) {
    throw erro.requisicao('Informe um e-mail válido.', { campo: 'email' });
  }
  return v;
}

/** Aceita AAAA-MM-DD ou DD/MM/AAAA e devolve sempre AAAA-MM-DD. */
function data(valor, campo, { obrigatorio = false } = {}) {
  if (vazio(valor)) {
    if (obrigatorio) throw erro.requisicao(`A data "${campo}" é obrigatória.`, { campo });
    return null;
  }
  const v = String(valor).trim();
  let iso = null;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) iso = v.slice(0, 10);
  else {
    const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) iso = `${m[3]}-${m[2]}-${m[1]}`;
  }
  if (!iso) throw erro.requisicao(`Data inválida em "${campo}". Use DD/MM/AAAA.`, { campo });
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) throw erro.requisicao(`Data inválida em "${campo}".`, { campo });
  return iso;
}

/** Apenas digitos (CNPJ/CPF/telefone), preservando null quando vazio. */
function digitos(valor) {
  if (vazio(valor)) return null;
  const v = String(valor).replace(/\D/g, '');
  return v || null;
}

function cnpj(valor, { obrigatorio = false } = {}) {
  const v = digitos(valor);
  if (!v) {
    if (obrigatorio) throw erro.requisicao('O CNPJ é obrigatório.', { campo: 'cnpj' });
    return null;
  }
  if (v.length !== 14 && v.length !== 11) {
    throw erro.requisicao('CNPJ/CPF inválido. Informe 14 dígitos (CNPJ) ou 11 (CPF).', { campo: 'cnpj' });
  }
  return v;
}

module.exports = { texto, numero, opcao, booleano, placa, chassi, email, data, digitos, cnpj, vazio };
