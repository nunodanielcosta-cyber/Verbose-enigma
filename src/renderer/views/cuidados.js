// Ponto 2 — Lista de cuidados em falta, ordenada pelo ganho em indicadores, com exportação para convocatória.

import { h, fmt, kpi, card, table, empty, select, toast, badge, debounce } from '../ui.js';
import { ruleSummary } from '../../core/rules.js';
import { toCSV } from '../../core/csv.js';
import { loadDemo } from './importar.js';

export const CONTACT_STATES = [
  ['', '—'],
  ['convocar', 'A convocar'],
  ['convocado', 'Convocado'],
  ['agendado', 'Agendado'],
  ['sem-contacto', 'Sem contacto'],
  ['recusou', 'Recusou'],
];

export function markDone(app, patientId, ruleId) {
  app.state.done[patientId] ??= {};
  app.state.done[patientId][ruleId] = app.ref;
  app.save();
}

function filterRows(app, rows) {
  const f = app.ui.careFilter || {};
  const q = (f.q || '').trim().toLowerCase();
  return rows.filter((r) => {
    if (f.rule && !r.missing.some((m) => m.rule.id === f.rule)) return false;
    if (f.indicator && !r.missing.some((m) => m.rule.indicator === f.indicator)) return false;
    const c = app.state.contacts[r.patient.id]?.status || '';
    if (f.contact === 'sem' && c) return false;
    if (f.contact && f.contact !== 'sem' && c !== f.contact) return false;
    if (q && !String(r.patient.nome).toLowerCase().includes(q) && !String(r.patient.id).includes(q)) return false;
    return true;
  });
}

function exportList(app, rows) {
  const csv = toCSV(rows, [
    { label: 'N.º utente', get: (r) => r.patient.id },
    { label: 'Nome', get: (r) => r.patient.nome },
    { label: 'Idade', get: (r) => r.age },
    { label: 'Telefone', get: (r) => r.patient.telefone },
    { label: 'Cuidados em falta', get: (r) => r.missing.map((m) => m.rule.name).join(', ') },
    { label: 'Prioridade', get: (r) => +r.priority.toFixed(2) },
    { label: 'Estado do contacto', get: (r) => CONTACT_STATES.find((c) => c[0] === (app.state.contacts[r.patient.id]?.status || ''))?.[1] },
  ]);
  window.api.saveText({ defaultName: `convocatoria-${app.ref}.csv`, content: csv }).then((n) => n && toast(`Lista exportada: ${n}`));
}

export function render(app) {
  const page = h('div', { class: 'page' });
  const head = h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Cuidados em falta'), h('p', null, 'Utentes da lista com registos em falta, por ordem de prioridade.')));
  if (!app.state.patients.length) {
    page.append(
      head,
      empty(
        'Ainda não importou a lista de utentes.',
        h('div', { class: 'toolbar', style: { justifyContent: 'center' } }, h('button', { class: 'btn primary', onclick: () => app.go('importar') }, 'Importar lista de utentes'), h('button', { class: 'btn', onclick: () => loadDemo(app) }, 'Experimentar com dados de demonstração')),
      ),
    );
    return page;
  }
  app.ui.careFilter ??= {};
  const f = app.ui.careFilter;
  const all = app.gaps();
  const summary = ruleSummary(app.state.patients, app.state.rules, app.ref, app.state.done);
  const totalMissing = all.reduce((n, r) => n + r.missing.length, 0);
  const contacted = all.filter((r) => app.state.contacts[r.patient.id]?.status).length;

  page.append(
    head,
    h('div', { class: 'kpis' }, kpi('Utentes com falhas', fmt.num(all.length), `de ${fmt.num(app.state.patients.length)} na lista`, 'accent'), kpi('Cuidados em falta', fmt.num(totalMissing), 'soma de todas as regras'), kpi('Com contacto registado', fmt.num(contacted), 'convocados, agendados, etc.')),
  );

  page.append(
    card(
      'Cumprimento por regra (na lista importada)',
      table(
        [
          { label: 'Regra', render: (s) => s.rule.name },
          { label: 'Indicador', render: (s) => s.rule.indicator || '—' },
          { label: 'Elegíveis', class: 'num', render: (s) => fmt.num(s.eligible) },
          { label: 'Cumprem', class: 'num', render: (s) => fmt.num(s.ok) },
          { label: 'Em falta', class: 'num', render: (s) => h('strong', null, fmt.num(s.eligible - s.ok)) },
          { label: '%', class: 'num', render: (s) => (s.eligible ? fmt.num((s.ok / s.eligible) * 100, 1) + '%' : '—') },
          { label: '', render: (s) => h('button', { class: 'btn sm', onclick: () => ((f.rule = s.rule.id), (f.indicator = ''), app.render()) }, 'Filtrar') },
        ],
        summary,
      ),
      h('p', { class: 'small muted', style: { marginTop: '8px' } }, 'Taxas calculadas com o ficheiro importado e com o que marcou como feito aqui. Podem diferir do indicador oficial (critérios de inclusão, datas de extração).'),
    ),
  );

  const results = h('div');
  const drawResults = () => {
    const rows = filterRows(app, all);
    results.replaceChildren(
      h('p', { class: 'muted' }, `${fmt.num(rows.length)} utentes`),
      table(
        [
          { label: 'Prior.', class: 'num', width: '60px', render: (r) => fmt.num(r.priority, 1) },
          { label: 'Utente', render: (r) => [h('div', null, h('strong', null, r.patient.nome || '(sem nome)')), h('div', { class: 'small muted' }, `${r.patient.id} · ${r.age ?? '?'} anos · ${r.patient.sexo || '—'}${r.patient.telefone ? ' · ' + r.patient.telefone : ''}`)] },
          {
            label: 'Em falta',
            render: (r) =>
              r.missing.map((m) =>
                h(
                  'span',
                  { class: 'pc-item', style: { margin: '2px 4px 2px 0' }, title: m.last ? `Último registo: ${fmt.date(m.last)}` : 'Sem registo' },
                  m.rule.name,
                  h(
                    'button',
                    {
                      title: 'Marcar como feito hoje',
                      'aria-label': `Marcar ${m.rule.name} como feito`,
                      onclick: (e) => {
                        e.stopPropagation();
                        markDone(app, r.patient.id, m.rule.id);
                        app.render();
                      },
                    },
                    '✓',
                  ),
                ),
              ),
          },
          {
            label: 'Contacto',
            width: '150px',
            render: (r) =>
              select(
                CONTACT_STATES,
                app.state.contacts[r.patient.id]?.status || '',
                (v) => {
                  if (v) app.state.contacts[r.patient.id] = { status: v, date: app.ref };
                  else delete app.state.contacts[r.patient.id];
                  app.save();
                },
                { 'aria-label': 'Estado do contacto' },
              ),
          },
        ],
        rows,
        { limit: 100 },
      ),
    );
  };
  const rulesOpts = [['', 'Todas as regras'], ...app.state.rules.filter((r) => r.enabled !== false).map((r) => [r.id, r.name])];
  const indOpts = [['', 'Todos os indicadores'], ...[...new Set(app.state.rules.map((r) => r.indicator).filter(Boolean))].map((c) => [c, c])];
  page.append(
    card(
      'Lista de utentes',
      h(
        'div',
        { class: 'toolbar', style: { marginBottom: '12px' } },
        h('input', { type: 'search', placeholder: 'Pesquisar nome ou n.º', value: f.q || '', 'aria-label': 'Pesquisar', oninput: debounce((e) => ((f.q = e.target.value), drawResults()), 200) }),
        select(rulesOpts, f.rule || '', (v) => ((f.rule = v), drawResults()), { 'aria-label': 'Regra' }),
        select(indOpts, f.indicator || '', (v) => ((f.indicator = v), drawResults()), { 'aria-label': 'Indicador' }),
        select([['', 'Qualquer contacto'], ['sem', 'Sem contacto registado'], ...CONTACT_STATES.slice(1)], f.contact || '', (v) => ((f.contact = v), drawResults()), { 'aria-label': 'Contacto' }),
        h('button', { class: 'btn primary', onclick: () => exportList(app, filterRows(app, all)) }, 'Exportar para convocatória'),
        h(
          'button',
          {
            class: 'btn',
            title: 'Marca «A convocar» em todos os utentes filtrados sem contacto registado',
            onclick: () => {
              let n = 0;
              for (const r of filterRows(app, all)) {
                if (!app.state.contacts[r.patient.id]) {
                  app.state.contacts[r.patient.id] = { status: 'convocar', date: app.ref };
                  n++;
                }
              }
              app.save();
              toast(`${n} utentes marcados «A convocar».`);
              drawResults();
            },
          },
          'Marcar filtrados «A convocar»',
        ),
      ),
      f.indicator ? h('p', null, badge(`Filtro: indicador ${f.indicator}`, 'info')) : null,
      results,
      h('p', { class: 'small muted', style: { marginTop: '8px' } }, 'Prioridade = n.º de cuidados em falta, com peso extra para os indicadores onde cada utente vale mais IDE. Ao marcar «✓», a data de hoje fica registada nesta app e conta como último registo até um ficheiro importado trazer uma data mais recente.'),
    ),
  );
  drawResults();
  return page;
}
