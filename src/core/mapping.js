// Correspondência entre colunas de um ficheiro importado e os campos da app.

import { parseDate, parsePeriod } from './dates.js';
import { splitCodes } from './rules.js';

export function normHeader(h) {
  return String(h ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Encontra a linha de cabeçalho: a primeira, nas 15 iniciais, com mais correspondências a sinónimos. */
export function findHeaderRow(rows, fields) {
  let best = 0;
  let bestScore = -1;
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const norm = rows[i].map(normHeader);
    const score = fields.filter((f) => f.synonyms.some((s) => norm.includes(s))).length;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  }
  return best;
}

/** Sugere {campo: índice da coluna} com base nos sinónimos. */
export function guessMapping(headers, fields) {
  const norm = headers.map(normHeader);
  const used = new Set();
  const map = {};
  for (const f of fields) {
    let idx = -1;
    // O próprio rótulo do campo também é reconhecido (p.ex. «Última HbA1c»).
    const syns = [...f.synonyms, normHeader(f.label)];
    for (const s of syns) {
      idx = norm.findIndex((h, i) => h === s && !used.has(i));
      if (idx >= 0) break;
    }
    if (idx < 0) {
      for (const s of syns) {
        if (s.length < 3) continue;
        idx = norm.findIndex((h, i) => h.includes(s) && !used.has(i));
        if (idx >= 0) break;
      }
    }
    if (idx >= 0) {
      map[f.key] = idx;
      used.add(idx);
    }
  }
  return map;
}

export function parseNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  let s = String(v).trim().replace(/\s|%|‰/g, '');
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) {
    // 1.234,5 (PT) ou 1,234.5 (EN)
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else s = s.replace(',', '.');
  const n = Number(s);
  return isFinite(n) ? n : null;
}

// Em colunas não mapeadas só converte em data o que parece mesmo uma data (evita transformar «5» numa data).
function dateOrRaw(v) {
  if (v instanceof Date) return parseDate(v);
  if (v === '' || v === undefined) return null;
  if (typeof v === 'string' && /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/.test(v.trim())) return parseDate(v) ?? v;
  return v;
}

function normSex(v) {
  const s = normHeader(v);
  if (['f', 'fem', 'feminino', 'mulher', '2'].includes(s)) return 'F';
  if (['m', 'masc', 'masculino', 'homem', '1'].includes(s)) return 'M';
  return '';
}

/** Converte linhas em utentes. Colunas não mapeadas ficam guardadas em fields (chave normalizada). */
export function rowsToPatients(rows, headerIdx, map) {
  const headers = rows[headerIdx];
  const mappedIdx = new Set(Object.values(map));
  const out = [];
  const errors = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const get = (k) => (map[k] === undefined ? null : row[map[k]]);
    const id = String(get('id') ?? '').trim();
    if (!id) {
      errors.push(`Linha ${r + 1}: sem número de utente.`);
      continue;
    }
    const fields = {};
    for (const [k, idx] of Object.entries(map)) {
      if (['id', 'nome', 'nasc', 'sexo', 'telefone', 'problemas', 'ultimaConsulta'].includes(k)) continue;
      fields[k] = parseDate(row[idx]);
    }
    headers.forEach((h, i) => {
      if (mappedIdx.has(i)) return;
      const key = normHeader(h);
      if (key && !(key in fields)) fields[key] = dateOrRaw(row[i]);
    });
    out.push({
      id,
      nome: String(get('nome') ?? '').trim(),
      nasc: parseDate(get('nasc')),
      sexo: normSex(get('sexo')),
      telefone: String(get('telefone') ?? '').trim(),
      problemas: splitCodes(get('problemas')),
      ultimaConsulta: parseDate(get('ultimaConsulta')),
      fields,
    });
  }
  return { patients: out, errors };
}

/** Converte linhas em resultados de indicadores: {code: {period: {num, den, value}}} */
export function rowsToIndicatorData(rows, headerIdx, map) {
  const data = {};
  const names = {};
  const errors = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const get = (k) => (map[k] === undefined ? null : row[map[k]]);
    const code = String(get('code') ?? '').trim();
    const period = parsePeriod(get('period'));
    if (!code) continue;
    if (!period) {
      errors.push(`Linha ${r + 1}: período inválido («${get('period') ?? ''}»).`);
      continue;
    }
    const rec = { num: parseNumber(get('num')), den: parseNumber(get('den')), value: parseNumber(get('value')) };
    if (rec.num === null && rec.value === null) {
      errors.push(`Linha ${r + 1}: sem numerador nem valor.`);
      continue;
    }
    data[code] ??= {};
    data[code][period] = rec;
    const name = String(get('name') ?? '').trim();
    if (name) names[code] = name;
  }
  return { data, names, errors };
}

export function rowsToAgenda(rows, headerIdx, map) {
  const items = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const get = (k) => (map[k] === undefined ? null : row[map[k]]);
    const id = String(get('id') ?? '').trim();
    if (!id) continue;
    let hora = get('hora');
    if (typeof hora === 'number' && hora < 1) {
      const mins = Math.round(hora * 1440);
      hora = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
    }
    items.push({ id, hora: String(hora ?? '').trim().slice(0, 5), tipo: String(get('tipo') ?? '').trim() });
  }
  return items;
}
