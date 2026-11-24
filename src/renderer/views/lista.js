// Ponto 4 — Gestão da lista: unidades ponderadas, pirâmide etária, grupos de risco, utentes sem consulta e simulador de inscrições.

import { h, fmt, kpi, card, table, empty, toast } from '../ui.js';
import { pyramid } from '../chart.js';
import { analyseList, simulateUC } from '../../core/lista.js';
import { toCSV } from '../../core/csv.js';
import { loadDemo } from './importar.js';

export function render(app) {
  const page = h('div', { class: 'page' });
  const head = h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Lista e unidades ponderadas'), h('p', null, 'Dimensão e estrutura da lista de utentes.')));
  if (!app.state.patients.length) {
    page.append(head, empty('Ainda não importou a lista de utentes.', h('div', { class: 'toolbar', style: { justifyContent: 'center' } }, h('button', { class: 'btn primary', onclick: () => app.go('importar') }, 'Importar lista de utentes'), h('button', { class: 'btn', onclick: () => loadDemo(app) }, 'Dados de demonstração'))));
    return page;
  }
  const st = app.state;
  const months = +st.settings.inactiveMonths || 36;
  const a = analyseList(st.patients, { factors: st.ucFactors, groups: st.chronicGroups, refISO: app.ref, inactiveMonths: months });
  const ref = +st.settings.ucReferencia || 0;
  const diff = ref ? a.uc - ref : null;

  page.append(
    head,
    h(
      'div',
      { class: 'kpis' },
      kpi('Utentes inscritos', fmt.num(a.total), st.patientsImportedAt ? `lista importada em ${fmt.date(st.patientsImportedAt)}` : null, 'accent'),
      kpi('Unidades ponderadas', fmt.num(a.uc, 1), `${fmt.num(a.uc / Math.max(1, a.total), 2)} UC por utente`),
      kpi('Referência', ref ? fmt.num(ref) : '—', 'UC de referência (configurável)'),
      kpi('Diferença', diff === null ? '—' : fmt.signed(diff, 1), diff > 0 ? 'UC acima da referência' : diff < 0 ? 'UC abaixo da referência' : '', diff > 0 ? 'good' : diff < 0 ? 'warn' : ''),
    ),
  );

  const sim = app.ui.ucSim ?? (app.ui.ucSim = st.ucFactors.map(() => 0));
  const simOut = h('strong');
  const updateSim = () => {
    const v = simulateUC(a.uc, st.ucFactors, sim);
    simOut.textContent = `${fmt.num(v, 1)} UC (${fmt.signed(v - a.uc, 1)})${ref ? ` · ${fmt.signed(v - ref, 1)} face à referência` : ''}`;
  };

  page.append(
    h(
      'div',
      { class: 'grid c2' },
      card(
        'Unidades ponderadas por grupo etário',
        table(
          [
            { label: 'Grupo', render: (g) => g.label },
            { label: 'Fator', class: 'num', render: (g) => fmt.num(+g.factor, 1) },
            { label: 'Utentes', class: 'num', render: (g) => fmt.num(g.n) },
            { label: '% lista', class: 'num', render: (g) => fmt.num((g.n / Math.max(1, a.total)) * 100, 1) + '%' },
            { label: 'UC', class: 'num', render: (g) => fmt.num(g.uc, 1) },
          ],
          a.byGroup,
        ),
        a.unknownAge ? h('p', { class: 'small muted', style: { marginTop: '8px' } }, `${a.unknownAge} utentes sem data de nascimento válida (não contam para as UC).`) : null,
        h('h3', { style: { marginTop: '18px' } }, 'Simular novas inscrições'),
        h(
          'div',
          { class: 'form-row' },
          st.ucFactors.map((f, i) =>
            h(
              'label',
              { class: 'field', style: { flex: '1 1 90px' } },
              h('span', { class: 'field-label' }, f.label),
              h('input', {
                type: 'number',
                value: sim[i] || '',
                placeholder: '0',
                oninput: (e) => {
                  sim[i] = +e.target.value || 0;
                  updateSim();
                },
              }),
            ),
          ),
        ),
        h('p', { style: { marginTop: '10px' } }, 'Resultado: ', simOut),
        h('p', { class: 'small muted' }, 'Use números negativos para simular saídas. Os fatores e a referência editam-se em «Configuração».'),
      ),
      card('Pirâmide etária', pyramid(a.bands)),
    ),
  );

  page.append(
    h(
      'div',
      { class: 'grid c2' },
      card(
        'Grupos de risco (por códigos ICPC-2)',
        table(
          [
            { label: 'Grupo', render: (g) => g.label },
            { label: 'Códigos', render: (g) => h('span', { class: 'small muted' }, g.codes) },
            { label: 'Utentes', class: 'num', render: (g) => fmt.num(g.n) },
            { label: '% lista', class: 'num', render: (g) => fmt.num((g.n / Math.max(1, a.total)) * 100, 1) + '%' },
          ],
          a.chronic,
        ),
      ),
      card(
        `Sem consulta há ${months} meses ou mais`,
        h('p', null, h('strong', null, fmt.num(a.inactive.length)), ` utentes (${fmt.num((a.inactive.length / Math.max(1, a.total)) * 100, 1)}% da lista). Candidatos a contacto ou a atualização de inscrição.`),
        h(
          'div',
          { class: 'toolbar', style: { marginBottom: '10px' } },
          h(
            'button',
            {
              class: 'btn',
              onclick: () => {
                const csv = toCSV(a.inactive, [
                  { label: 'N.º utente', get: (r) => r.patient.id },
                  { label: 'Nome', get: (r) => r.patient.nome },
                  { label: 'Idade', get: (r) => r.age },
                  { label: 'Telefone', get: (r) => r.patient.telefone },
                  { label: 'Última consulta', get: (r) => fmt.date(r.patient.ultimaConsulta) || 'sem registo' },
                ]);
                window.api.saveText({ defaultName: `sem-consulta-${app.ref}.csv`, content: csv }).then((n) => n && toast(`Exportado: ${n}`));
              },
            },
            'Exportar lista',
          ),
        ),
        table(
          [
            { label: 'Utente', render: (r) => [h('div', null, r.patient.nome), h('div', { class: 'small muted' }, `${r.patient.id} · ${r.age ?? '?'} anos`)] },
            { label: 'Última consulta', class: 'num', render: (r) => fmt.date(r.patient.ultimaConsulta) || 'sem registo' },
          ],
          [...a.inactive].sort((x, y) => String(x.patient.ultimaConsulta || '').localeCompare(String(y.patient.ultimaConsulta || ''))),
          { limit: 15 },
        ),
      ),
    ),
  );
  updateSim();
  return page;
}
