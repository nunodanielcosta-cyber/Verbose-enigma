// Pequenos utilitários de interface (sem dependências externas).

import { formatDate, formatPeriod } from '../core/dates.js';

export function h(tag, props, ...children) {
  const el = tag === 'svg' || props?.svg ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false || k === 'svg') continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.setAttribute('class', Array.isArray(v) ? v.filter(Boolean).join(' ') : v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'value' && 'value' in el && !(el instanceof SVGElement)) el.value = v;
    else if (k === 'checked' || k === 'selected' || k === 'disabled') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false || c === true) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** Elemento SVG (atalho). */
export function s(tag, props, ...children) {
  return h(tag, { ...props, svg: true }, ...children);
}

const nf = (d) => new Intl.NumberFormat('pt-PT', { minimumFractionDigits: d, maximumFractionDigits: d });

export const fmt = {
  num: (v, d = 0) => (v === null || v === undefined || !isFinite(v) ? '—' : nf(d).format(v)),
  val: (v, ind, d = 1) => (v === null || v === undefined ? '—' : nf(d).format(v) + (ind?.unit === '‰' ? ' ‰' : ind?.unit === '%' || !ind?.unit ? '%' : ' ' + ind.unit)),
  date: (iso) => (iso ? formatDate(iso) : '—'),
  period: (p) => formatPeriod(p),
  signed: (v, d = 1) => (v === null || v === undefined || !isFinite(v) ? '—' : (v > 0 ? '+' : '') + nf(d).format(v)),
};

export const STATUS_LABEL = { esperado: 'Esperado', aceitavel: 'Aceitável', fora: 'Fora', 'sem-dados': 'Sem dados' };

export function badge(text, kind = '') {
  return h('span', { class: `badge ${kind}` }, text);
}

export function statusBadge(st) {
  return badge(STATUS_LABEL[st] || st, `st-${st}`);
}

export function card(title, ...body) {
  return h('section', { class: 'card' }, title ? h('h3', null, title) : null, ...body);
}

export function kpi(label, value, sub, kind = '') {
  return h('div', { class: `kpi ${kind}` }, h('div', { class: 'kpi-label' }, label), h('div', { class: 'kpi-value' }, value), sub ? h('div', { class: 'kpi-sub' }, sub) : null);
}

export function empty(text, ...extra) {
  return h('div', { class: 'empty' }, h('p', null, text), ...extra);
}

let toastTimer;
export function toast(msg, kind = 'ok') {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(el);
  }
  el.className = `show ${kind}`;
  el.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = ''), kind === 'error' ? 6000 : 3000);
}

/** Janela modal. actions: [{label, value, kind}] — devolve o value da ação escolhida (ou null). */
export function modal(title, body, actions = [{ label: 'Fechar', value: null }], { wide = false } = {}) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const close = (v) => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close(null);
    };
    const btns = actions.map((a) => h('button', { class: `btn ${a.kind || ''}`, onclick: () => close(typeof a.value === 'function' ? a.value() : a.value) }, a.label));
    const overlay = h(
      'div',
      { class: 'overlay', onmousedown: (e) => e.target === overlay && close(null) },
      h('div', { class: `dialog ${wide ? 'wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, h('h2', null, title), h('div', { class: 'dialog-body' }, body), h('div', { class: 'dialog-actions' }, btns)),
    );
    document.body.append(overlay);
    document.addEventListener('keydown', onKey);
    (overlay.querySelector('input,select,textarea') || btns[btns.length - 1])?.focus();
  });
}

export function confirmDialog(title, text, okLabel = 'Confirmar', danger = false) {
  return modal(title, h('p', null, text), [
    { label: 'Cancelar', value: false },
    { label: okLabel, value: true, kind: danger ? 'danger' : 'primary' },
  ]);
}

export function field(label, input, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input, hint ? h('span', { class: 'hint' }, hint) : null);
}

export function select(options, value, onchange, props = {}) {
  return h(
    'select',
    { ...props, onchange: (e) => onchange(e.target.value) },
    options.map((o) => {
      const [v, l] = Array.isArray(o) ? o : [o, o];
      return h('option', { value: v, selected: String(v) === String(value ?? '') }, l);
    }),
  );
}

/** Tabela simples com paginação ("mostrar mais"). */
export function table(columns, rows, { limit = 200, rowClass, onRow, emptyText = 'Sem resultados.' } = {}) {
  const wrap = h('div', { class: 'table-wrap' });
  let shown = limit;
  const draw = () => {
    wrap.replaceChildren();
    if (!rows.length) {
      wrap.append(h('p', { class: 'muted pad' }, emptyText));
      return;
    }
    const t = h(
      'table',
      null,
      h('thead', null, h('tr', null, columns.map((c) => h('th', { class: c.class, style: c.width ? { width: c.width } : null }, c.label)))),
      h(
        'tbody',
        null,
        rows.slice(0, shown).map((r, i) =>
          h(
            'tr',
            { class: rowClass?.(r), onclick: onRow ? () => onRow(r, i) : null, tabindex: onRow ? 0 : null, onkeydown: onRow ? (e) => e.key === 'Enter' && onRow(r, i) : null },
            columns.map((c) => h('td', { class: c.class }, c.render ? c.render(r, i) : r[c.key])),
          ),
        ),
      ),
    );
    wrap.append(t);
    if (rows.length > shown) {
      wrap.append(h('div', { class: 'more' }, h('button', { class: 'btn', onclick: () => ((shown += limit), draw()) }, `Mostrar mais (${rows.length - shown} restantes)`)));
    }
  };
  draw();
  return wrap;
}

export function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}
