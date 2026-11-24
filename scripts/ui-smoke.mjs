// Teste de fumo da interface num Chromium headless, com a ponte do Electron (window.api) simulada.
// Uso: node scripts/ui-smoke.mjs [pasta-para-capturas]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const OUT = process.argv[2] || null;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' }).end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));

const agendaCSV = 'Hora;N.º Utente;Tipo\n09:00;999;Diabetes\n';
await page.addInitScript((agendaCSV) => {
  let stored = null;
  window.__saved = [];
  window.__files = [];
  window.api = {
    status: async () => ({ exists: !!stored, unlocked: false }),
    create: async (pw, data) => { stored = data; },
    unlock: async () => stored,
    save: async (d) => { stored = d; window.__saved.push(Date.now()); },
    lock: async () => {},
    changePassword: async () => {},
    wipe: async () => {},
    openTable: async () => ({ name: 'agenda.csv', rows: agendaCSV.trim().split('\n').map((l) => l.split(';')) }),
    saveText: async (o) => { window.__files.push(o); return o.defaultName; },
    savePDF: async (o) => o.defaultName,
    print: async () => true,
    exportBackup: async () => 'x.bmgf',
    pickBackup: async () => null,
    readBackup: async () => ({}),
    info: async () => ({ version: 'dev', dataDir: '/tmp' }),
    openDataDir: async () => {},
  };
}, agendaCSV);

const shot = async (name) => OUT && page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: false });
const step = async (name, fn) => {
  try { await fn(); console.log('ok   ', name); }
  catch (e) { console.log('FALHA', name, '-', e.message.split('\n')[0]); errors.push(name + ': ' + e.message.split('\n')[0]); }
};

await page.goto(base + '/renderer/index.html');
await step('ecrã de criação de palavra-passe', async () => {
  await page.getByText('Defina uma palavra-passe').waitFor({ timeout: 5000 });
  await shot('01-palavra-passe');
  await page.locator('input[type=password]').nth(0).fill('segredo123');
  await page.locator('input[type=password]').nth(1).fill('segredo123');
  await page.getByRole('button', { name: 'Criar e entrar' }).click();
  await page.getByRole('heading', { name: 'Olá' }).waitFor();
});
await step('carregar demonstração', async () => {
  await page.getByRole('button', { name: 'Experimentar com dados de demonstração' }).click();
  await page.getByText('IDE projetado').first().waitFor();
  await shot('02-inicio');
});
await step('indicadores + simulação', async () => {
  await page.getByRole('button', { name: /Os meus indicadores/ }).click();
  await page.getByRole('heading', { name: 'Os meus indicadores' }).waitFor();
  const before = await page.locator('.kpi', { hasText: 'IDE simulado' }).locator('.kpi-value').textContent();
  await page.getByRole('button', { name: 'Simular todas as metas' }).click();
  const after = await page.locator('.kpi', { hasText: 'IDE simulado' }).locator('.kpi-value').textContent();
  if (before === after) throw new Error(`simulação não mudou o IDE (${before})`);
  await page.locator('tbody tr').first().click();
  await page.locator('svg.chart').waitFor();
  await shot('03-indicadores');
});
await step('cuidados em falta', async () => {
  await page.getByRole('button', { name: /Cuidados em falta/ }).click();
  await page.getByText('Cumprimento por regra').waitFor();
  const n1 = await page.locator('.kpi', { hasText: 'Cuidados em falta' }).locator('.kpi-value').textContent();
  await page.locator('.pc-item button').first().click();
  const n2 = await page.locator('.kpi', { hasText: 'Cuidados em falta' }).locator('.kpi-value').textContent();
  if (n1 === n2) throw new Error('marcar como feito não reduziu o total');
  await page.getByRole('button', { name: 'Exportar para convocatória' }).click();
  const f = await page.evaluate(() => window.__files.at(-1));
  if (!f || !f.content.includes('Cuidados em falta')) throw new Error('CSV de convocatória não gerado');
  await shot('04-cuidados');
});
await step('pré-consulta', async () => {
  await page.getByRole('button', { name: /Pré-consulta/ }).click();
  await page.locator('.pc-card').first().waitFor();
  const cards = await page.locator('.pc-card').count();
  if (cards < 10) throw new Error('agenda de demonstração incompleta: ' + cards);
  await shot('05-preconsulta');
});
await step('lista e UC', async () => {
  await page.getByRole('button', { name: /Lista e UC/ }).click();
  await page.getByText('Unidades ponderadas por grupo etário').waitFor();
  await page.locator('input[type=number]').nth(1).fill('20');
  const t = await page.getByText('Resultado:').textContent();
  if (!t.includes('+20')) throw new Error('simulador de UC: ' + t);
  await shot('06-lista');
});
await step('tarefas', async () => {
  await page.getByRole('button', { name: /Tarefas não presenciais/ }).click();
  await page.getByLabel('Descrição').fill('Renovar insulina');
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await page.getByText('Renovar insulina').waitFor();
  await page.locator('.task', { hasText: 'Renovar insulina' }).getByRole('button', { name: 'Feito' }).click();
  await page.getByText('Estatísticas').waitFor();
  await shot('07-tarefas');
});
await step('importar agenda (mapeamento)', async () => {
  await page.getByRole('button', { name: /Importar dados/ }).click();
  await page.locator('.card', { hasText: 'Agenda do dia' }).getByRole('button', { name: 'Importar', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  await shot('08-mapeamento');
  await page.getByRole('dialog').getByRole('button', { name: 'Importar' }).click();
  await page.getByText('não está na lista importada').waitFor();
});
await step('configuração', async () => {
  await page.getByRole('button', { name: /Configuração/ }).click();
  await page.getByText('Matriz de indicadores').first().waitFor();
  await shot('09-config');
});
await step('gravação automática', async () => {
  await page.waitForTimeout(600);
  const n = await page.evaluate(() => window.__saved.length);
  if (!n) throw new Error('nada foi gravado');
});

await browser.close();
server.close();
if (errors.length) {
  console.log('\nERROS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('\nTudo OK');
