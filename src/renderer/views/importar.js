// Importação de ficheiros (CSV/Excel) com correspondência de colunas, dados de demonstração e cópias de segurança.

import { h, fmt, card, toast, modal, confirmDialog } from '../ui.js';
import { PATIENT_FIELDS, INDICATOR_FIELDS, AGENDA_FIELDS, EXAMPLE_MATRIX } from '../../core/defaults.js';
import { findHeaderRow, guessMapping, rowsToPatients, rowsToIndicatorData, rowsToAgenda } from '../../core/mapping.js';
import { demoPatients, demoIndicatorData, demoAgenda, demoTasks } from '../../core/demo.js';
import { toCSV } from '../../core/csv.js';

/** Janela de correspondência de colunas. Devolve {headerIdx, map} ou null. */
async function mappingDialog(title, file, fields) {
  const rows = file.rows;
  if (!rows.length) {
    toast('O ficheiro está vazio.', 'error');
    return null;
  }
  const headerIdx = findHeaderRow(rows, fields);
  const headers = rows[headerIdx].map((x, i) => String(x || `Coluna ${i + 1}`));
  const map = guessMapping(headers, fields);
  const sels = {};
  const body = h(
    'div',
    null,
    h('p', null, `Ficheiro: `, h('strong', null, file.name), ` — ${rows.length - headerIdx - 1} linhas de dados. Confirme a que coluna corresponde cada campo.`),
    h(
      'div',
      { class: 'table-wrap map-table' },
      h(
        'table',
        null,
        h('thead', null, h('tr', null, h('th', null, 'Campo'), h('th', null, 'Coluna do ficheiro'), h('th', null, 'Exemplo'))),
        h(
          'tbody',
          null,
          fields.map((f) => {
            const ex = h('td', { class: 'small muted' });
            const sel = h(
              'select',
              {
                'aria-label': f.label,
                onchange: () => (ex.textContent = sel.value === '' ? '' : String(rows[headerIdx + 1]?.[+sel.value] ?? '')),
              },
              h('option', { value: '' }, '— não usar —'),
              headers.map((hd, i) => h('option', { value: i, selected: map[f.key] === i }, hd)),
            );
            sels[f.key] = sel;
            ex.textContent = map[f.key] === undefined ? '' : String(rows[headerIdx + 1]?.[map[f.key]] ?? '');
            return h('tr', null, h('td', null, f.label, f.required ? h('span', { style: { color: 'var(--bad)' } }, ' *') : null), h('td', null, sel), ex);
          }),
        ),
      ),
    ),
    h('p', { class: 'small muted', style: { marginTop: '8px' } }, 'As colunas não usadas na lista de utentes ficam guardadas e podem ser usadas em regras próprias (Configuração › Regras).'),
  );
  const ok = await modal(title, body, [{ label: 'Cancelar', value: false }, { label: 'Importar', value: true, kind: 'primary' }], { wide: true });
  if (!ok) return null;
  const out = {};
  for (const [k, sel] of Object.entries(sels)) if (sel.value !== '') out[k] = +sel.value;
  const missing = fields.filter((f) => f.required && out[f.key] === undefined);
  if (missing.length) {
    toast(`Falta indicar: ${missing.map((f) => f.label).join(', ')}.`, 'error');
    return null;
  }
  if (fields === INDICATOR_FIELDS && out.num === undefined && out.value === undefined) {
    toast('Indique a coluna do numerador (com o denominador) ou a do valor.', 'error');
    return null;
  }
  return { headerIdx, map: out, rows };
}

async function openFile(title) {
  try {
    return await window.api.openTable(title);
  } catch (err) {
    toast(err.message, 'error');
    return null;
  }
}

function reportErrors(errors) {
  if (!errors.length) return;
  modal('Linhas ignoradas', h('div', null, h('p', null, `${errors.length} linhas não foram importadas:`), h('ul', { class: 'small' }, errors.slice(0, 30).map((e) => h('li', null, e))), errors.length > 30 ? h('p', { class: 'muted' }, `… e mais ${errors.length - 30}.`) : null));
}

export async function importIndicatorsFlow(app) {
  const file = await openFile('Importar resultados de indicadores');
  if (!file) return;
  const m = await mappingDialog('Importar resultados de indicadores', file, INDICATOR_FIELDS);
  if (!m) return;
  const { data, names, errors } = rowsToIndicatorData(m.rows, m.headerIdx, m.map);
  const codes = Object.keys(data);
  if (!codes.length) return toast('Não foram encontrados resultados válidos.', 'error');
  let added = 0;
  let periods = 0;
  for (const code of codes) {
    app.state.indicatorData[code] ??= {};
    for (const [p, rec] of Object.entries(data[code])) {
      app.state.indicatorData[code][p] = rec;
      periods++;
    }
    if (!app.state.matrix.some((i) => i.code === code)) {
      // Indicador novo: entra com peso 0 até ser configurado.
      app.state.matrix.push({ code, name: names[code] || code, area: 'Por configurar', weight: 0, direction: 'up', unit: '%', mult: 100, aMin: '', eMin: '', eMax: '', aMax: '', enabled: true });
      added++;
    }
  }
  app.save();
  app.render();
  toast(`${periods} resultados importados (${codes.length} indicadores).`);
  if (added) {
    modal('Indicadores novos', h('p', null, `${added} indicador(es) não estavam na matriz e foram acrescentados com peso 0. Defina o peso e os limiares em «Configuração › Matriz de indicadores» para entrarem no IDE.`));
  }
  reportErrors(errors);
}

export async function importPatientsFlow(app) {
  const file = await openFile('Importar lista de utentes');
  if (!file) return;
  const m = await mappingDialog('Importar lista de utentes', file, PATIENT_FIELDS);
  if (!m) return;
  const { patients, errors } = rowsToPatients(m.rows, m.headerIdx, m.map);
  if (!patients.length) return toast('Não foram encontrados utentes válidos.', 'error');
  if (app.state.patients.length && !(await confirmDialog('Substituir lista', `A lista atual (${app.state.patients.length} utentes) vai ser substituída por ${patients.length} utentes. Os registos marcados como feitos e os contactos mantêm-se para os mesmos números de utente.`, 'Substituir'))) return;
  const ids = new Set(patients.map((p) => p.id));
  app.state.patients = patients;
  app.state.patientsImportedAt = app.ref;
  for (const k of Object.keys(app.state.done)) if (!ids.has(k)) delete app.state.done[k];
  for (const k of Object.keys(app.state.contacts)) if (!ids.has(k)) delete app.state.contacts[k];
  app.save();
  app.render();
  toast(`${patients.length} utentes importados.`);
  reportErrors(errors);
}

export async function importAgendaFlow(app) {
  const file = await openFile('Importar agenda do dia');
  if (!file) return;
  const m = await mappingDialog('Importar agenda do dia', file, AGENDA_FIELDS);
  if (!m) return;
  const items = rowsToAgenda(m.rows, m.headerIdx, m.map);
  if (!items.length) return toast('Não foram encontrados utentes na agenda.', 'error');
  items.sort((a, b) => (a.hora || '99').localeCompare(b.hora || '99'));
  app.state.agenda = { date: app.ref, items };
  app.save();
  app.go('preconsulta');
  toast(`${items.length} consultas importadas para hoje.`);
}

export async function loadDemo(app) {
  const hasData = app.state.patients.length || Object.keys(app.state.indicatorData).length || app.state.tasks.length;
  if (hasData && !(await confirmDialog('Dados de demonstração', 'Os dados atuais (utentes, resultados, agenda e tarefas) vão ser substituídos por dados fictícios.', 'Substituir', true))) return;
  const ref = app.ref;
  const patients = demoPatients(ref);
  app.state.patients = patients;
  app.state.patientsImportedAt = ref;
  app.state.indicatorData = demoIndicatorData(ref);
  app.state.matrix = EXAMPLE_MATRIX.map((i) => ({ ...i, enabled: true }));
  app.state.settings.anoContratual = +ref.slice(0, 4);
  app.state.agenda = demoAgenda(patients, ref);
  app.state.tasks = demoTasks(patients, ref);
  app.state.done = {};
  app.state.contacts = {};
  app.ui.period = null;
  app.save();
  app.go('inicio');
  toast('Dados de demonstração carregados (fictícios).');
}

function templateCSV(fields, sample) {
  return toCSV(sample, fields.map((f) => ({ key: f.key, label: f.label.replace(/ \(.*\)$/, '') })));
}

async function saveTemplate(kind) {
  const t = {
    utentes: [PATIENT_FIELDS, [{ id: '123456789', nome: 'Exemplo Fictício', nasc: '15/03/1958', sexo: 'F', telefone: '910000000', problemas: 'K86 T90', ultimaConsulta: '10/09/2026', pa: '10/09/2026', hba1c: '02/05/2026', pe: '', microalb: '02/05/2026', imc: '10/09/2026', td: '01/02/2019', ccr: '', ccu: '', mamografia: '20/11/2024' }]],
    indicadores: [INDICATOR_FIELDS, [{ code: 'EX01', name: 'Hipertensos com PA registada', period: '10/2026', num: 412, den: 520, value: '' }]],
    agenda: [AGENDA_FIELDS, [{ hora: '09:00', id: '123456789', tipo: 'Diabetes' }]],
  }[kind];
  const n = await window.api.saveText({ defaultName: `modelo-${kind}.csv`, content: templateCSV(t[0], t[1]) });
  if (n) toast(`Modelo gravado: ${n}`);
}

async function restoreBackup(app) {
  const file = await window.api.pickBackup();
  if (!file) return;
  const pw = h('input', { type: 'password', 'aria-label': 'Palavra-passe da cópia' });
  const password = await modal('Restaurar cópia de segurança', h('div', null, h('p', null, 'Introduza a palavra-passe com que a cópia foi feita. Os dados atuais serão substituídos.'), h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Palavra-passe da cópia'), pw)), [
    { label: 'Cancelar', value: null },
    { label: 'Restaurar', value: () => pw.value, kind: 'danger' },
  ]);
  if (!password) return;
  try {
    const data = await window.api.readBackup(file, password);
    app.state = { ...app.state, ...data, settings: { ...app.state.settings, ...data.settings } };
    app.save();
    app.go('inicio');
    toast('Cópia restaurada. Os dados ficam cifrados com a palavra-passe atual.');
  } catch (err) {
    toast(err.message, 'error');
  }
}

export function render(app) {
  const st = app.state;
  const nInd = Object.keys(st.indicatorData).length;
  const periods = new Set(Object.values(st.indicatorData).flatMap((s) => Object.keys(s)));
  return h(
    'div',
    { class: 'page' },
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Importar dados'), h('p', null, 'Ficheiros CSV ou Excel (.xlsx). Os dados ficam só neste computador, cifrados.'))),
    h(
      'div',
      { class: 'grid c3' },
      card(
        'Resultados de indicadores',
        h('p', null, 'Exportação do BI-CSP ou do MIM@UF num formato em tabela: uma linha por indicador e mês, com código, período, numerador e denominador (ou valor).'),
        h('p', { class: 'small muted' }, nInd ? `${nInd} indicadores · ${periods.size} meses carregados.` : 'Sem dados.'),
        h('div', { class: 'toolbar' }, h('button', { class: 'btn primary', onclick: () => importIndicatorsFlow(app) }, 'Importar'), h('button', { class: 'btn', onclick: () => saveTemplate('indicadores') }, 'Modelo CSV')),
      ),
      card(
        'Lista de utentes',
        h('p', null, 'Uma linha por utente: n.º, data de nascimento, sexo, problemas ICPC-2 e as datas do último registo de cada cuidado (PA, HbA1c, pé diabético, rastreios, vacinas…).'),
        h('p', { class: 'small muted' }, st.patients.length ? `${st.patients.length} utentes · importada em ${fmt.date(st.patientsImportedAt)}.` : 'Sem dados.'),
        h('div', { class: 'toolbar' }, h('button', { class: 'btn primary', onclick: () => importPatientsFlow(app) }, 'Importar'), h('button', { class: 'btn', onclick: () => saveTemplate('utentes') }, 'Modelo CSV')),
      ),
      card(
        'Agenda do dia',
        h('p', null, 'Hora e n.º de utente das consultas de hoje, para a pré-consulta. Também pode adicionar utentes um a um na própria página.'),
        h('p', { class: 'small muted' }, st.agenda?.date ? `Última agenda: ${fmt.date(st.agenda.date)} (${st.agenda.items.length} consultas).` : 'Sem dados.'),
        h('div', { class: 'toolbar' }, h('button', { class: 'btn primary', onclick: () => importAgendaFlow(app) }, 'Importar'), h('button', { class: 'btn', onclick: () => saveTemplate('agenda') }, 'Modelo CSV')),
      ),
    ),
    card(
      'Como preparar os ficheiros',
      h(
        'ol',
        { class: 'steps' },
        h('li', null, 'Exporte os dados do BI-CSP/MIM@UF ou de uma listagem do SClínico para Excel ou CSV.'),
        h('li', null, 'Se necessário, ajuste o ficheiro ao «Modelo CSV» (os nomes das colunas não precisam de ser iguais: a app pergunta a correspondência).'),
        h('li', null, 'Importe. Datas em dd/mm/aaaa ou aaaa-mm-dd; períodos como 10/2026, 2026-10 ou «out 2026».'),
        h('li', null, 'Apague os ficheiros exportados depois de importar: a cópia da app fica cifrada; o ficheiro original não.'),
      ),
    ),
    h(
      'div',
      { class: 'grid c2' },
      card('Experimentar', h('p', null, 'Carrega uma lista de 1850 utentes, resultados mensais desde janeiro do ano anterior, uma agenda e tarefas — tudo fictício — para explorar a app.'), h('button', { class: 'btn', onclick: () => loadDemo(app) }, 'Carregar dados de demonstração')),
      card(
        'Cópia de segurança',
        h('p', null, 'A cópia é um ficheiro cifrado (.bmgf) que só abre com a palavra-passe com que foi feita. Guarde-a numa pen ou pasta segura.'),
        h(
          'div',
          { class: 'toolbar' },
          h(
            'button',
            {
              class: 'btn',
              onclick: async () => {
                await app.flush();
                const n = await window.api.exportBackup();
                if (n) toast(`Cópia gravada: ${n}`);
              },
            },
            'Exportar cópia cifrada',
          ),
          h('button', { class: 'btn', onclick: () => restoreBackup(app) }, 'Restaurar cópia'),
        ),
      ),
    ),
  );
}
