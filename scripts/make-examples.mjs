// Gera ficheiros de exemplo (dados fictícios) na pasta exemplos/, no formato que a app importa.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { demoPatients, demoIndicatorData, demoAgenda } from '../src/core/demo.js';
import { EXAMPLE_MATRIX, PATIENT_FIELDS } from '../src/core/defaults.js';
import { toCSV } from '../src/core/csv.js';
import { formatDate } from '../src/core/dates.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'exemplos');
fs.mkdirSync(dir, { recursive: true });
const ref = '2026-11-15';
const patients = demoPatients(ref, 300, 21);
const dateCols = PATIENT_FIELDS.filter((f) => f.date);
fs.writeFileSync(
  path.join(dir, 'utentes-exemplo.csv'),
  toCSV(patients, [
    { label: 'N.º Utente', get: (p) => p.id },
    { label: 'Nome', get: (p) => p.nome },
    { label: 'Data Nascimento', get: (p) => formatDate(p.nasc) },
    { label: 'Sexo', get: (p) => p.sexo },
    { label: 'Telefone', get: (p) => p.telefone },
    { label: 'Problemas', get: (p) => p.problemas.join(' ') },
    { label: 'Última Consulta', get: (p) => formatDate(p.ultimaConsulta) },
    ...dateCols.map((f) => ({ label: f.label, get: (p) => formatDate(p.fields[f.key]) })),
  ]),
);
const data = demoIndicatorData(ref, 11);
const rows = [];
for (const ind of EXAMPLE_MATRIX) for (const [p, r] of Object.entries(data[ind.code])) rows.push({ code: ind.code, name: ind.name, p, ...r });
fs.writeFileSync(
  path.join(dir, 'indicadores-exemplo.csv'),
  toCSV(rows, [
    { label: 'Código', key: 'code' },
    { label: 'Indicador', key: 'name' },
    { label: 'Período', get: (r) => `${r.p.slice(5)}/${r.p.slice(0, 4)}` },
    { label: 'Numerador', key: 'num' },
    { label: 'Denominador', key: 'den' },
  ]),
);
fs.writeFileSync(path.join(dir, 'agenda-exemplo.csv'), toCSV(demoAgenda(patients, ref).items, [{ label: 'Hora', key: 'hora' }, { label: 'N.º Utente', key: 'id' }, { label: 'Tipo', key: 'tipo' }]));
fs.writeFileSync(
  path.join(dir, 'matriz-exemplo.csv'),
  toCSV(EXAMPLE_MATRIX, [
    { label: 'Código', key: 'code' }, { label: 'Nome', key: 'name' }, { label: 'Área', key: 'area' }, { label: 'Peso', key: 'weight' },
    { label: 'Sentido', get: (i) => (i.direction === 'down' ? 'menor' : 'maior') }, { label: 'Unidade', key: 'unit' }, { label: 'Multiplicador', key: 'mult' },
    { label: 'Aceitável mín.', key: 'aMin' }, { label: 'Esperado mín.', key: 'eMin' }, { label: 'Esperado máx.', key: 'eMax' }, { label: 'Aceitável máx.', key: 'aMax' },
  ]),
);
console.log('Exemplos gravados em', dir);
