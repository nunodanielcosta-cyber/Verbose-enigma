import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDate, parsePeriod, ageAt, monthsBetween, addMonths } from '../src/core/dates.js';
import { valueOf, status, score, computeIDE, gapPatients, project, simulateIDE, gainPerPatient, recordsAt } from '../src/core/indicators.js';
import { evaluatePatient, gapList, isEligible } from '../src/core/rules.js';
import { analyseList, simulateUC } from '../src/core/lista.js';
import { parseCSV, toCSV } from '../src/core/csv.js';
import { guessMapping, findHeaderRow, rowsToPatients, rowsToIndicatorData, parseNumber } from '../src/core/mapping.js';
import { taskStats } from '../src/core/tasks.js';
import { defaultState, PATIENT_FIELDS, INDICATOR_FIELDS, DEFAULT_UC_FACTORS } from '../src/core/defaults.js';
import { demoPatients, demoIndicatorData } from '../src/core/demo.js';

test('datas', () => {
  assert.equal(parseDate('05/03/2024'), '2024-03-05');
  assert.equal(parseDate('2024-3-5'), '2024-03-05');
  assert.equal(parseDate('31/02/2024'), null);
  assert.equal(parseDate(45000), '2023-03-15');
  assert.equal(parseDate(new Date(Date.UTC(2020, 0, 2))), '2020-01-02');
  assert.equal(parsePeriod('03/2026'), '2026-03');
  assert.equal(parsePeriod('202603'), '2026-03');
  assert.equal(parsePeriod('Março de 2026'), '2026-03');
  assert.equal(parsePeriod('set 2025'), '2025-09');
  assert.equal(ageAt('2000-06-15', '2026-06-14'), 25);
  assert.equal(ageAt('2000-06-15', '2026-06-15'), 26);
  assert.equal(monthsBetween('2026-01-31', '2026-07-30'), 5);
  assert.equal(monthsBetween('2026-01-15', '2026-07-15'), 6);
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
});

const ind = { code: 'A', weight: 2, mult: 100, aMin: 50, eMin: 70, eMax: 100, aMax: 100, direction: 'up' };
const down = { code: 'B', weight: 1, mult: 1000, aMin: 0, eMin: 0, eMax: 6, aMax: 9, direction: 'down', unit: '‰' };

test('valor, estado e pontuação', () => {
  assert.equal(valueOf({ num: 60, den: 100 }, ind), 60);
  assert.equal(valueOf({ value: 12.5 }, ind), 12.5);
  assert.equal(status(75, ind), 'esperado');
  assert.equal(status(60, ind), 'aceitavel');
  assert.equal(status(40, ind), 'fora');
  assert.equal(score(60, ind), 0.5);
  assert.equal(score(60, ind, 'escalao'), 0.5);
  assert.equal(score(80, ind), 1);
  assert.equal(score(7.5, down), 0.5);
});

test('IDE, distância à meta e simulação', () => {
  const m = [ind, down];
  const recs = { A: { num: 60, den: 100 }, B: { num: 15, den: 2000 } }; // B = 7,5‰
  const r = computeIDE(m, recs);
  assert.ok(Math.abs(r.ide - 50) < 1e-9);
  assert.deepEqual(gapPatients(recs.A, ind), { toEsperado: 10, toAceitavel: 0 });
  assert.deepEqual(gapPatients(recs.B, down), { toEsperado: 3, toAceitavel: 0 });
  const s = simulateIDE(m, recs, { A: 10 });
  assert.ok(Math.abs(s.ide - (2 * 1 + 1 * 0.5) / 3 * 100) < 1e-9);
  const g = gainPerPatient(m, recs, 'A');
  assert.equal(g.gap, 10);
  assert.ok(g.perPatient > 0);
  const gb = gainPerPatient(m, recs, 'B');
  assert.equal(gb.gap, 3);
  assert.ok(gb.delta > 0);
});

test('projeção linear', () => {
  const series = { '2026-01': { value: 50 }, '2026-02': { value: 52 }, '2026-03': { value: 54 } };
  const p = project(series, { mult: 100 }, '2026-12');
  assert.ok(Math.abs(p.predicted - 72) < 1e-9);
  assert.equal(p.monthsLeft, 9);
  const capped = project({ '2025-12': { value: 10 }, '2026-01': { value: 90 }, '2026-02': { value: 99 } }, { mult: 100 }, '2026-12', { from: '2026-01' });
  assert.equal(capped.predicted, 100);
  assert.equal(project({ '2026-01': { value: 1 } }, {}, '2026-12'), null);
});

test('regras de cuidados', () => {
  const rules = [
    { id: 'r1', name: 'HbA1c', field: 'hba1c', months: 6, problems: 'T90', indicator: 'A' },
    { id: 'r2', name: 'Mamo', field: 'mamo', months: 24, ageMin: 50, ageMax: 69, sex: 'F' },
  ];
  const p = { id: '1', nasc: '1960-01-01', sexo: 'F', problemas: ['T90.1'], fields: { hba1c: '2026-01-10', mamo: '2025-01-01' } };
  const ev = evaluatePatient(p, rules, '2026-11-20');
  assert.equal(ev.length, 2);
  assert.equal(ev.find((e) => e.rule.id === 'r1').ok, false);
  assert.equal(ev.find((e) => e.rule.id === 'r2').ok, true);
  const ev2 = evaluatePatient(p, rules, '2026-11-20', { r1: '2026-11-20' });
  assert.equal(ev2.find((e) => e.rule.id === 'r1').ok, true);
  assert.equal(isEligible({ ...p, sexo: 'M' }, rules[1], '2026-11-20'), false);
  const gl = gapList([p, { id: '2', nasc: '1990-01-01', sexo: 'M', problemas: [], fields: {} }], rules, '2026-11-20', {}, { A: 2 });
  assert.equal(gl.length, 1);
  assert.equal(gl[0].priority, 3);
});

test('lista e unidades ponderadas', () => {
  const ps = [
    { id: '1', nasc: '2023-01-01', sexo: 'F', problemas: [], ultimaConsulta: '2026-01-01' },
    { id: '2', nasc: '1955-01-01', sexo: 'M', problemas: ['K86'], ultimaConsulta: null },
    { id: '3', nasc: '1940-01-01', sexo: 'F', problemas: ['T90'], ultimaConsulta: '2026-05-01' },
    { id: '4', nasc: '1990-01-01', sexo: 'M', problemas: [], ultimaConsulta: '2020-01-01' },
  ];
  const a = analyseList(ps, { factors: DEFAULT_UC_FACTORS, groups: [{ label: 'DM', codes: 'T90' }], refISO: '2026-11-20' });
  assert.equal(a.uc, 1.5 + 2 + 2.5 + 1);
  assert.equal(a.inactive.length, 2);
  assert.equal(a.chronic[0].n, 1);
  assert.equal(simulateUC(a.uc, DEFAULT_UC_FACTORS, [0, 10, 0, 2]), a.uc + 10 + 5);
});

test('CSV e mapeamento', () => {
  const text = '﻿N.º Utente;Nome;Data Nascimento;Sexo;Problemas;HbA1c;Notas\r\n123;"Silva; Ana";01/02/1950;F;T90 K86;10/10/2026;5\n';
  const rows = parseCSV(text);
  assert.equal(rows.length, 2);
  assert.equal(rows[1][1], 'Silva; Ana');
  const hi = findHeaderRow(rows, PATIENT_FIELDS);
  const map = guessMapping(rows[hi], PATIENT_FIELDS);
  assert.equal(map.id, 0);
  assert.equal(map.nasc, 2);
  assert.equal(map.hba1c, 5);
  const { patients } = rowsToPatients(rows, hi, map);
  assert.equal(patients[0].nasc, '1950-02-01');
  assert.deepEqual(patients[0].problemas, ['T90', 'K86']);
  assert.equal(patients[0].fields.hba1c, '2026-10-10');
  assert.equal(patients[0].fields.notas, '5');
  const out = toCSV([{ a: 'x;y', b: 1.5, c: '=SOMA(1)' }], [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }, { key: 'c', label: 'C' }]);
  assert.ok(out.includes('"x;y";1,5;\'=SOMA(1)'));
  assert.equal(parseNumber('1.234,5'), 1234.5);
  assert.equal(parseNumber('72,3%'), 72.3);
  const irows = parseCSV('Código;Período;Numerador;Denominador\nEX01;03/2026;50;100\nEX01;xx;1;2\n');
  const im = guessMapping(irows[0], INDICATOR_FIELDS);
  const r = rowsToIndicatorData(irows, 0, im);
  assert.deepEqual(r.data.EX01['2026-03'], { num: 50, den: 100, value: null });
  assert.equal(r.errors.length, 1);
});

test('tarefas', () => {
  const s = taskStats([
    { created: '2026-11-10T10:00', type: 'X', status: 'feito', minutes: 5 },
    { created: '2026-11-11T10:00', type: 'X', status: 'pendente', minutes: 3 },
    { created: '2026-10-01T10:00', type: 'Y', status: 'pendente', minutes: 3 },
  ], '2026-11-01', '2026-11-30');
  assert.equal(s.count, 2);
  assert.equal(s.minutes, 8);
  assert.equal(s.byType[0].done, 1);
});

test('dados de demonstração coerentes', () => {
  const ref = '2026-11-20';
  const st = defaultState();
  const ps = demoPatients(ref, 500);
  assert.equal(ps.length, 500);
  const data = demoIndicatorData(ref);
  const recs = recordsAt(st.matrix, data, '2026-10');
  const r = computeIDE(st.matrix, recs);
  assert.ok(r.ide > 0 && r.ide <= 100);
  const gl = gapList(ps, st.rules, ref);
  assert.ok(gl.length > 50);
});

test('ficheiros de exemplo são reconhecidos sem ajustes', async () => {
  const fs = await import('node:fs');
  const read = (f) => parseCSV(fs.readFileSync(new URL(`../exemplos/${f}`, import.meta.url), 'utf8'));
  const u = read('utentes-exemplo.csv');
  const um = guessMapping(u[findHeaderRow(u, PATIENT_FIELDS)], PATIENT_FIELDS);
  for (const f of PATIENT_FIELDS) assert.ok(um[f.key] !== undefined, `coluna não reconhecida: ${f.label}`);
  const { patients } = rowsToPatients(u, 0, um);
  assert.equal(patients.length, 300);
  assert.ok(patients.some((p) => p.fields.hba1c));
  const i = read('indicadores-exemplo.csv');
  const im = guessMapping(i[0], INDICATOR_FIELDS);
  assert.equal(im.code, 0);
  assert.equal(im.name, 1);
  const r = rowsToIndicatorData(i, 0, im);
  assert.equal(r.errors.length, 0);
  assert.equal(Object.keys(r.data).length, 11);
});
