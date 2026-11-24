// Datas tratadas como texto ISO (AAAA-MM-DD) para evitar problemas de fuso horário.

const pad = (n) => String(n).padStart(2, '0');

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function validYMD(y, m, d) {
  if (!(y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1)) return false;
  return d <= daysInMonth(y, m);
}

export function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function iso(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Converte vários formatos de data em 'AAAA-MM-DD' (ou null). */
export function parseDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) {
    if (isNaN(v)) return null;
    return iso(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  }
  if (typeof v === 'number') {
    // Número de série do Excel (dias desde 1899-12-30)
    if (v > 1 && v < 80000) {
      const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
      return parseDate(d);
    }
    return null;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) {
    const [y, mo, d] = [+m[1], +m[2], +m[3]];
    return validYMD(y, mo, d) ? iso(y, mo, d) : null;
  }
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) {
    const [d, mo, y] = [+m[1], +m[2], +m[3]];
    return validYMD(y, mo, d) ? iso(y, mo, d) : null;
  }
  m = s.match(/^(\d{1,2})[-/.](\d{4})$/);
  if (m) {
    const [mo, y] = [+m[1], +m[2]];
    return validYMD(y, mo, 1) ? iso(y, mo, 1) : null;
  }
  if (/^\d+(\.\d+)?$/.test(s)) return parseDate(Number(s));
  return null;
}

/** Converte um período em 'AAAA-MM' (aceita 2026-03, 202603, 03/2026, mar 2026, março de 2026, datas). */
export function parsePeriod(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date || typeof v === 'number') {
    if (typeof v === 'number' && v >= 190001 && v <= 210012) return parsePeriod(String(v));
    const d = parseDate(v);
    return d ? d.slice(0, 7) : null;
  }
  const s = String(v).trim().toLowerCase();
  let m = s.match(/^(\d{4})[-/.]?(\d{2})$/);
  if (m && +m[2] >= 1 && +m[2] <= 12) return `${m[1]}-${m[2]}`;
  m = s.match(/^(\d{1,2})[-/.](\d{4})$/);
  if (m && +m[1] >= 1 && +m[1] <= 12) return `${m[2]}-${pad(+m[1])}`;
  const norm = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  m = norm.match(/^([a-z]{3})[a-z]*\.?\s*(?:de\s+)?[-/]?\s*(\d{4})$/);
  if (m) {
    const idx = MESES.indexOf(m[1]);
    if (idx >= 0) return `${m[2]}-${pad(idx + 1)}`;
  }
  const d = parseDate(s);
  return d ? d.slice(0, 7) : null;
}

export function todayISO() {
  const d = new Date();
  return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function parts(isoStr) {
  return isoStr.split('-').map(Number);
}

/** Idade em anos completos numa data de referência. */
export function ageAt(birthISO, refISO) {
  if (!birthISO || !refISO) return null;
  const [by, bm, bd] = parts(birthISO);
  const [ry, rm, rd] = parts(refISO);
  let age = ry - by;
  if (rm < bm || (rm === bm && rd < bd)) age--;
  return age;
}

/** Meses completos entre duas datas (b - a). */
export function monthsBetween(aISO, bISO) {
  const [ay, am, ad] = parts(aISO);
  const [by, bm, bd] = parts(bISO);
  let n = (by - ay) * 12 + (bm - am);
  if (bd < ad) n--;
  return n;
}

export function addMonths(isoStr, n) {
  const [y, m, d] = parts(isoStr);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return iso(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

export function addDays(isoStr, n) {
  const [y, m, d] = parts(isoStr);
  const t = new Date(Date.UTC(y, m - 1, d) + n * 86400000);
  return parseDate(t);
}

/** Índice absoluto de um período 'AAAA-MM' (para regressões). */
export function periodIndex(p) {
  const [y, m] = p.split('-').map(Number);
  return y * 12 + (m - 1);
}

export function periodFromIndex(i) {
  return `${Math.floor(i / 12)}-${pad((i % 12) + 1)}`;
}

export function formatDate(isoStr) {
  if (!isoStr) return '';
  const [y, m, d] = isoStr.split('-');
  return `${d}/${m}/${y}`;
}

export function formatPeriod(p) {
  if (!p) return '';
  const [y, m] = p.split('-').map(Number);
  return `${MESES[m - 1]} ${y}`;
}
