// Leitura e escrita de CSV (compatível com o Excel português: separador ';' e BOM UTF-8).

export function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim()) || '';
  const counts = [';', ',', '\t', '|'].map((d) => [d, firstLine.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ';';
}

/** Devolve uma matriz de linhas (arrays de texto). Suporta aspas, aspas duplicadas e quebras de linha dentro de aspas. */
export function parseCSV(text, delimiter) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const d = delimiter || detectDelimiter(text);
  const rows = [];
  let row = [];
  let field = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += c;
    } else if (c === '"' && field === '') q = true;
    else if (c === d) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => String(x).trim() !== ''));
}

function cell(v) {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
  // Evita que o Excel interprete o conteúdo como fórmula.
  if (/^[=+\-@\t\r]/.test(s) && typeof v !== 'number') s = "'" + s;
  if (/[";\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/** columns = [{key, label}] ou [{label, get: (row) => valor}] */
export function toCSV(rows, columns) {
  const lines = [columns.map((c) => cell(c.label)).join(';')];
  for (const r of rows) lines.push(columns.map((c) => cell(c.get ? c.get(r) : r[c.key])).join(';'));
  return '﻿' + lines.join('\r\n') + '\r\n';
}
