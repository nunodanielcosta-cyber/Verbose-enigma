// Cálculo de valor, pontuação, IDE estimado, distância à meta, projeção e simulação.
// Estas contas são uma estimativa de apoio: prevalecem sempre os valores oficiais (BI-CSP / MIM@UF).

import { periodIndex } from './dates.js';

const num = (v) => (v === null || v === undefined || v === '' || !isFinite(+v) ? null : +v);

function bounds(ind) {
  return {
    aMin: num(ind.aMin) ?? -Infinity,
    eMin: num(ind.eMin) ?? -Infinity,
    eMax: num(ind.eMax) ?? Infinity,
    aMax: num(ind.aMax) ?? Infinity,
  };
}

export function multOf(ind) {
  return num(ind.mult) ?? 100;
}

/** Valor do indicador num registo {num, den, value}. Usa numerador/denominador quando existem. */
export function valueOf(rec, ind) {
  if (!rec) return null;
  const n = num(rec.num);
  const d = num(rec.den);
  if (n !== null && d !== null && d > 0) return (n / d) * multOf(ind);
  return num(rec.value);
}

export function status(value, ind) {
  if (value === null || value === undefined) return 'sem-dados';
  const b = bounds(ind);
  if (value >= b.eMin && value <= b.eMax) return 'esperado';
  if (value >= b.aMin && value <= b.aMax) return 'aceitavel';
  return 'fora';
}

/**
 * Pontuação 0..1.
 *  - 'linear': 1 no intervalo esperado; entre o limite aceitável e o esperado sobe linearmente de 0 a 1; 0 fora do aceitável.
 *  - 'escalao': 1 no esperado, 0,5 no aceitável, 0 fora.
 */
export function score(value, ind, mode = 'linear') {
  const st = status(value, ind);
  if (st === 'esperado') return 1;
  if (st !== 'aceitavel') return 0;
  if (mode === 'escalao') return 0.5;
  const b = bounds(ind);
  if (value < b.eMin) {
    if (!isFinite(b.aMin) || b.eMin <= b.aMin) return 0;
    return (value - b.aMin) / (b.eMin - b.aMin);
  }
  if (!isFinite(b.aMax) || b.aMax <= b.eMax) return 0;
  return (b.aMax - value) / (b.aMax - b.eMax);
}

export function activeIndicators(matrix) {
  return matrix.filter((i) => i.enabled !== false && (num(i.weight) ?? 0) > 0);
}

/** Último registo disponível até ao período indicado (inclusive). */
export function latestRecord(series, period) {
  if (!series) return null;
  const ps = Object.keys(series)
    .filter((p) => !period || p <= period)
    .sort();
  if (!ps.length) return null;
  const p = ps[ps.length - 1];
  return { period: p, ...series[p] };
}

/** Todos os períodos com dados, ordenados. */
export function allPeriods(data) {
  const set = new Set();
  for (const s of Object.values(data || {})) for (const p of Object.keys(s)) set.add(p);
  return [...set].sort();
}

/** Registos de referência de cada indicador num período (usa o último disponível). */
export function recordsAt(matrix, data, period) {
  const out = {};
  for (const ind of matrix) out[ind.code] = latestRecord(data?.[ind.code], period);
  return out;
}

/**
 * IDE estimado (0..100) = soma(peso × pontuação) / soma(pesos dos indicadores com dados) × 100.
 * recs: {code: {num, den, value}}
 */
export function computeIDE(matrix, recs, mode = 'linear') {
  let wsum = 0;
  let acc = 0;
  const detail = [];
  const missing = [];
  for (const ind of activeIndicators(matrix)) {
    const v = valueOf(recs[ind.code], ind);
    if (v === null) {
      missing.push(ind.code);
      continue;
    }
    const w = +ind.weight;
    const s = score(v, ind, mode);
    wsum += w;
    acc += w * s;
    detail.push({ code: ind.code, value: v, score: s, weight: w });
  }
  return { ide: wsum > 0 ? (acc / wsum) * 100 : null, detail, missing, weight: wsum };
}

/** Valor-alvo: limite inferior do esperado (sobe = melhor) ou superior (desce = melhor). */
export function targetValue(ind) {
  const b = bounds(ind);
  return ind.direction === 'down' ? b.eMax : b.eMin;
}

function patientsTo(rec, ind, target, dirDown) {
  const n = num(rec?.num);
  const d = num(rec?.den);
  if (n === null || d === null || d <= 0 || !isFinite(target)) return null;
  const m = multOf(ind);
  if (dirDown) {
    const maxNum = Math.floor((target * d) / m + 1e-9);
    return Math.max(0, n - maxNum);
  }
  const minNum = Math.ceil((target * d) / m - 1e-9);
  return Math.max(0, minNum - n);
}

/**
 * Quantos utentes faltam (cumpridores a mais, ou casos a menos se "menor é melhor")
 * para chegar ao intervalo esperado e ao aceitável. null se não houver numerador/denominador.
 */
export function gapPatients(rec, ind) {
  const b = bounds(ind);
  const down = ind.direction === 'down';
  return {
    toEsperado: patientsTo(rec, ind, down ? b.eMax : b.eMin, down),
    toAceitavel: patientsTo(rec, ind, down ? b.aMax : b.aMin, down),
  };
}

/**
 * Projeção linear (mínimos quadrados) do valor no período final, com os últimos `window` meses.
 * `from` limita aos meses do ano contratual (muitos indicadores recomeçam a contar em janeiro).
 * series: {period: rec}. Devolve null com menos de 2 pontos.
 */
export function project(series, ind, endPeriod, { window = 6, upTo = null, from = null } = {}) {
  const pts = Object.keys(series || {})
    .filter((p) => (!upTo || p <= upTo) && (!from || p >= from))
    .sort()
    .map((p) => ({ x: periodIndex(p), y: valueOf(series[p], ind), p }))
    .filter((q) => q.y !== null)
    .slice(-window);
  if (pts.length < 2) return null;
  const n = pts.length;
  const mx = pts.reduce((a, q) => a + q.x, 0) / n;
  const my = pts.reduce((a, q) => a + q.y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (const q of pts) {
    sxy += (q.x - mx) * (q.y - my);
    sxx += (q.x - mx) ** 2;
  }
  const slope = sxx ? sxy / sxx : 0;
  const last = pts[n - 1];
  const endX = periodIndex(endPeriod);
  let predicted = my + slope * (endX - mx);
  predicted = Math.max(0, predicted);
  if ((ind.unit ?? '%') === '%') predicted = Math.min(multOf(ind), predicted);
  return { predicted, slope, n, from: pts[0].p, lastPeriod: last.p, monthsLeft: Math.max(0, endX - last.x) };
}

/** Aplica k utentes a mais (ou a menos, se "menor é melhor") a um registo. */
export function applyExtra(rec, ind, k) {
  if (!rec || !k) return rec;
  const n = num(rec.num);
  const d = num(rec.den);
  if (n === null || d === null) return rec;
  const delta = ind.direction === 'down' ? -k : k;
  return { ...rec, num: Math.min(d, Math.max(0, n + delta)) };
}

/** IDE com utentes extra por indicador: extra = {code: k}. */
export function simulateIDE(matrix, recs, extra, mode = 'linear') {
  const sim = {};
  for (const ind of matrix) sim[ind.code] = applyExtra(recs[ind.code], ind, +(extra?.[ind.code] || 0));
  return computeIDE(matrix, sim, mode);
}

/**
 * Ganho de IDE por utente ao fechar a distância até ao intervalo esperado.
 * Útil para ordenar o esforço: indicadores com mais pontos por utente primeiro.
 */
export function gainPerPatient(matrix, recs, code, mode = 'linear') {
  const ind = matrix.find((i) => i.code === code);
  if (!ind || ind.enabled === false || !(+ind.weight > 0)) return { gap: null, delta: 0, perPatient: 0 };
  const rec = recs[code];
  const gap = gapPatients(rec, ind).toEsperado;
  if (!gap) return { gap, delta: 0, perPatient: 0 };
  const base = computeIDE(matrix, recs, mode).ide ?? 0;
  const after = simulateIDE(matrix, recs, { [code]: gap }, mode).ide ?? 0;
  const delta = after - base;
  return { gap, delta, perPatient: delta / gap };
}
