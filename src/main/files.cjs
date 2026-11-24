// Leitura de ficheiros CSV e Excel para uma matriz de linhas.

const fs = require('node:fs');
const path = require('node:path');

function decodeText(buf) {
  // Ficheiros CSV gravados pelo Excel em Windows costumam vir em Windows-1252.
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

function cellValue(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return cellValue(v.result);
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return cellValue(v.text);
    if ('error' in v) return '';
    return String(v);
  }
  return v;
}

async function readXlsx(file) {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  // Usa a primeira folha com dados.
  const ws = wb.worksheets.find((w) => w.actualRowCount > 0) || wb.worksheets[0];
  if (!ws) return [];
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const vals = [];
    for (let c = 1; c <= ws.columnCount; c++) vals.push(cellValue(row.getCell(c).value));
    rows.push(vals);
  });
  return rows.filter((r) => r.some((x) => String(x).trim() !== ''));
}

async function readTable(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.xlsx' || ext === '.xlsm') return readXlsx(file);
  if (ext === '.xls') throw new Error('O formato .xls antigo não é suportado. No Excel, grave como .xlsx ou CSV.');
  const { parseCSV } = await import('../core/csv.js');
  return parseCSV(decodeText(fs.readFileSync(file)));
}

module.exports = { readTable, decodeText };
