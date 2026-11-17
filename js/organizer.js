// OtoDita — organizador por regras (funciona sem IA, 100% local e instantâneo)
import { SECTIONS, SECTION_BY_ID, PLAN_VERBS, NORMAL_WORDS, normalize, capitalizeFirst } from './orl.js';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Pré-compila expressões de palavras-chave (sem acentos, minúsculas)
const KW = SECTIONS.map((s) => ({
  id: s.id,
  group: s.group,
  res: s.keywords.map((k) => {
    const kk = normalize(k);
    const end = kk.length <= 3 || kk.endsWith(' ') ? '(?![a-z0-9])' : '';
    return { len: kk.trim().length, re: new RegExp('(?<![a-z0-9])' + esc(kk.trim()) + end) };
  }),
}));

const TRIGGERS = SECTIONS.flatMap((s) => s.triggers.map((t) => ({ id: s.id, keep: t.startsWith('+'), t: normalize(t.replace(/^\+/, '')) })))
  .sort((a, b) => b.t.length - a.t.length);

const PLAN_RES = PLAN_VERBS.map((v) => new RegExp('(?<![a-z0-9])' + esc(normalize(v).trim())));
const NORMAL_SET = new Set(NORMAL_WORDS.map(normalize));

export function emptyNote() {
  return Object.fromEntries(SECTIONS.map((s) => [s.id, '']));
}

/** Divide texto em frases (mantendo a pontuação). */
export function splitSentences(text) {
  return (text || '')
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s && !/^[.,;:!?\-\s]+$/.test(s));
}

/** Deteta um cabeçalho de secção no início da frase. Devolve {id, rest} ou null. */
export function detectHeading(sentence) {
  const n = normalize(sentence);
  for (const { id, t, keep } of TRIGGERS) {
    if (n.startsWith(t)) {
      const next = n.charAt(t.length);
      if (next === '' || /[\s:,.;\-]/.test(next)) {
        if (keep && next !== ':') return { id, rest: sentence.trim() };
        let rest = sentence.slice(t.length);
        rest = rest.replace(/^[\s:,.;\-–]+/, '');
        rest = rest.replace(/^(?:de|do|da|dos|das|com|mostra|revela|revelou|evidencia|:)\s+/i, '');
        return { id, rest };
      }
    }
  }
  return null;
}

/** Classifica uma frase por palavras-chave. */
export function classify(sentence) {
  const n = ' ' + normalize(sentence) + ' ';
  const scores = {};
  const hits = {};
  for (const s of KW) {
    for (const k of s.res) {
      if (k.re.test(n)) {
        scores[s.id] = (scores[s.id] || 0) + k.len;
        hits[s.id] = (hits[s.id] || 0) + 1;
      }
    }
  }
  // Pedidos / prescrições têm prioridade (ex.: "pedir audiograma" é plano, não resultado)
  const isHabitual = /habitual/.test(n);
  if (!isHabitual && PLAN_RES.some((re) => re.test(n))) {
    scores.plano = (scores.plano || 0) + 100;
    hits.plano = Math.max(hits.plano || 0, 2);
  }
  let best = null;
  for (const id of Object.keys(scores)) if (!best || scores[id] > scores[best]) best = id;
  return { best, scores, hits };
}

function isNormalPhrase(text) {
  const n = normalize(text).replace(/[.,;:!\s]+$/g, '').replace(/\s+/g, ' ').trim();
  if (NORMAL_SET.has(n)) return true;
  const m = n.match(/^(.*?)(?:\s+(?:bilateralmente|bilateral|a direita e a esquerda))?$/);
  return m ? NORMAL_SET.has(m[1]) : false;
}

function append(note, id, text) {
  const t = text.trim();
  if (!t) return;
  note[id] = note[id] ? note[id] + ' ' + t : t;
}

function ensurePeriod(t) {
  return /[.!?:;)]$/.test(t) ? t : t + '.';
}

/**
 * Organiza um ditado livre em secções do registo ORL.
 * @param {string} text  texto ditado
 * @param {{expandNormal?: boolean}} opts
 */
export function organize(text, opts = {}) {
  const expandNormal = opts.expandNormal !== false;
  const note = emptyNote();
  let current = 'hda';
  let explicit = false;

  for (const raw of splitSentences(text)) {
    let sentence = raw;
    const h = detectHeading(sentence);
    if (h) {
      current = h.id;
      explicit = true;
      let rest = h.rest;
      if (expandNormal && SECTION_BY_ID[h.id].macro && rest && isNormalPhrase(rest)) {
        rest = SECTION_BY_ID[h.id].macro;
      }
      if (rest) append(note, current, ensurePeriod(capitalizeFirst(rest)));
      continue;
    }

    const { best, scores, hits } = classify(sentence);
    if (best && best !== current) {
      if (!explicit) {
        current = best;
      } else if (!scores[current]) {
        const sameGroup = SECTION_BY_ID[best].group === SECTION_BY_ID[current].group;
        if (sameGroup || hits[best] >= 2) current = best;
      }
    }
    append(note, current, ensurePeriod(capitalizeFirst(sentence)));
  }
  return note;
}

/** Junta duas notas (b sobrepõe-se a campos vazios de a). */
export function mergeNotes(a, b) {
  const out = emptyNote();
  for (const id of Object.keys(out)) out[id] = (b[id] || a[id] || '').trim();
  return out;
}
