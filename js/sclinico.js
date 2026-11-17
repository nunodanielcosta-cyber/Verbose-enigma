// OtoDita — formatação do registo para colar no SClinico (texto simples, sem formatação)
import { GROUPS, SECTIONS } from './orl.js';

const clean = (t) => (t || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

/**
 * Gera blocos de texto para copiar.
 * format 'orl'  → um bloco por secção (Motivo, HDA, …, Exame objetivo com subsecções, …)
 * format 'soap' → quatro blocos S / O / A / P (campos separados do SClinico)
 */
export function buildBlocks(note, opts = {}) {
  const { format = 'orl', upperHeadings = true, includeEmpty = false } = opts;
  const H = (t) => (upperHeadings ? t.toLocaleUpperCase('pt-PT') : t);
  const has = (s) => includeEmpty || clean(note[s.id]);
  const val = (s) => clean(note[s.id]) || '—';

  if (format === 'soap') {
    return GROUPS.map((g) => {
      const secs = SECTIONS.filter((s) => s.group === g.id && has(s));
      const single = secs.length === 1 && (g.id === 'A');
      const text = secs.map((s) => (single ? val(s) : `${s.short}: ${val(s)}`)).join('\n');
      return { key: g.id, title: g.soapTitle, text };
    }).filter((b) => includeEmpty || b.text);
  }

  const blocks = [];
  let examLines = [];
  const flushExam = () => {
    if (examLines.length) blocks.push({ key: 'O', title: H('Exame objetivo'), text: examLines.join('\n') });
    examLines = [];
  };
  for (const s of SECTIONS) {
    if (s.group === 'O' && s.id !== 'complementares') {
      if (has(s)) examLines.push(`${s.short}: ${val(s)}`);
      continue;
    }
    flushExam();
    if (has(s)) blocks.push({ key: s.id, title: H(s.label), text: val(s) });
  }
  flushExam();
  return blocks;
}

export function blocksToText(blocks) {
  return blocks.map((b) => `${b.title}:\n${b.text}`).join('\n\n');
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}
