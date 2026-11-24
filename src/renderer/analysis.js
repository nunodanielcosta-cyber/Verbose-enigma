// Cálculos derivados do estado, partilhados pelas várias vistas.

import { allPeriods, recordsAt, computeIDE, valueOf, status, gapPatients, project, gainPerPatient, simulateIDE } from '../core/indicators.js';
import { gapList, evaluatePatient } from '../core/rules.js';
import { addMonths } from '../core/dates.js';

export function indicatorAnalysis(state, period = null) {
  const { matrix, indicatorData, settings } = state;
  const mode = settings.scoreMode || 'linear';
  const periods = allPeriods(indicatorData);
  const current = period && periods.includes(period) ? period : periods[periods.length - 1] || null;
  const year = +settings.anoContratual || (current ? +current.slice(0, 4) : new Date().getFullYear());
  const endPeriod = `${year}-12`;
  const recs = current ? recordsAt(matrix, indicatorData, current) : {};
  const ide = computeIDE(matrix, recs, mode);
  const rows = matrix
    .filter((i) => i.enabled !== false)
    .map((ind) => {
      const rec = recs[ind.code];
      const value = valueOf(rec, ind);
      const gap = gapPatients(rec, ind);
      const proj = project(indicatorData[ind.code], ind, endPeriod, { window: +settings.projectionWindow || 6, upTo: current, from: `${year}-01` });
      const gain = gainPerPatient(matrix, recs, ind.code, mode);
      const monthsLeft = proj ? proj.monthsLeft : null;
      return {
        ind,
        rec,
        value,
        status: status(value, ind),
        gap,
        proj,
        projStatus: proj ? status(proj.predicted, ind) : 'sem-dados',
        needPerMonth: gap.toEsperado && monthsLeft ? gap.toEsperado / monthsLeft : null,
        gain,
        stale: rec && current && rec.period !== current,
      };
    });
  const projRecs = {};
  for (const r of rows) projRecs[r.ind.code] = r.proj ? { value: r.proj.predicted } : r.rec;
  const projIde = computeIDE(matrix, projRecs, mode);
  return { periods, current, endPeriod, year, recs, ide, projIde, rows, mode };
}

export function simulate(state, analysis, extra) {
  return simulateIDE(state.matrix, analysis.recs, extra, analysis.mode);
}

/** Peso extra de prioridade por indicador: pontos de IDE por utente × 10, só para indicadores abaixo do esperado. */
export function indicatorWeights(analysis) {
  const w = {};
  for (const r of analysis.rows) if (r.gain.perPatient > 0) w[r.ind.code] = r.gain.perPatient * 10;
  return w;
}

export function careGaps(state, ref, analysis) {
  return gapList(state.patients, state.rules, ref, state.done, indicatorWeights(analysis));
}

export function patientIndex(state) {
  const m = new Map();
  for (const p of state.patients) m.set(String(p.id), p);
  return m;
}

export function patientChecklist(state, p, ref) {
  return evaluatePatient(p, state.rules, ref, state.done[p.id]);
}

/** Data de corte para «sem consulta há X meses». */
export function inactiveCutoff(ref, months) {
  return addMonths(ref, -months);
}
