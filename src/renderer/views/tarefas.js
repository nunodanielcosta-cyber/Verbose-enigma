// Ponto 6 — Caixa de tarefas não presenciais: registo, estados, delegação, tempo gasto e estatísticas.

import { h, fmt, kpi, card, table, select, toast, confirmDialog, modal, field } from '../ui.js';
import { TASK_TYPES, DELEGATES } from '../../core/defaults.js';
import { taskStats, taskMinutes, newTaskId } from '../../core/tasks.js';
import { addDays } from '../../core/dates.js';
import { toCSV } from '../../core/csv.js';
import { patientIndex } from '../analysis.js';

const STATUS = [
  ['pendente', 'Pendente'],
  ['feito', 'Feito'],
  ['delegado', 'Delegado'],
];

function nowLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
}

function stopTimer(t) {
  if (t.timerStart) {
    t.minutes = Math.round(taskMinutes(t) * 10) / 10;
    t.timerStart = null;
  }
}

function setStatus(app, t, status, delegatedTo = '') {
  stopTimer(t);
  t.status = status;
  t.delegatedTo = status === 'delegado' ? delegatedTo : '';
  t.doneAt = status === 'pendente' ? null : nowLocal();
  app.save();
  app.render();
}

function newTaskForm(app, idx) {
  const type = select(TASK_TYPES, TASK_TYPES[0], () => {}, { 'aria-label': 'Tipo' });
  const utente = h('input', { type: 'text', placeholder: 'N.º de utente (opcional)', 'aria-label': 'Utente' });
  const desc = h('input', { type: 'text', placeholder: 'ex.: renovar metformina e AAS', 'aria-label': 'Descrição' });
  const prio = select([['normal', 'Normal'], ['alta', 'Alta']], 'normal', () => {}, { 'aria-label': 'Prioridade' });
  const due = h('input', { type: 'date', value: addDays(app.ref, 2), 'aria-label': 'Prazo' });
  const add = () => {
    const id = utente.value.trim();
    const p = id ? idx.get(id) : null;
    app.state.tasks.unshift({
      id: newTaskId(),
      created: nowLocal(),
      type: type.value,
      utente: id,
      utenteNome: p?.nome || '',
      desc: desc.value.trim(),
      priority: prio.value,
      due: due.value || null,
      status: 'pendente',
      delegatedTo: '',
      minutes: 0,
      timerStart: null,
      doneAt: null,
    });
    app.save();
    app.render();
    toast('Tarefa registada.');
  };
  desc.addEventListener('keydown', (e) => e.key === 'Enter' && add());
  return card(
    'Nova tarefa',
    h('div', { class: 'form-row' }, field('Tipo', type), field('Utente', utente), h('label', { class: 'field', style: { flex: '3 1 260px' } }, h('span', { class: 'field-label' }, 'Descrição'), desc), field('Prioridade', prio), field('Prazo', due), h('button', { class: 'btn primary', onclick: add }, 'Adicionar')),
  );
}

async function delegate(app, t) {
  const who = select(DELEGATES, DELEGATES[0], () => {}, { 'aria-label': 'Delegar a' });
  const r = await modal('Delegar tarefa', field('Delegar a', who), [
    { label: 'Cancelar', value: null },
    { label: 'Delegar', value: () => who.value, kind: 'primary' },
  ]);
  if (r) setStatus(app, t, 'delegado', r);
}

function taskRow(app, t) {
  const overdue = t.status === 'pendente' && t.due && t.due < app.ref;
  const mins = taskMinutes(t);
  const minutesInput = h('input', {
    type: 'number',
    min: 0,
    class: 'tiny',
    value: t.timerStart ? '' : Math.round(mins * 10) / 10,
    disabled: !!t.timerStart,
    title: 'Minutos gastos',
    'aria-label': 'Minutos gastos',
    onchange: (e) => {
      t.minutes = Math.max(0, +e.target.value || 0);
      app.save();
    },
  });
  return h(
    'div',
    { class: ['task', t.status !== 'pendente' && 'done'] },
    h(
      'div',
      null,
      h('div', { class: 't-title' }, t.priority === 'alta' ? h('span', { class: 'prio-alta' }, '! ') : null, t.type, t.desc ? ` — ${t.desc}` : ''),
      h(
        'div',
        { class: 't-meta' },
        t.utente ? `${t.utenteNome || 'Utente'} (${t.utente}) · ` : '',
        `criada ${fmt.date(t.created.slice(0, 10))}`,
        t.due ? h('span', { style: overdue ? { color: 'var(--bad)', fontWeight: 600 } : null }, ` · prazo ${fmt.date(t.due)}${overdue ? ' (atrasada)' : ''}`) : '',
        t.status === 'delegado' ? ` · delegada a ${t.delegatedTo}` : '',
        t.status === 'feito' && t.doneAt ? ` · feita ${fmt.date(t.doneAt.slice(0, 10))}` : '',
      ),
    ),
    h(
      'div',
      { class: 't-actions' },
      t.status === 'pendente'
        ? h(
            'button',
            {
              class: ['btn sm', t.timerStart && 'timer-on'],
              title: 'Cronometrar o tempo gasto',
              onclick: () => {
                if (t.timerStart) stopTimer(t);
                else t.timerStart = Date.now();
                app.save();
                app.render();
              },
            },
            t.timerStart ? '■ Parar' : '▶ Cronómetro',
          )
        : null,
      minutesInput,
      h('span', { class: 'small muted' }, 'min'),
      t.status === 'pendente' ? [h('button', { class: 'btn sm primary', onclick: () => setStatus(app, t, 'feito') }, 'Feito'), h('button', { class: 'btn sm', onclick: () => delegate(app, t) }, 'Delegar')] : h('button', { class: 'btn sm', onclick: () => setStatus(app, t, 'pendente') }, 'Reabrir'),
      h(
        'button',
        {
          class: 'btn sm ghost',
          title: 'Apagar',
          'aria-label': 'Apagar tarefa',
          onclick: async () => {
            if (await confirmDialog('Apagar tarefa', 'Apagar esta tarefa definitivamente?', 'Apagar', true)) {
              app.state.tasks = app.state.tasks.filter((x) => x !== t);
              app.save();
              app.render();
            }
          },
        },
        '✕',
      ),
    ),
  );
}

function statsCard(app) {
  const range = app.ui.taskRange || '7';
  const from = range === 'all' ? null : addDays(app.ref, -(+range - 1));
  const s = taskStats(app.state.tasks, from, app.ref);
  return card(
    'Estatísticas (útil para a contratualização e para medir a carga não presencial)',
    h(
      'div',
      { class: 'toolbar', style: { marginBottom: '10px' } },
      select(
        [
          ['7', 'Últimos 7 dias'],
          ['30', 'Últimos 30 dias'],
          ['90', 'Últimos 90 dias'],
          ['all', 'Desde sempre'],
        ],
        range,
        (v) => {
          app.ui.taskRange = v;
          app.render();
        },
        { 'aria-label': 'Período das estatísticas' },
      ),
      h(
        'button',
        {
          class: 'btn',
          onclick: () => {
            const rows = app.state.tasks.filter((t) => !from || t.created.slice(0, 10) >= from);
            const csv = toCSV(rows, [
              { label: 'Criada', get: (t) => t.created.replace('T', ' ').slice(0, 16) },
              { label: 'Tipo', get: (t) => t.type },
              { label: 'N.º utente', get: (t) => t.utente },
              { label: 'Descrição', get: (t) => t.desc },
              { label: 'Estado', get: (t) => t.status },
              { label: 'Delegada a', get: (t) => t.delegatedTo },
              { label: 'Minutos', get: (t) => Math.round(taskMinutes(t) * 10) / 10 },
              { label: 'Concluída', get: (t) => (t.doneAt || '').replace('T', ' ').slice(0, 16) },
            ]);
            window.api.saveText({ defaultName: `tarefas-${app.ref}.csv`, content: csv }).then((n) => n && toast(`Exportado: ${n}`));
          },
        },
        'Exportar CSV',
      ),
    ),
    h('div', { class: 'kpis' }, kpi('Tarefas', fmt.num(s.count)), kpi('Tempo total', `${fmt.num(s.minutes / 60, 1)} h`, `${fmt.num(s.minutes)} min · média ${fmt.num(s.count ? s.minutes / s.count : 0, 1)} min`), kpi('Pendentes', fmt.num(s.pending)), kpi('Delegadas', fmt.num(s.delegated))),
    table(
      [
        { label: 'Tipo', render: (r) => r.type },
        { label: 'N.º', class: 'num', render: (r) => fmt.num(r.count) },
        { label: 'Minutos', class: 'num', render: (r) => fmt.num(r.minutes) },
        { label: 'Média (min)', class: 'num', render: (r) => fmt.num(r.minutes / r.count, 1) },
        { label: 'Feitas', class: 'num', render: (r) => fmt.num(r.done) },
        { label: 'Delegadas', class: 'num', render: (r) => fmt.num(r.delegated) },
      ],
      s.byType,
      { emptyText: 'Sem tarefas neste período.' },
    ),
  );
}

export function render(app) {
  const page = h('div', { class: 'page' });
  const idx = patientIndex(app.state);
  const f = (app.ui.taskFilter ??= { status: 'pendente', type: '' });
  const tasks = app.state.tasks
    .filter((t) => (!f.status || t.status === f.status) && (!f.type || t.type === f.type))
    .sort((a, b) => {
      if (f.status === 'pendente') return (b.priority === 'alta') - (a.priority === 'alta') || String(a.due || '9').localeCompare(String(b.due || '9'));
      return String(b.created).localeCompare(String(a.created));
    });
  page.append(
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Tarefas não presenciais'), h('p', null, 'Renovações, resultados, contactos indiretos e emails num só sítio.'))),
    newTaskForm(app, idx),
    card(
      null,
      h(
        'div',
        { class: 'toolbar', style: { marginBottom: '8px' } },
        select([['', 'Todos os estados'], ...STATUS], f.status, (v) => ((f.status = v), app.render()), { 'aria-label': 'Estado' }),
        select([['', 'Todos os tipos'], ...TASK_TYPES.map((t) => [t, t])], f.type, (v) => ((f.type = v), app.render()), { 'aria-label': 'Tipo' }),
        h('span', { class: 'muted' }, `${tasks.length} tarefas`),
      ),
      tasks.length ? h('div', { class: 'table-wrap' }, tasks.map((t) => taskRow(app, t))) : h('p', { class: 'muted' }, f.status === 'pendente' ? 'Sem tarefas pendentes. 🎉' : 'Sem tarefas.'),
    ),
    statsCard(app),
  );
  return page;
}
