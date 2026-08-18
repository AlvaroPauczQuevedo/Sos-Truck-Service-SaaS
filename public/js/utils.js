/** Utilidades de formatação e apoio — tudo em pt-BR, real e DD/MM/AAAA. */

export const moeda = (valor) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor) || 0);

export const numero = (valor, casas = 0) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas }).format(Number(valor) || 0);

/** Converte texto do banco (UTC) em objeto Date. */
function paraData(valor) {
  if (!valor) return null;
  const texto = String(valor).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return new Date(`${texto}T12:00:00`);
  const iso = texto.includes('T') ? texto : `${texto.replace(' ', 'T')}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function data(valor) {
  const d = paraData(valor);
  return d ? d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
}

export function dataHora(valor) {
  const d = paraData(valor);
  if (!d) return '—';
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** "há 5 minutos", "ontem", "12/03/2026" — para listas de atividades. */
export function quando(valor) {
  const d = paraData(valor);
  if (!d) return '—';
  const segundos = Math.floor((Date.now() - d.getTime()) / 1000);
  if (segundos < 60) return 'agora mesmo';
  if (segundos < 3600) return `há ${Math.floor(segundos / 60)} min`;
  if (segundos < 86400) return `há ${Math.floor(segundos / 3600)} h`;
  const dias = Math.floor(segundos / 86400);
  if (dias === 1) return 'ontem';
  if (dias < 7) return `há ${dias} dias`;
  return data(valor);
}

/** Data no formato aceito por <input type="date">. */
export function paraCampoData(valor) {
  const d = paraData(valor);
  if (!d) return '';
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export const hoje = () => paraCampoData(new Date().toISOString());

export function diasAte(valor) {
  const d = paraData(valor);
  if (!d) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

export const placa = (v) => {
  const p = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return p.length === 7 ? `${p.slice(0, 3)}-${p.slice(3)}` : (v || '—');
};

export const telefone = (v) => {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v || '—';
};

export const documento = (v) => {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length === 14) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  return v || '—';
};

export const km = (v) => (v ? `${numero(v)} km` : '—');

/** Escapa HTML — todo texto vindo do banco passa por aqui. */
export function esc(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export const iniciais = (nome) =>
  String(nome || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

/** Máscaras aplicadas durante a digitação. */
export const mascaras = {
  placa: (v) => String(v).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7),
  chassi: (v) => String(v).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 21),
  telefone: (v) => {
    const d = String(v).replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  },
  documento: (v) => {
    const d = String(v).replace(/\D/g, '').slice(0, 14);
    if (d.length <= 11) {
      return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    }
    return d.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2');
  },
  cep: (v) => String(v).replace(/\D/g, '').slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2'),
  numeros: (v) => String(v).replace(/\D/g, ''),
  moeda: (v) => String(v).replace(/[^\d,.]/g, '').replace(/\./g, '').replace(',', '.'),
};

/** Lê um valor monetário digitado em pt-BR (1.234,56) como número. */
export function lerMoeda(texto) {
  if (texto === null || texto === undefined || texto === '') return 0;
  const limpo = String(texto).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const n = Number(limpo);
  return Number.isFinite(n) ? n : 0;
}

export const debounce = (fn, espera = 320) => {
  let id;
  return (...args) => { clearTimeout(id); id = setTimeout(() => fn(...args), espera); };
};

/** Junta partes de texto ignorando vazios. */
export const juntar = (partes, separador = ' • ') => partes.filter(Boolean).join(separador);

export const plural = (n, singular, plural_) => `${numero(n)} ${n === 1 ? singular : plural_}`;

/** Link direto de conversa no WhatsApp. */
export function linkWhatsapp(telefoneBruto, mensagem = '') {
  const d = String(telefoneBruto || '').replace(/\D/g, '');
  if (d.length < 10) return null;
  const completo = d.startsWith('55') ? d : `55${d}`;
  return `https://wa.me/${completo}${mensagem ? `?text=${encodeURIComponent(mensagem)}` : ''}`;
}
