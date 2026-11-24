// Dados de demonstração inteiramente fictícios (nomes, números e resultados inventados).

import { addDays, addMonths, periodFromIndex, periodIndex } from './dates.js';
import { EXAMPLE_MATRIX, TASK_TYPES } from './defaults.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOMES_F = ['Ana', 'Maria', 'Joana', 'Inês', 'Beatriz', 'Rita', 'Sofia', 'Marta', 'Carla', 'Teresa', 'Helena', 'Luísa', 'Rosa', 'Fernanda', 'Glória'];
const NOMES_M = ['João', 'José', 'António', 'Manuel', 'Pedro', 'Rui', 'Tiago', 'Miguel', 'Carlos', 'Paulo', 'Luís', 'Jorge', 'Fernando', 'Artur', 'Vítor'];
const APELIDOS = ['Silva', 'Santos', 'Ferreira', 'Pereira', 'Oliveira', 'Costa', 'Rodrigues', 'Martins', 'Sousa', 'Fernandes', 'Gonçalves', 'Gomes', 'Lopes', 'Marques', 'Alves', 'Almeida', 'Ribeiro', 'Pinto', 'Carvalho', 'Teixeira'];

export function demoPatients(refISO, n = 1850, seed = 7) {
  const r = rng(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const recent = (months, pOk) => (r() < pOk ? addDays(refISO, -Math.floor(r() * months * 30)) : r() < 0.6 ? addDays(refISO, -Math.floor((months * 30) + r() * 400)) : null);
  const out = [];
  for (let i = 0; i < n; i++) {
    const sexo = r() < 0.52 ? 'F' : 'M';
    const u = r();
    const age = u < 0.07 ? Math.floor(r() * 7) : u < 0.78 ? 7 + Math.floor(r() * 58) : u < 0.9 ? 65 + Math.floor(r() * 10) : 75 + Math.floor(r() * 20);
    const nasc = addDays(addMonths(refISO, -age * 12 - Math.floor(r() * 11) - 1), -Math.floor(r() * 27));
    const problemas = [];
    const pHTA = age < 30 ? 0.01 : age < 50 ? 0.12 : age < 65 ? 0.35 : 0.6;
    const pDM = age < 30 ? 0.003 : age < 50 ? 0.05 : age < 65 ? 0.15 : 0.25;
    if (r() < pHTA) problemas.push('K86');
    if (r() < pDM) problemas.push('T90');
    if (age > 35 && r() < 0.25) problemas.push('T93');
    if (age > 18 && r() < 0.15) problemas.push('T82');
    if (age > 45 && r() < 0.05) problemas.push('R95');
    if (r() < 0.06) problemas.push('R96');
    if (age > 18 && r() < 0.1) problemas.push('P76');
    if (age > 55 && r() < 0.05) problemas.push('K76');
    if (age > 70 && r() < 0.04) problemas.push('K77');
    if (sexo === 'F' && age >= 18 && age <= 42 && r() < 0.02) problemas.push('W78');
    const chronic = problemas.some((p) => ['K86', 'T90'].includes(p));
    const nome = `${sexo === 'F' ? pick(NOMES_F) : pick(NOMES_M)} ${pick(APELIDOS)} ${pick(APELIDOS)}`;
    const ultimaConsulta = r() < 0.08 ? (r() < 0.5 ? null : addDays(refISO, -1100 - Math.floor(r() * 900))) : addDays(refISO, -Math.floor(r() * (chronic ? 200 : 700)));
    out.push({
      id: String(100000000 + Math.floor(r() * 899999999)),
      nome: `${nome} (fictício)`,
      nasc,
      sexo,
      telefone: '9' + String(10000000 + Math.floor(r() * 89999999)),
      problemas,
      ultimaConsulta,
      fields: {
        pa: recent(6, chronic ? 0.72 : 0.3),
        hba1c: recent(6, 0.74),
        pe: recent(12, 0.66),
        microalb: recent(12, 0.6),
        imc: recent(36, 0.62),
        td: recent(120, 0.8),
        ccr: recent(24, 0.5),
        ccu: recent(60, 0.58),
        mamografia: recent(24, 0.64),
      },
    });
  }
  return out;
}

/** Resultados mensais desde janeiro do ano contratual até ao mês anterior ao de referência. */
export function demoIndicatorData(refISO, seed = 11) {
  const r = rng(seed);
  const endIdx = periodIndex(refISO.slice(0, 7)) - 1;
  const startIdx = periodIndex(`${refISO.slice(0, 4)}-01`) - 12;
  const data = {};
  const profile = {
    EX01: [68, 0.6, 520], EX02: [55, 0.4, 380], EX03: [70, 0.5, 210], EX04: [58, 0.9, 210], EX05: [62, 0.3, 210],
    EX06: [47, 0.5, 640], EX07: [57, 0.25, 470], EX08: [66, 0.1, 230], EX09: [83, 0.15, 1350], EX10: [61, 0.5, 1400],
  };
  for (const ind of EXAMPLE_MATRIX) {
    data[ind.code] = {};
    if (ind.code === 'EX11') {
      for (let i = startIdx; i <= endIdx; i++) data[ind.code][periodFromIndex(i)] = { num: 9 + Math.round(r() * 3), den: 1850, value: null };
      continue;
    }
    const [base, slope, den] = profile[ind.code];
    for (let i = startIdx; i <= endIdx; i++) {
      // Muitos indicadores recomeçam a acumular em janeiro: simula essa queda e a recuperação ao longo do ano.
      const m = (i % 12) + 1;
      const v = Math.min(98, base - 14 + m * (1.2 + slope) + (r() - 0.5) * 2.5);
      const d = den + Math.round((r() - 0.5) * 10);
      data[ind.code][periodFromIndex(i)] = { num: Math.round((v / 100) * d), den: d, value: null };
    }
  }
  return data;
}

export function demoAgenda(patients, refISO, seed = 3) {
  const r = rng(seed);
  const items = [];
  const adults = patients.filter((p) => p.nasc && p.nasc < addMonths(refISO, -18 * 12));
  const tipos = ['Hipertensão', 'Diabetes', 'Adultos', 'Adultos', 'Consulta aberta', 'Saúde da mulher'];
  let mins = 9 * 60;
  for (let k = 0; k < 14; k++) {
    const p = adults[Math.floor(r() * adults.length)];
    items.push({ id: p.id, hora: `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`, tipo: tipos[Math.floor(r() * tipos.length)] });
    mins += k === 6 ? 80 : 20;
  }
  return { date: refISO, items };
}

export function demoTasks(patients, refISO, seed = 5) {
  const r = rng(seed);
  const tasks = [];
  for (let k = 0; k < 22; k++) {
    const p = patients[Math.floor(r() * patients.length)];
    const day = addDays(refISO, -Math.floor(r() * 12));
    const type = TASK_TYPES[Math.floor(r() * (TASK_TYPES.length - 1))];
    const st = r();
    tasks.push({
      id: 'demo' + k,
      created: `${day}T${String(8 + Math.floor(r() * 9)).padStart(2, '0')}:00:00`,
      type,
      utente: p.id,
      utenteNome: p.nome,
      desc: type === 'Renovação de receituário' ? 'Renovar medicação crónica' : type === 'Resultado de MCDT' ? 'Ver análises e decidir conduta' : '',
      priority: r() < 0.2 ? 'alta' : 'normal',
      due: addDays(day, 7),
      status: st < 0.45 ? 'pendente' : st < 0.85 ? 'feito' : 'delegado',
      delegatedTo: st >= 0.85 ? 'Enfermeiro(a) de família' : '',
      minutes: Math.round(2 + r() * 12),
      doneAt: st >= 0.45 ? `${addDays(day, 1)}T12:00:00` : null,
    });
  }
  return tasks;
}

