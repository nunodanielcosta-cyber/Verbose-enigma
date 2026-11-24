// Análise da lista de utentes: unidades ponderadas, pirâmide etária, grupos de risco e utentes sem consulta.

import { ageAt, monthsBetween } from './dates.js';
import { hasAnyProblem } from './rules.js';

export function factorFor(age, factors) {
  if (age === null || age === undefined) return null;
  return factors.find((f) => age >= +f.min && (f.max === null || f.max === '' || age <= +f.max)) || null;
}

export function analyseList(patients, { factors, groups = [], refISO, inactiveMonths = 36 }) {
  const byGroup = factors.map((f) => ({ ...f, n: 0, uc: 0 }));
  const bands = [];
  for (let a = 0; a < 90; a += 5) bands.push({ label: `${a}-${a + 4}`, M: 0, F: 0, O: 0 });
  bands.push({ label: '90+', M: 0, F: 0, O: 0 });
  let uc = 0;
  let unknownAge = 0;
  const inactive = [];
  const chronic = groups.map((g) => ({ ...g, n: 0 }));
  for (const p of patients) {
    const age = ageAt(p.nasc, refISO);
    const f = factorFor(age, factors);
    if (!f) unknownAge++;
    else {
      const g = byGroup[factors.indexOf(f)];
      g.n++;
      g.uc += +f.factor;
      uc += +f.factor;
    }
    if (age !== null && age >= 0) {
      const b = bands[Math.min(18, Math.floor(age / 5))];
      b[p.sexo === 'M' || p.sexo === 'F' ? p.sexo : 'O']++;
    }
    for (const c of chronic) if (c.codes && hasAnyProblem(p, c.codes)) c.n++;
    if (!p.ultimaConsulta || monthsBetween(p.ultimaConsulta, refISO) >= inactiveMonths) inactive.push({ patient: p, age });
  }
  return { total: patients.length, uc, byGroup, bands, chronic, inactive, unknownAge };
}

/** Unidades ponderadas após novas inscrições: additions = [n por grupo, pela ordem dos fatores]. */
export function simulateUC(baseUC, factors, additions) {
  let uc = baseUC;
  factors.forEach((f, i) => {
    uc += (+additions[i] || 0) * +f.factor;
  });
  return uc;
}
