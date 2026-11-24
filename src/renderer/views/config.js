// Configuração: dados do médico, matriz de indicadores, regras de cuidados, fatores de ponderação e segurança.

import { h, card, toast, modal, confirmDialog, field, select } from '../ui.js';
import { toCSV } from '../../core/csv.js';
import { PATIENT_FIELDS } from '../../core/defaults.js';
import { findHeaderRow, guessMapping, parseNumber } from '../../core/mapping.js';

const MATRIX_FIELDS = [
  { key: 'code', label: 'Código', required: true, synonyms: ['codigo', 'code', 'cod'] },
  { key: 'name', label: 'Nome', synonyms: ['nome', 'indicador', 'designacao'] },
  { key: 'area', label: 'Área', synonyms: ['area', 'dimensao'] },
  { key: 'weight', label: 'Peso', synonyms: ['peso', 'ponderacao', 'weight'] },
  { key: 'direction', label: 'Sentido', synonyms: ['sentido', 'direction'] },
  { key: 'unit', label: 'Unidade', synonyms: ['unidade', 'unit'] },
  { key: 'mult', label: 'Multiplicador', synonyms: ['multiplicador', 'mult'] },
  { key: 'aMin', label: 'Aceitável mín.', synonyms: ['aceitavelmin', 'amin', 'limiteinferioraceitavel'] },
  { key: 'eMin', label: 'Esperado mín.', synonyms: ['esperadomin', 'emin', 'limiteinferioresperado'] },
  { key: 'eMax', label: 'Esperado máx.', synonyms: ['esperadomax', 'emax', 'limitesuperioresperado'] },
  { key: 'aMax', label: 'Aceitável máx.', synonyms: ['aceitavelmax', 'amax', 'limitesuperioraceitavel'] },
];

function input(obj, key, app, props = {}) {
  const isNum = props.type === 'number';
  return h('input', {
    type: 'text',
    ...props,
    value: obj[key] ?? '',
    'aria-label': props['aria-label'] || key,
    onchange: (e) => {
      const v = e.target.value;
      obj[key] = isNum ? (v === '' ? '' : +v) : v;
      app.save();
    },
  });
}

function sectionGeral(app) {
  const s = app.state.settings;
  return card(
    'Geral',
    h(
      'div',
      { class: 'form-row' },
      field('Nome do médico', input(s, 'medico', app)),
      field('USF', input(s, 'usf', app)),
      field('Ano contratual', input(s, 'anoContratual', app, { type: 'number' }), 'A projeção é feita para dezembro deste ano.'),
      field(
        'Cálculo da pontuação',
        select(
          [
            ['linear', 'Linear entre aceitável e esperado'],
            ['escalao', 'Escalões (aceitável = 50%)'],
          ],
          s.scoreMode,
          (v) => ((s.scoreMode = v), app.save()),
        ),
        'Ajuste às regras de cálculo em vigor.',
      ),
      field('Meses usados na projeção', input(s, 'projectionWindow', app, { type: 'number', min: 2, max: 12 })),
      field('Bloqueio por inatividade (min)', input(s, 'lockMinutes', app, { type: 'number', min: 0 }), '0 = nunca bloquear (não recomendado).'),
      field('Sem consulta há (meses)', input(s, 'inactiveMonths', app, { type: 'number', min: 1 })),
    ),
  );
}

function sectionMatrix(app) {
  const m = app.state.matrix;
  const tbody = h(
    'tbody',
    null,
    m.map((ind, i) =>
      h(
        'tr',
        null,
        h('td', null, h('input', { type: 'checkbox', checked: ind.enabled !== false, 'aria-label': 'Ativo', onchange: (e) => ((ind.enabled = e.target.checked), app.save()) })),
        h('td', { style: { width: '80px' } }, input(ind, 'code', app)),
        h('td', { style: { minWidth: '240px' } }, input(ind, 'name', app)),
        h('td', { style: { width: '120px' } }, input(ind, 'area', app)),
        h('td', { style: { width: '60px' } }, input(ind, 'weight', app, { type: 'number' })),
        h(
          'td',
          { style: { width: '110px' } },
          select(
            [
              ['up', 'Maior é melhor'],
              ['down', 'Menor é melhor'],
            ],
            ind.direction || 'up',
            (v) => ((ind.direction = v), app.save()),
          ),
        ),
        h('td', { style: { width: '60px' } }, input(ind, 'unit', app)),
        h('td', { style: { width: '70px' } }, input(ind, 'mult', app, { type: 'number' })),
        ['aMin', 'eMin', 'eMax', 'aMax'].map((k) => h('td', { style: { width: '72px' } }, input(ind, k, app, { type: 'number', step: 'any' }))),
        h(
          'td',
          null,
          h(
            'button',
            {
              class: 'btn sm ghost',
              'aria-label': 'Remover indicador',
              onclick: async () => {
                if (await confirmDialog('Remover indicador', `Remover ${ind.code} da matriz? Os resultados importados mantêm-se.`, 'Remover', true)) {
                  m.splice(i, 1);
                  app.save();
                  app.render();
                }
              },
            },
            '✕',
          ),
        ),
      ),
    ),
  );
  return card(
    'Matriz de indicadores',
    h('div', { class: 'notice', style: { marginBottom: '10px' } }, 'A matriz que vem com a app é um exemplo. Substitua códigos, pesos e limiares pelos da matriz de contratualização da sua USF (pode importá-la de um CSV).'),
    h(
      'div',
      { class: 'table-wrap edit-table' },
      h(
        'table',
        null,
        h('thead', null, h('tr', null, ['Ativo', 'Código', 'Nome', 'Área', 'Peso', 'Sentido', 'Unid.', 'Mult.', 'Aceit. mín', 'Esper. mín', 'Esper. máx', 'Aceit. máx', ''].map((t) => h('th', null, t)))),
        tbody,
      ),
    ),
    h(
      'div',
      { class: 'toolbar', style: { marginTop: '10px' } },
      h(
        'button',
        {
          class: 'btn',
          onclick: () => {
            m.push({ code: `N${m.length + 1}`, name: 'Novo indicador', area: '', weight: 1, direction: 'up', unit: '%', mult: 100, aMin: '', eMin: '', eMax: '', aMax: '', enabled: true });
            app.save();
            app.render();
          },
        },
        'Adicionar indicador',
      ),
      h('button', { class: 'btn', onclick: () => importMatrix(app) }, 'Importar matriz (CSV/Excel)'),
      h(
        'button',
        {
          class: 'btn',
          onclick: () => {
            const csv = toCSV(m, MATRIX_FIELDS.map((f) => ({ key: f.key, label: f.label })));
            window.api.saveText({ defaultName: 'matriz-indicadores.csv', content: csv }).then((n) => n && toast(`Exportado: ${n}`));
          },
        },
        'Exportar matriz',
      ),
    ),
    h('p', { class: 'small muted', style: { marginTop: '8px' } }, 'Unidade «%» usa multiplicador 100; «‰» usa 1000. Deixe um limite vazio quando não se aplica. «Menor é melhor» para indicadores como internamentos evitáveis.'),
  );
}

async function importMatrix(app) {
  let file;
  try {
    file = await window.api.openTable('Importar matriz de indicadores');
  } catch (err) {
    return toast(err.message, 'error');
  }
  if (!file || !file.rows.length) return;
  const hi = findHeaderRow(file.rows, MATRIX_FIELDS);
  const map = guessMapping(file.rows[hi], MATRIX_FIELDS);
  if (map.code === undefined) return toast('Não encontrei a coluna «Código».', 'error');
  const out = [];
  for (const row of file.rows.slice(hi + 1)) {
    const get = (k) => (map[k] === undefined ? '' : row[map[k]]);
    const code = String(get('code') ?? '').trim();
    if (!code) continue;
    const n = (k) => {
      const v = parseNumber(get(k));
      return v === null ? '' : v;
    };
    const dir = String(get('direction') || '').toLowerCase();
    const unit = String(get('unit') || '%').trim() || '%';
    out.push({ code, name: String(get('name') || code), area: String(get('area') || ''), weight: n('weight') === '' ? 1 : n('weight'), direction: dir.startsWith('d') || dir.startsWith('men') ? 'down' : 'up', unit, mult: n('mult') === '' ? (unit === '‰' ? 1000 : 100) : n('mult'), aMin: n('aMin'), eMin: n('eMin'), eMax: n('eMax'), aMax: n('aMax'), enabled: true });
  }
  if (!out.length) return toast('Sem indicadores no ficheiro.', 'error');
  if (!(await confirmDialog('Substituir matriz', `Substituir a matriz atual por ${out.length} indicadores do ficheiro?`, 'Substituir'))) return;
  app.state.matrix = out;
  app.save();
  app.render();
  toast('Matriz importada.');
}

function sectionRules(app) {
  const rules = app.state.rules;
  const known = new Set(PATIENT_FIELDS.filter((f) => f.date).map((f) => f.key));
  for (const p of app.state.patients.slice(0, 50)) for (const k of Object.keys(p.fields || {})) known.add(k);
  const fieldOpts = [...known].sort().map((k) => [k, PATIENT_FIELDS.find((f) => f.key === k)?.label || k]);
  const indOpts = [['', '—'], ...app.state.matrix.map((i) => [i.code, i.code])];
  return card(
    'Regras de cuidados (cuidados em falta e pré-consulta)',
    h('p', { class: 'small muted' }, 'Cada regra diz: para quem (idade, sexo, problemas ICPC-2), que registo (coluna com a data do último registo) e com que validade em meses. Ligue-a a um indicador para a priorização.'),
    h(
      'div',
      { class: 'table-wrap edit-table' },
      h(
        'table',
        null,
        h('thead', null, h('tr', null, ['Ativa', 'Nome', 'Indicador', 'Idade mín', 'Idade máx', 'Sexo', 'Problemas (qualquer)', 'Registo (coluna)', 'Validade (meses)', ''].map((t) => h('th', null, t)))),
        h(
          'tbody',
          null,
          rules.map((r, i) =>
            h(
              'tr',
              null,
              h('td', null, h('input', { type: 'checkbox', checked: r.enabled !== false, 'aria-label': 'Ativa', onchange: (e) => ((r.enabled = e.target.checked), app.save()) })),
              h('td', { style: { minWidth: '150px' } }, input(r, 'name', app)),
              h('td', { style: { width: '90px' } }, select(indOpts, r.indicator || '', (v) => ((r.indicator = v), app.save()))),
              h('td', { style: { width: '70px' } }, input(r, 'ageMin', app, { type: 'number' })),
              h('td', { style: { width: '70px' } }, input(r, 'ageMax', app, { type: 'number' })),
              h('td', { style: { width: '80px' } }, select([['', 'Ambos'], ['F', 'F'], ['M', 'M']], r.sex || '', (v) => ((r.sex = v), app.save()))),
              h('td', { style: { width: '130px' } }, input(r, 'problems', app, { placeholder: 'ex.: T89 T90' })),
              h('td', { style: { width: '170px' } }, select(fieldOpts, r.field, (v) => ((r.field = v), app.save()))),
              h('td', { style: { width: '80px' } }, input(r, 'months', app, { type: 'number', placeholder: 'sempre' })),
              h(
                'td',
                null,
                h(
                  'button',
                  {
                    class: 'btn sm ghost',
                    'aria-label': 'Remover regra',
                    onclick: () => {
                      rules.splice(i, 1);
                      app.save();
                      app.render();
                    },
                  },
                  '✕',
                ),
              ),
            ),
          ),
        ),
      ),
    ),
    h(
      'div',
      { class: 'toolbar', style: { marginTop: '10px' } },
      h(
        'button',
        {
          class: 'btn',
          onclick: () => {
            rules.push({ id: 'r' + Date.now().toString(36), name: 'Nova regra', indicator: '', field: fieldOpts[0]?.[0] || '', months: 12, enabled: true });
            app.save();
            app.render();
          },
        },
        'Adicionar regra',
      ),
    ),
  );
}

function sectionUC(app) {
  const st = app.state;
  return h(
    'div',
    { class: 'grid c2' },
    card(
      'Fatores de ponderação (UC)',
      h('p', { class: 'small muted' }, 'Valores clássicos do modelo B. Confirme o regime em vigor e ajuste se necessário.'),
      h(
        'div',
        { class: 'table-wrap edit-table' },
        h(
          'table',
          null,
          h('thead', null, h('tr', null, ['Grupo', 'Idade mín', 'Idade máx', 'Fator'].map((t) => h('th', null, t)))),
          h(
            'tbody',
            null,
            st.ucFactors.map((f) => h('tr', null, h('td', null, input(f, 'label', app)), h('td', null, input(f, 'min', app, { type: 'number' })), h('td', null, input(f, 'max', app, { type: 'number', placeholder: 'sem limite' })), h('td', null, input(f, 'factor', app, { type: 'number', step: 'any' })))),
          ),
        ),
      ),
      h('div', { class: 'form-row', style: { marginTop: '10px' } }, field('UC de referência', input(st.settings, 'ucReferencia', app, { type: 'number' }), 'Dimensão de referência da lista em unidades ponderadas.')),
    ),
    card(
      'Grupos de risco',
      h(
        'div',
        { class: 'table-wrap edit-table' },
        h(
          'table',
          null,
          h('thead', null, h('tr', null, ['Grupo', 'Códigos ICPC-2', ''].map((t) => h('th', null, t)))),
          h(
            'tbody',
            null,
            st.chronicGroups.map((g, i) =>
              h(
                'tr',
                null,
                h('td', null, input(g, 'label', app)),
                h('td', null, input(g, 'codes', app)),
                h(
                  'td',
                  null,
                  h(
                    'button',
                    {
                      class: 'btn sm ghost',
                      'aria-label': 'Remover grupo',
                      onclick: () => {
                        st.chronicGroups.splice(i, 1);
                        app.save();
                        app.render();
                      },
                    },
                    '✕',
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
      h(
        'button',
        {
          class: 'btn',
          style: { marginTop: '10px' },
          onclick: () => {
            st.chronicGroups.push({ label: 'Novo grupo', codes: '' });
            app.save();
            app.render();
          },
        },
        'Adicionar grupo',
      ),
    ),
  );
}

function sectionSecurity(app) {
  const changePw = async () => {
    const oldPw = h('input', { type: 'password', autocomplete: 'current-password' });
    const n1 = h('input', { type: 'password', autocomplete: 'new-password' });
    const n2 = h('input', { type: 'password', autocomplete: 'new-password' });
    const ok = await modal('Alterar palavra-passe', h('div', { class: 'form-row', style: { flexDirection: 'column', alignItems: 'stretch' } }, field('Palavra-passe atual', oldPw), field('Nova palavra-passe (mín. 8)', n1), field('Repetir nova', n2)), [
      { label: 'Cancelar', value: false },
      { label: 'Alterar', value: true, kind: 'primary' },
    ]);
    if (!ok) return;
    if (n1.value.length < 8) return toast('A nova palavra-passe deve ter pelo menos 8 caracteres.', 'error');
    if (n1.value !== n2.value) return toast('As palavras-passe novas não coincidem.', 'error');
    try {
      await window.api.changePassword(oldPw.value, n1.value, app.state);
      toast('Palavra-passe alterada.');
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  const clearPatients = async () => {
    if (await confirmDialog('Apagar dados de utentes', 'Apagar a lista de utentes, a agenda, os registos marcados e os contactos? A matriz, os resultados agregados e as tarefas mantêm-se.', 'Apagar', true)) {
      Object.assign(app.state, { patients: [], patientsImportedAt: null, done: {}, contacts: {}, agenda: { date: null, items: [] } });
      app.save();
      app.render();
      toast('Dados de utentes apagados.');
    }
  };
  const wipe = async () => {
    if (await confirmDialog('Apagar tudo', 'Apagar TODOS os dados desta app neste computador (incluindo a palavra-passe)? Esta ação não pode ser desfeita.', 'Apagar tudo', true)) await window.api.wipe();
  };
  return card(
    'Segurança e dados',
    h('p', null, 'Os dados são guardados apenas neste computador, cifrados (AES-256-GCM) com uma chave derivada da sua palavra-passe. A app não comunica com a Internet.'),
    h(
      'div',
      { class: 'toolbar' },
      h('button', { class: 'btn', onclick: changePw }, 'Alterar palavra-passe'),
      h('button', { class: 'btn', onclick: () => window.api.openDataDir() }, 'Abrir pasta dos dados'),
      h('button', { class: 'btn', onclick: clearPatients }, 'Apagar dados de utentes'),
      h('button', { class: 'btn danger', onclick: wipe }, 'Apagar tudo'),
    ),
  );
}

export function render(app) {
  return h('div', { class: 'page' }, h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Configuração'), h('p', null, 'As alterações são gravadas automaticamente.'))), sectionGeral(app), sectionMatrix(app), sectionRules(app), sectionUC(app), sectionSecurity(app));
}
