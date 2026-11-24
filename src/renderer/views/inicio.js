// Página inicial: resumo do dia e do ano.

import { h, fmt, kpi, card, statusBadge, empty } from '../ui.js';
import { loadDemo } from './importar.js';

export function render(app) {
  const st = app.state;
  const page = h('div', { class: 'page' });
  const name = st.settings.medico ? `, ${st.settings.medico}` : '';
  page.append(h('div', { class: 'page-head' }, h('div', null, h('h1', null, `Olá${name}`), h('p', null, `Resumo de ${fmt.date(app.ref)}.`))));

  const hasInd = Object.keys(st.indicatorData).length > 0;
  if (!hasInd && !st.patients.length && !st.tasks.length) {
    page.append(
      empty(
        'Ainda não há dados. Importe os resultados dos indicadores e a lista de utentes, ou experimente com dados fictícios.',
        h('div', { class: 'toolbar', style: { justifyContent: 'center' } }, h('button', { class: 'btn primary', onclick: () => app.go('importar') }, 'Importar dados'), h('button', { class: 'btn', onclick: () => loadDemo(app) }, 'Experimentar com dados de demonstração')),
      ),
    );
    return page;
  }

  const kpis = h('div', { class: 'kpis' });
  let a = null;
  if (hasInd) {
    a = app.analysis();
    kpis.append(kpi('IDE estimado', fmt.num(a.ide.ide, 1), fmt.period(a.current), 'accent'), kpi('IDE projetado', fmt.num(a.projIde.ide, 1), `em ${fmt.period(a.endPeriod)}`));
  }
  const today = st.agenda?.date === app.ref ? st.agenda.items.length : 0;
  kpis.append(
    kpi('Consultas hoje', today ? fmt.num(today) : '—', today ? 'na pré-consulta' : 'agenda não importada'),
    kpi('Utentes com cuidados em falta', st.patients.length ? fmt.num(app.gaps().length) : '—', st.patients.length ? `de ${fmt.num(st.patients.length)}` : 'lista não importada'),
    kpi('Tarefas pendentes', fmt.num(st.tasks.filter((t) => t.status === 'pendente').length), `${st.tasks.filter((t) => t.status === 'pendente' && t.due && t.due < app.ref).length} atrasadas`),
  );
  page.append(kpis);

  const cols = h('div', { class: 'grid c2' });
  if (a) {
    const top = a.rows.filter((r) => r.gain.perPatient > 0).sort((x, y) => y.gain.perPatient - x.gain.perPatient).slice(0, 5);
    cols.append(
      card(
        'Onde cada utente vale mais',
        top.length
          ? h(
              'div',
              { class: 'table-wrap' },
              h(
                'table',
                null,
                h('thead', null, h('tr', null, h('th', null, 'Indicador'), h('th', { class: 'num' }, 'Atual'), h('th', { class: 'num' }, 'Faltam'), h('th', { class: 'num' }, 'Projeção'))),
                h(
                  'tbody',
                  null,
                  top.map((r) =>
                    h(
                      'tr',
                      { tabindex: 0, onclick: () => app.go('indicadores', { indSel: r.ind.code }), onkeydown: (e) => e.key === 'Enter' && app.go('indicadores', { indSel: r.ind.code }) },
                      h('td', null, h('strong', null, r.ind.code), ' ', r.ind.name),
                      h('td', { class: 'num' }, fmt.val(r.value, r.ind), ' ', statusBadge(r.status)),
                      h('td', { class: 'num' }, fmt.num(r.gap.toEsperado)),
                      h('td', { class: 'num' }, r.proj ? statusBadge(r.projStatus) : '—'),
                    ),
                  ),
                ),
              ),
            )
          : h('p', { class: 'muted' }, 'Todos os indicadores estão no intervalo esperado.'),
      ),
    );
  }
  if (st.patients.length) {
    const gaps = app.gaps().slice(0, 6);
    cols.append(
      card(
        'Utentes prioritários a convocar',
        gaps.length
          ? h(
              'div',
              null,
              gaps.map((r) => h('div', { style: { padding: '6px 0', borderBottom: '1px solid var(--line-soft)' } }, h('strong', null, r.patient.nome), h('span', { class: 'muted small' }, ` · ${r.age ?? '?'} anos · `), r.missing.map((m) => h('span', { class: 'badge bad' }, m.rule.name)))),
              h('button', { class: 'btn', style: { marginTop: '10px' }, onclick: () => app.go('cuidados') }, 'Ver lista completa'),
            )
          : h('p', { class: 'muted' }, 'Sem cuidados em falta.'),
      ),
    );
  }
  page.append(cols);
  return page;
}
