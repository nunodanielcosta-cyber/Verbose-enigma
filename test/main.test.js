import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Store } = require('../src/main/store.cjs');
const { readTable, decodeText } = require('../src/main/files.cjs');
const ExcelJS = require('exceljs');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bussola-'));

test('armazenamento cifrado: criar, gravar, desbloquear, palavra-passe errada', async () => {
  const dir = tmp();
  const st = new Store(dir);
  assert.equal(st.exists(), false);
  await st.create('palavra-passe-1', { patients: [{ nome: 'Ana Fictícia' }] });
  st.save({ patients: [{ nome: 'Ana Fictícia' }, { nome: 'Rui Fictício' }] });
  const raw = fs.readFileSync(path.join(dir, 'dados.bmgf'), 'utf8');
  assert.ok(!raw.includes('Fictícia'), 'o ficheiro não pode conter texto legível');
  st.lock();
  assert.equal(st.unlocked, false);
  assert.throws(() => st.save({}), /bloqueados/);
  await assert.rejects(st.unlock('errada'), /Palavra-passe incorreta/);
  const data = await st.unlock('palavra-passe-1');
  assert.equal(data.patients.length, 2);
  await st.changePassword('palavra-passe-1', 'nova-palavra-2', data);
  st.lock();
  await assert.rejects(st.unlock('palavra-passe-1'), /incorreta/);
  assert.equal((await st.unlock('nova-palavra-2')).patients.length, 2);
  const bak = path.join(dir, 'copia.bmgf');
  st.exportTo(bak);
  assert.equal((await st.readBackup(bak, 'nova-palavra-2')).patients.length, 2);
  st.wipe();
  assert.equal(st.exists(), false);
});

test('leitura de Excel (.xlsx) e CSV em Windows-1252', async () => {
  const dir = tmp();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Lista');
  ws.addRow(['Relatório de utentes']);
  ws.addRow(['N.º Utente', 'Data Nascimento', 'HbA1c']);
  ws.addRow(['123', new Date(Date.UTC(1950, 1, 1)), new Date(Date.UTC(2026, 9, 10))]);
  const xf = path.join(dir, 'l.xlsx');
  await wb.xlsx.writeFile(xf);
  const rows = await readTable(xf);
  assert.equal(rows.length, 3);
  assert.equal(rows[1][0], 'N.º Utente');
  assert.ok(rows[2][1] instanceof Date);

  const cf = path.join(dir, 'l.csv');
  fs.writeFileSync(cf, Buffer.from('N.\xba Utente;Sa\xfade\n1;ok\n', 'latin1'));
  const crow = await readTable(cf);
  assert.equal(crow[0][0], 'N.º Utente');
  assert.equal(crow[0][1], 'Saúde');
  assert.equal(decodeText(Buffer.from('ação', 'utf8')), 'ação');
  await assert.rejects(readTable(path.join(dir, 'x.xls')), /não é suportado/);
});
