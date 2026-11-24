// Gera o manual em PDF: tira capturas da app (dados fictícios) e converte docs/manual/manual.html em PDF.
// Uso: node scripts/make-manual.mjs   (requer Playwright/Chromium)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMG = path.join(REPO, 'docs', 'manual', 'img');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
fs.mkdirSync(IMG, { recursive: true });

const server = http.createServer((req, res) => {
  const file = path.join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(REPO) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' }).end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const csv = (f) => fs.readFileSync(path.join(REPO, 'exemplos', f), 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/).map((l) => l.split(';'));
const files = { utentes: csv('utentes-exemplo.csv'), agenda: csv('agenda-exemplo.csv'), indicadores: csv('indicadores-exemplo.csv') };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 880 }, deviceScaleFactor: 2, locale: 'pt-PT' });
await page.addInitScript((files) => {
  let stored = null;
  window.api = {
    status: async () => ({ exists: !!stored, unlocked: false }),
    create: async (pw, d) => { stored = d; },
    unlock: async () => stored,
    save: async (d) => { stored = d; },
    lock: async () => {}, changePassword: async () => {}, wipe: async () => {},
    openTable: async (title) => {
      const k = /utentes/i.test(title) ? 'utentes' : /agenda/i.test(title) ? 'agenda' : 'indicadores';
      return { name: `${k}-exemplo.csv`, rows: files[k] };
    },
    saveText: async (o) => o.defaultName, savePDF: async (o) => o.defaultName, print: async () => true,
    exportBackup: async () => null, pickBackup: async () => null, readBackup: async () => ({}),
    info: async () => ({}), openDataDir: async () => {},
  };
}, files);

const hideToast = () => page.addStyleTag({ content: '#toast{display:none!important}' });
const shot = (name, opts = {}) => page.screenshot({ path: path.join(IMG, name + '.png'), ...opts });
const shotEl = async (name, loc, maxH = 820) => {
  const b = await loc.boundingBox();
  await shot(name, { clip: { x: b.x, y: b.y, width: b.width, height: Math.min(b.height, maxH) } });
};
const nav = (re) => page.getByRole('button', { name: re }).click();

await page.goto(base + '/src/renderer/index.html');
await page.getByText('Defina uma palavra-passe').waitFor();
await hideToast();
await shotEl('01-palavra-passe', page.locator('.lock-box'));
await page.locator('input[type=password]').nth(0).fill('segredo123');
await page.locator('input[type=password]').nth(1).fill('segredo123');
await page.getByRole('button', { name: 'Criar e entrar' }).click();
await page.getByRole('button', { name: 'Experimentar com dados de demonstração' }).click();
await page.getByText('IDE projetado').first().waitFor();
await hideToast();
await page.evaluate(() => document.querySelector('.main').scrollTo(0, 0));
await shot('02-inicio');

await nav(/Os meus indicadores/);
await page.locator('tbody tr').first().click();
await page.locator('svg.chart').waitFor();
await shot('03-indicadores');
await shotEl('04-indicador-detalhe', page.locator('.sticky .card'), 1100);
await page.locator('tbody tr').nth(1).locator('input').fill('10');
await shotEl('05-simulador', page.locator('.kpis'));

await nav(/Cuidados em falta/);
await page.getByText('Cumprimento por regra').waitFor();
await shot('06-cuidados');
const listCard = page.locator('.card', { hasText: 'Lista de utentes' });
await listCard.scrollIntoViewIfNeeded();
await page.evaluate(() => document.querySelector('.main').scrollBy(0, -20));
await shotEl('07-cuidados-lista', listCard, 640);

await nav(/Pré-consulta/);
await page.locator('.pc-card').first().waitFor();
await shot('08-preconsulta');

await nav(/Lista e UC/);
await page.getByText('Unidades ponderadas por grupo etário').waitFor();
await shot('09-lista');

await nav(/Tarefas não presenciais/);
await page.getByText('Nova tarefa').waitFor();
await shot('10-tarefas');

await nav(/Importar dados/);
await page.getByText('Como preparar os ficheiros').waitFor();
await shot('11-importar');
await page.locator('.card', { hasText: 'Lista de utentes' }).getByRole('button', { name: 'Importar', exact: true }).click();
await page.getByRole('dialog').waitFor();
await shotEl('12-mapeamento', page.getByRole('dialog'), 1400);
await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();

await nav(/Configuração/);
await page.getByText('Matriz de indicadores').first().waitFor();
await shotEl('13-config-matriz', page.locator('.card', { hasText: 'Matriz de indicadores' }), 900);
const rules = page.locator('.card', { hasText: 'Regras de cuidados' });
await rules.scrollIntoViewIfNeeded();
await shotEl('14-config-regras', rules, 900);

// PDF
const pdfPage = await browser.newPage();
await pdfPage.goto(base + '/docs/manual/manual.html', { waitUntil: 'networkidle' });
await pdfPage.pdf({
  path: path.join(REPO, 'docs', 'Manual-Bussola-MGF.pdf'),
  format: 'A4',
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate: '<div style="width:100%;font:8px Arial,sans-serif;color:#7a8a92;padding:0 16mm;display:flex;justify-content:space-between"><span>Bússola MGF — Manual do utilizador</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
  margin: { top: '16mm', bottom: '16mm', left: '16mm', right: '16mm' },
});
await browser.close();
server.close();
console.log('Manual gerado: docs/Manual-Bussola-MGF.pdf');
