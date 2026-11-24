// Ponto 1 — «Os meus indicadores»: valor atual, meta, distância em utentes, projeção a 31/12 e simulador.

import { h, fmt, kpi, card, statusBadge, empty, select, toast } from '../ui.js';
import { evolutionChart } from '../chart.js';
import { simulate } from '../analysis.js';
import { multOf, targetValue } from '../../core/indicators.js';
import { toCSV } from '../../core/csv.js';
import { loadDemo } from './importar.js';

const STATUS_ORDER = { fora: 0, aceitavel: 1, 'sem-dados': 2, esperado: 3 };

function meter(r) {
  const ind = r.ind;
  const num = (v) => (v === '' || v == null || !isFinite(+v) ? null : +v);
  const pct = ind.unit === '%' || !ind.unit;
  const max = pct ? multOf(ind) : Math.max(num(ind.aMax) ?? 0, r.value ?? 0, r.proj?.predicted ?? 0) * 1.25 || 1;
  const pos = (v) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  const zone = (lo, hi, cls) => {
    const a = num(lo) ?? 0;
    const b = num(hi) ?? max;
    return h('div', { class: cls, style: { left: pos(a), width: `calc(${pos(b)} - ${pos(a)})` } });
  };
  return h(
    'div',
    { class: 'meter', 'aria-hidden': 'true' },
    zone(ind.aMin, ind.aMax, 'm-acc'),
    zone(ind.eMin, ind.eMax, 'm-esp'),
    r.proj ? h('div', { class: 'm-proj', style: { left: pos(r.proj.predicted) } }) : null,
    r.value !== null ? h('div', { class: 'm-val', style: { left: pos(r.value) } }) : null,
  );
}

function explain(r, a) {
  const ind = r.ind;
  const parts = [];
  if (r.value === null) return h('p', null, 'Ainda não há resultados para este indicador.');
  parts.push(h('p', null, `Em ${fmt.period(r.rec.period)} o valor é `, h('strong', null, fmt.val(r.value, ind)), ' — ', statusBadge(r.status)));
  if (r.proj) {
    parts.push(
      h(
        'p',
        null,
        `Ao ritmo dos últimos ${r.proj.n} meses (${fmt.signed(r.proj.slope, 2)} por mês), deverá chegar a `,
        h('strong', null, fmt.val(r.proj.predicted, ind)),
        ` em ${fmt.period(a.endPeriod)} — `,
        statusBadge(r.projStatus),
      ),
    );
  } else parts.push(h('p', { class: 'muted' }, 'Sem meses suficientes no ano contratual para projetar (são precisos pelo menos 2).'));
  if (r.gap.toEsperado) {
    const one = r.gap.toEsperado === 1;
    const verb = ind.direction === 'down' ? (one ? 'caso a menos' : 'casos a menos') : one ? 'utente cumpridor a mais' : 'utentes cumpridores a mais';
    parts.push(
      h(
        'p',
        null,
        `Para chegar ao intervalo esperado ${one ? 'é preciso' : 'são precisos'} `,
        h('strong', null, `${fmt.num(r.gap.toEsperado)} ${verb}`),
        r.needPerMonth ? ` — cerca de ${fmt.num(Math.ceil(r.needPerMonth))} por mês até dezembro` : '',
        '.',
      ),
    );
    if (r.gain.delta > 0) parts.push(h('p', null, `Isso acrescenta cerca de `, h('strong', null, `${fmt.num(r.gain.delta, 1)} pontos`), ` ao IDE estimado (${fmt.num(r.gain.perPatient, 3)} por utente).`));
  } else if (r.status === 'esperado') parts.push(h('p', null, 'Já está no intervalo esperado. Mantenha o ritmo.'));
  parts.push(h('p', { class: 'small muted' }, 'Pressupõe que o denominador se mantém. Os valores oficiais do BI-CSP/MIM@UF prevalecem sempre.'));
  return parts;
}

function detailPanel(app, a, r) {
  if (!r) return card('Detalhe', h('p', { class: 'muted' }, 'Clique num indicador para ver a evolução, a projeção e o que falta.'));
  const ind = r.ind;
  const hasRule = app.state.rules.some((x) => x.indicator === ind.code && x.enabled !== false);
  return card(
    `${ind.code} · ${ind.name}`,
    h('div', { class: 'legend' }, h('span', null, h('i', { style: { background: '#e3f4ea' } }), 'Esperado'), h('span', null, h('i', { style: { background: '#fbf1d9' } }), 'Aceitável'), h('span', null, h('i', { style: { background: 'var(--accent)' } }), 'Real'), h('span', null, h('i', { style: { border: '2px dashed var(--accent)', background: '#fff' } }), 'Projeção')),
    evolutionChart(app.state.indicatorData[ind.code], ind, r.proj, a.endPeriod) || h('p', { class: 'muted' }, 'Sem dados.'),
    h('div', { class: 'detail' }, explain(r, a)),
    h(
      'dl',
      { class: 'detail' },
      h('dt', null, 'Numerador / denominador'),
      h('dd', null, r.rec && r.rec.num != null ? `${fmt.num(r.rec.num)} / ${fmt.num(r.rec.den)}` : '—'),
      h('dt', null, 'Intervalo aceitável'),
      h('dd', null, `${ind.aMin ?? '—'} a ${ind.aMax ?? '—'}`),
      h('dt', null, 'Intervalo esperado'),
      h('dd', null, `${ind.eMin ?? '—'} a ${ind.eMax ?? '—'}`),
      h('dt', null, 'Peso'),
      h('dd', null, ind.weight),
    ),
    hasRule ? h('p', { style: { marginTop: '12px' } }, h('button', { class: 'btn primary', onclick: () => app.go('cuidados', { careFilter: { indicator: ind.code } }) }, 'Ver utentes em falta')) : null,
  );
}

function exportTable(app, a) {
  const csv = toCSV(a.rows, [
    { label: 'Código', get: (r) => r.ind.code },
    { label: 'Indicador', get: (r) => r.ind.name },
    { label: 'Área', get: (r) => r.ind.area },
    { label: 'Peso', get: (r) => r.ind.weight },
    { label: 'Período', get: (r) => r.rec?.period },
    { label: 'Valor', get: (r) => (r.value === null ? '' : +r.value.toFixed(2)) },
    { label: 'Estado', get: (r) => r.status },
    { label: 'Meta', get: (r) => targetValue(r.ind) },
    { label: 'Utentes em falta (esperado)', get: (r) => r.gap.toEsperado ?? '' },
    { label: 'Projeção dezembro', get: (r) => (r.proj ? +r.proj.predicted.toFixed(2) : '') },
    { label: 'Estado projetado', get: (r) => r.projStatus },
    { label: 'Utentes por mês', get: (r) => (r.needPerMonth ? Math.ceil(r.needPerMonth) : '') },
    { label: 'Pontos IDE por utente', get: (r) => +r.gain.perPatient.toFixed(4) },
  ]);
  window.api.saveText({ defaultName: `indicadores-${a.current}.csv`, content: csv }).then((n) => n && toast(`Exportado: ${n}`));
}

export function render(app) {
  const a = app.analysis();
  const page = h('div', { class: 'page' });
  if (!a.current) {
    page.append(
      h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Os meus indicadores'), h('p', null, 'Resultados, metas, projeção e simulação.'))),
      empty(
        'Ainda não importou resultados de indicadores.',
        h('div', { class: 'toolbar', style: { justifyContent: 'center' } }, h('button', { class: 'btn primary', onclick: () => app.go('importar') }, 'Importar resultados'), h('button', { class: 'btn', onclick: () => loadDemo(app) }, 'Experimentar com dados de demonstração')),
      ),
    );
    return page;
  }
  app.ui.sim ??= {};
  const sort = app.ui.indSort || 'ganho';
  const rows = [...a.rows].sort((x, y) => {
    if (sort === 'ganho') return y.gain.perPatient - x.gain.perPatient || STATUS_ORDER[x.status] - STATUS_ORDER[y.status];
    if (sort === 'estado') return STATUS_ORDER[x.status] - STATUS_ORDER[y.status] || y.gain.perPatient - x.gain.perPatient;
    if (sort === 'falta') return (y.gap.toEsperado || 0) - (x.gap.toEsperado || 0);
    return String(x.ind.area).localeCompare(String(y.ind.area)) || x.ind.code.localeCompare(y.ind.code);
  });
  const selected = a.rows.find((r) => r.ind.code === app.ui.indSel);
  const counts = { esperado: 0, aceitavel: 0, fora: 0 };
  for (const r of a.rows) if (r.ind.weight > 0 && counts[r.status] !== undefined) counts[r.status]++;

  const simVal = h('div', { class: 'kpi-value' });
  const simSub = h('div', { class: 'kpi-sub' });
  const updateSim = () => {
    const sim = simulate(app.state, a, app.ui.sim);
    const total = Object.values(app.ui.sim).reduce((x, y) => x + (+y || 0), 0);
    simVal.textContent = fmt.num(sim.ide, 1);
    simSub.textContent = total ? `com mais ${fmt.num(total)} utentes (${fmt.signed(sim.ide - a.ide.ide, 1)} pontos)` : 'Use a coluna «Simular» na tabela';
  };
  const ideKind = (v) => (v === null ? '' : v >= 80 ? 'good' : v >= 60 ? 'warn' : 'bad');

  page.append(
    h(
      'div',
      { class: 'page-head' },
      h('div', null, h('h1', null, 'Os meus indicadores'), h('p', null, `Ano contratual ${a.year} · estimativa de apoio — prevalecem os valores oficiais.`)),
      h(
        'div',
        { class: 'toolbar' },
        h('span', { class: 'muted' }, 'Período'),
        select(
          [...a.periods].reverse().map((p) => [p, fmt.period(p)]),
          a.current,
          (v) => {
            app.ui.period = v;
            app.ui.sim = {};
            app.render();
          },
          { 'aria-label': 'Período' },
        ),
        h('button', { class: 'btn', onclick: () => exportTable(app, a) }, 'Exportar CSV'),
      ),
    ),
    h(
      'div',
      { class: 'kpis' },
      kpi('IDE estimado', fmt.num(a.ide.ide, 1), `${fmt.period(a.current)}${a.ide.missing.length ? ` · ${a.ide.missing.length} sem dados` : ''}`, `accent ${ideKind(a.ide.ide)}`),
      kpi('IDE projetado', fmt.num(a.projIde.ide, 1), `em ${fmt.period(a.endPeriod)}, ao ritmo atual`, ideKind(a.projIde.ide)),
      h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, 'IDE simulado'), simVal, simSub),
      kpi('Estado dos indicadores', `${counts.esperado} · ${counts.aceitavel} · ${counts.fora}`, 'esperado · aceitável · fora'),
    ),
  );

  const table = h(
    'div',
    { class: 'table-wrap' },
    h(
      'table',
      null,
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          h('th', null, 'Indicador'),
          h('th', { class: 'num' }, 'Peso'),
          h('th', { class: 'num' }, 'Atual'),
          h('th', { class: 'num', title: 'Utentes cumpridores em falta para o intervalo esperado e quantos por mês até dezembro' }, 'Faltam'),
          h('th', { class: 'num' }, `Projeção ${fmt.period(a.endPeriod)}`),
          h('th', { class: 'num', title: 'Pontos de IDE ganhos por cada utente que fechar' }, 'IDE/utente'),
          h('th', { class: 'num', title: 'Simule utentes a mais (ou casos a menos)' }, 'Simular'),
        ),
      ),
      h(
        'tbody',
        null,
        rows.map((r) =>
          h(
            'tr',
            {
              tabindex: 0,
              class: r.ind.code === app.ui.indSel ? 'selected' : null,
              onclick: (e) => {
                if (e.target.tagName === 'INPUT') return;
                app.ui.indSel = r.ind.code;
                app.render();
              },
              onkeydown: (e) => {
                if (e.key === 'Enter' && e.target.tagName !== 'INPUT') {
                  app.ui.indSel = r.ind.code;
                  app.render();
                }
              },
            },
            h('td', null, h('div', null, h('strong', null, r.ind.code), ' ', r.ind.name), h('div', { class: 'small muted' }, r.ind.area, r.stale ? ` · último dado: ${fmt.period(r.rec.period)}` : ''), meter(r)),
            h('td', { class: 'num' }, r.ind.weight),
            h('td', { class: 'num' }, fmt.val(r.value, r.ind), h('br'), statusBadge(r.status), h('div', { class: 'small muted' }, `meta ${fmt.val(targetValue(r.ind), r.ind, 0)}`)),
            h(
              'td',
              { class: 'num' },
              r.gap.toEsperado === null ? '—' : r.gap.toEsperado ? h('strong', null, fmt.num(r.gap.toEsperado)) : '0',
              r.needPerMonth ? h('div', { class: 'small muted' }, `${fmt.num(Math.ceil(r.needPerMonth))}/mês`) : null,
              r.gap.toAceitavel ? h('div', { class: 'small muted' }, `${fmt.num(r.gap.toAceitavel)} p/ aceitável`) : null,
            ),
            h('td', { class: 'num' }, r.proj ? [fmt.val(r.proj.predicted, r.ind), h('br'), statusBadge(r.projStatus)] : '—'),
            h('td', { class: 'num' }, r.gain.perPatient > 0 ? fmt.num(r.gain.perPatient, 3) : '—'),
            h(
              'td',
              { class: 'num' },
              r.rec && r.rec.num != null
                ? h('input', {
                    type: 'number',
                    min: 0,
                    max: r.rec.den,
                    class: 'num-in',
                    value: app.ui.sim[r.ind.code] || '',
                    placeholder: '0',
                    'aria-label': `Simular utentes em ${r.ind.code}`,
                    oninput: (e) => {
                      app.ui.sim[r.ind.code] = Math.max(0, +e.target.value || 0);
                      updateSim();
                    },
                  })
                : '—',
            ),
          ),
        ),
      ),
    ),
  );

  page.append(
    h(
      'div',
      { class: 'split' },
      h(
        'div',
        null,
        h(
          'div',
          { class: 'toolbar', style: { marginBottom: '10px' } },
          h('span', { class: 'muted' }, 'Ordenar por'),
          select(
            [
              ['ganho', 'Mais IDE por utente'],
              ['estado', 'Estado (pior primeiro)'],
              ['falta', 'Mais utentes em falta'],
              ['area', 'Área'],
            ],
            sort,
            (v) => {
              app.ui.indSort = v;
              app.render();
            },
            { 'aria-label': 'Ordenar' },
          ),
          h(
            'button',
            {
              class: 'btn',
              title: 'Simula fechar todos os indicadores até ao intervalo esperado',
              onclick: () => {
                app.ui.sim = {};
                for (const r of a.rows) if (r.gap.toEsperado) app.ui.sim[r.ind.code] = r.gap.toEsperado;
                app.render();
              },
            },
            'Simular todas as metas',
          ),
          h(
            'button',
            {
              class: 'btn',
              onclick: () => {
                app.ui.sim = {};
                app.render();
              },
            },
            'Limpar simulação',
          ),
        ),
        table,
        h('p', { class: 'small muted', style: { marginTop: '8px' } }, 'Na barra: verde = intervalo esperado, amarelo = aceitável, traço escuro = valor atual, traço azul = projeção. «IDE/utente» indica onde cada utente recuperado vale mais.'),
      ),
      h('div', { class: 'sticky' }, detailPanel(app, a, selected)),
    ),
  );
  updateSim();
  return page;
}
