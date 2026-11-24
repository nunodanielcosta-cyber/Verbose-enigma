// Ponto 3 — Pré-consulta: para cada utente da agenda do dia, o que falta registar e para que indicadores conta.

import { h, fmt, empty, toast, confirmDialog } from '../ui.js';
import { patientIndex, patientChecklist } from '../analysis.js';
import { ageAt } from '../../core/dates.js';
import { markDone } from './cuidados.js';
import { importAgendaFlow, loadDemo } from './importar.js';

function addPatientsForm(app, idx) {
  const input = h('input', { type: 'text', placeholder: 'N.º de utente ou nome', list: 'pc-patients', 'aria-label': 'Utente a adicionar' });
  const hora = h('input', { type: 'text', placeholder: 'hh:mm', class: 'tiny', 'aria-label': 'Hora' });
  const dl = h('datalist', { id: 'pc-patients' });
  const fill = () => {
    const q = input.value.trim().toLowerCase();
    dl.replaceChildren();
    if (q.length < 2) return;
    let n = 0;
    for (const p of app.state.patients) {
      if (String(p.id).includes(q) || String(p.nome).toLowerCase().includes(q)) {
        dl.append(h('option', { value: p.id }, `${p.nome} (${ageAt(p.nasc, app.ref) ?? '?'} anos)`));
        if (++n >= 20) break;
      }
    }
  };
  const add = () => {
    const v = input.value.trim();
    if (!v) return;
    let p = idx.get(v);
    if (!p) {
      const matches = app.state.patients.filter((x) => String(x.nome).toLowerCase().includes(v.toLowerCase()));
      if (matches.length === 1) p = matches[0];
    }
    if (!p) return toast('Utente não encontrado na lista importada. Use o n.º de utente.', 'error');
    ensureToday(app);
    app.state.agenda.items.push({ id: p.id, hora: hora.value.trim(), tipo: '' });
    app.state.agenda.items.sort((a, b) => (a.hora || '99').localeCompare(b.hora || '99'));
    app.save();
    app.render();
  };
  input.addEventListener('input', fill);
  input.addEventListener('keydown', (e) => e.key === 'Enter' && add());
  return h('div', { class: 'toolbar no-print' }, hora, input, dl, h('button', { class: 'btn', onclick: add }, 'Adicionar à agenda'));
}

function ensureToday(app) {
  if (app.state.agenda.date !== app.ref) app.state.agenda = { date: app.ref, items: [] };
}

function patientCard(app, item, p, i) {
  const remove = h(
    'button',
    {
      class: 'btn sm ghost no-print',
      title: 'Retirar da agenda',
      'aria-label': 'Retirar da agenda',
      onclick: () => {
        app.state.agenda.items.splice(i, 1);
        app.save();
        app.render();
      },
    },
    '✕',
  );
  if (!p) {
    return h('div', { class: 'pc-card unknown' }, h('div', { class: 'pc-head' }, h('span', { class: 'hora' }, item.hora || '—'), h('span', { class: 'nome' }, `Utente ${item.id}`), h('span', { class: 'muted' }, 'não está na lista importada'), h('span', { style: { marginLeft: 'auto' } }, remove)));
  }
  const ev = patientChecklist(app.state, p, app.ref);
  const missing = ev.filter((e) => !e.ok);
  const okItems = ev.filter((e) => e.ok);
  const indicators = new Set(ev.map((e) => e.rule.indicator).filter(Boolean));
  const missInd = new Set(missing.map((e) => e.rule.indicator).filter(Boolean));
  return h(
    'div',
    { class: ['pc-card', missing.length && 'has-gaps'] },
    h(
      'div',
      { class: 'pc-head' },
      h('span', { class: 'hora' }, item.hora || '—'),
      h('span', { class: 'nome' }, p.nome || p.id),
      h('span', { class: 'muted' }, `${ageAt(p.nasc, app.ref) ?? '?'} anos · ${p.sexo || '—'} · ${p.id}`),
      item.tipo ? h('span', { class: 'badge info' }, item.tipo) : null,
      h('span', { style: { marginLeft: 'auto' } }, remove),
    ),
    h(
      'div',
      { class: 'small muted' },
      p.problemas.length ? `Problemas: ${p.problemas.join(', ')}` : 'Sem problemas codificados',
      ' · ',
      indicators.size ? `Conta para ${indicators.size} indicador${indicators.size > 1 ? 'es' : ''}` : 'Não conta para indicadores configurados',
      missInd.size ? h('strong', { style: { color: 'var(--bad)' } }, ` · ${missInd.size} com falhas`) : '',
      p.ultimaConsulta ? ` · última consulta ${fmt.date(p.ultimaConsulta)}` : '',
    ),
    h(
      'div',
      { class: 'pc-items' },
      missing.map((m) =>
        h(
          'span',
          { class: 'pc-item', title: m.last ? `Último registo: ${fmt.date(m.last)}` : 'Sem registo' },
          `${m.rule.name}${m.last ? ' (' + fmt.date(m.last) + ')' : ' (nunca)'}`,
          m.rule.indicator ? h('span', { class: 'small' }, `· ${m.rule.indicator}`) : null,
          h(
            'button',
            {
              title: 'Feito hoje',
              'aria-label': `Marcar ${m.rule.name} como feito hoje`,
              onclick: () => {
                markDone(app, p.id, m.rule.id);
                app.render();
              },
            },
            '✓ feito',
          ),
        ),
      ),
      okItems.map((m) => h('span', { class: 'pc-item ok', title: `Último registo: ${fmt.date(m.last)}` }, `✓ ${m.rule.name}`)),
      !ev.length ? h('span', { class: 'muted small' }, 'Nenhuma regra aplicável.') : null,
    ),
  );
}

export function render(app) {
  const page = h('div', { class: 'page' });
  const idx = patientIndex(app.state);
  const ag = app.state.agenda;
  const isToday = ag.date === app.ref;
  const items = isToday ? ag.items : [];
  page.append(
    h(
      'div',
      { class: 'page-head' },
      h('div', null, h('h1', null, 'Pré-consulta'), h('p', null, `Agenda de ${fmt.date(app.ref)} — o que fechar em cada consulta.`)),
      h(
        'div',
        { class: 'toolbar' },
        h('button', { class: 'btn', onclick: () => importAgendaFlow(app) }, 'Importar agenda (CSV/Excel)'),
        items.length ? h('button', { class: 'btn', onclick: () => window.api.print() }, 'Imprimir') : null,
        items.length ? h('button', { class: 'btn', onclick: () => window.api.savePDF({ defaultName: `pre-consulta-${app.ref}.pdf` }).then((n) => n && toast(`PDF gravado: ${n}`)) }, 'Guardar PDF') : null,
        items.length
          ? h(
              'button',
              {
                class: 'btn ghost',
                onclick: async () => {
                  if (await confirmDialog('Limpar agenda', 'Retirar todos os utentes da agenda de hoje?', 'Limpar')) {
                    app.state.agenda = { date: app.ref, items: [] };
                    app.save();
                    app.render();
                  }
                },
              },
              'Limpar agenda',
            )
          : null,
      ),
    ),
    h('div', { class: 'print-only' }, h('h2', null, `Pré-consulta — ${fmt.date(app.ref)}`), h('p', { class: 'small' }, 'Documento com dados pessoais de saúde: não deixe impresso em locais acessíveis.')),
  );
  if (!app.state.patients.length) {
    page.append(empty('Importe primeiro a lista de utentes para cruzar a agenda com os cuidados em falta.', h('div', { class: 'toolbar', style: { justifyContent: 'center' } }, h('button', { class: 'btn primary', onclick: () => app.go('importar') }, 'Importar lista de utentes'), h('button', { class: 'btn', onclick: () => loadDemo(app) }, 'Dados de demonstração'))));
    return page;
  }
  page.append(addPatientsForm(app, idx));
  if (!items.length) {
    page.append(empty(ag.date && !isToday ? `A última agenda importada era de ${fmt.date(ag.date)}. Importe ou adicione os utentes de hoje.` : 'Sem utentes na agenda de hoje. Importe a agenda ou adicione utentes pelo número.'));
    return page;
  }
  const evs = items.map((it) => idx.get(String(it.id)));
  const withGaps = evs.filter((p) => p && patientChecklist(app.state, p, app.ref).some((e) => !e.ok)).length;
  page.append(h('p', { class: 'muted', style: { margin: '14px 0 10px' } }, `${items.length} consultas · ${withGaps} com cuidados em falta`), h('div', { class: 'pc-list' }, items.map((it, i) => patientCard(app, it, evs[i], i))));
  return page;
}

