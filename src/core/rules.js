// Avaliação de utentes face às regras de cuidados (lista de cuidados em falta e pré-consulta).

import { ageAt, monthsBetween, parseDate } from './dates.js';

export function splitCodes(s) {
  if (Array.isArray(s)) return s.map((x) => String(x).trim().toUpperCase()).filter(Boolean);
  return String(s || '')
    .split(/[\s,;|]+/)
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
}

/** O utente tem algum dos códigos? Faz correspondência por prefixo (T90 cobre T90.1). */
export function hasAnyProblem(patient, codes) {
  const list = splitCodes(codes);
  if (!list.length) return true;
  const probs = patient.problemas || [];
  return probs.some((p) => list.some((c) => p === c || p.startsWith(c)));
}

export function isEligible(patient, rule, refISO) {
  if (rule.enabled === false) return false;
  const age = ageAt(patient.nasc, refISO);
  const min = rule.ageMin === '' || rule.ageMin == null ? null : +rule.ageMin;
  const max = rule.ageMax === '' || rule.ageMax == null ? null : +rule.ageMax;
  if ((min !== null || max !== null) && age === null) return false;
  if (min !== null && age < min) return false;
  if (max !== null && age > max) return false;
  if (rule.sex && patient.sexo && patient.sexo !== rule.sex) return false;
  if (rule.sex && !patient.sexo) return false;
  return hasAnyProblem(patient, rule.problems);
}

function maxDate(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return a > b ? a : b;
}

/**
 * Avalia todas as regras aplicáveis a um utente.
 * done = {ruleId: 'AAAA-MM-DD'} marcado na app (prevalece até à próxima importação, se mais recente).
 */
export function evaluatePatient(patient, rules, refISO, done = {}) {
  const out = [];
  for (const rule of rules) {
    if (!isEligible(patient, rule, refISO)) continue;
    const fromFile = parseDate(patient.fields?.[rule.field]);
    const last = maxDate(fromFile, done?.[rule.id]);
    const months = rule.months === '' || rule.months == null ? null : +rule.months;
    let ok;
    if (!last) ok = false;
    else if (months === null) ok = true;
    else ok = monthsBetween(last, refISO) < months;
    out.push({ rule, ok, last, doneHere: !!done?.[rule.id] && done[rule.id] === last });
  }
  return out;
}

/**
 * Lista de cuidados em falta, ordenada por prioridade.
 * weights = {indicatorCode: peso extra} (p.ex. pontos de IDE por utente × 10).
 */
export function gapList(patients, rules, refISO, doneMap = {}, weights = {}) {
  const rows = [];
  for (const p of patients) {
    const ev = evaluatePatient(p, rules, refISO, doneMap[p.id]);
    const missing = ev.filter((e) => !e.ok);
    if (!missing.length) continue;
    let priority = 0;
    for (const m of missing) priority += 1 + (weights[m.rule.indicator] || 0);
    rows.push({ patient: p, age: ageAt(p.nasc, refISO), missing, eligible: ev.length, priority });
  }
  rows.sort((a, b) => b.priority - a.priority || b.missing.length - a.missing.length || String(a.patient.nome).localeCompare(String(b.patient.nome)));
  return rows;
}

/** Cumprimento por regra na lista importada (taxa local, útil para comparar com o indicador oficial). */
export function ruleSummary(patients, rules, refISO, doneMap = {}) {
  const sum = Object.fromEntries(rules.map((r) => [r.id, { rule: r, eligible: 0, ok: 0 }]));
  for (const p of patients) {
    for (const e of evaluatePatient(p, rules, refISO, doneMap[p.id])) {
      sum[e.rule.id].eligible++;
      if (e.ok) sum[e.rule.id].ok++;
    }
  }
  return Object.values(sum).filter((s) => s.rule.enabled !== false);
}
