// Pequenos utilitários de interface: criar elementos, ícones, folhas (bottom sheets), avisos.

/** Cria um elemento. h('button', { class: 'btn', onclick: fn }, 'Texto') */
export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  const later = []; // 'value' só pode ser definido depois das <option> existirem
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'value') { later.push(v); continue; }
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k in el && !['list', 'type', 'form'].includes(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  if (later.length) el.value = later[0];
  return el;
}

function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k === null || k === undefined || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

// Ícones (traço simples, estilo "lucide").
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5"/><path d="M12 13v8"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.6 12.4a1.5 1.5 0 0 0 1.5 1.1h9.2a1.5 1.5 0 0 0 1.5-1.2L21.5 8H6"/>',
  chef: '<path d="M6 13.9A4 4 0 0 1 7.5 6a5 5 0 0 1 9 0A4 4 0 0 1 18 13.9V20H6z"/><path d="M6 17h12"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8v8M10 8v8M13 8v8M17 8v8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4"/>',
  camera: '<path d="M3 8a2 2 0 0 1 2-2h2l2-3h6l2 3h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="4"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21h4"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3"/>',
  tag: '<path d="M3 3h8l10 10-8 8L3 11z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  chart: '<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6" rx="1"/><rect x="12" y="7" width="3" height="11" rx="1"/><rect x="17" y="10" width="3" height="8" rx="1"/>',
  receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13 7 4 4"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  sparkles: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  store: '<path d="M3 9 5 3h14l2 6"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M5 12v9h14v-9"/>',
  chevronL: '<path d="m15 6-6 6 6 6"/>',
  chevronR: '<path d="m9 6 6 6-6 6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  open: '<path d="M7 11V7a5 5 0 0 1 9.9-1"/><rect x="4" y="11" width="16" height="10" rx="2"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  leaf: '<path d="M5 21c0-9 6-15 16-16-1 10-7 16-16 16z"/><path d="M5 21 14 12"/>',
};

export function icon(name, size = 20) {
  return h('span', {
    class: 'icon',
    'aria-hidden': 'true',
    html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`,
  });
}

// ---------- Formatação ----------
export const fmtQty = (n) => (n === null || n === undefined || isNaN(n) ? '0' : Number(Number(n).toFixed(3)).toLocaleString('pt-PT'));
const money = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
export const fmtMoney = (n) => (n === null || n === undefined || isNaN(n) ? '—' : money.format(n));
export const fmtDate = (d) => (d ? new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

export function timeAgo(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'ontem' : `há ${d} dias`;
}

// ---------- Avisos (toasts) ----------
export function toast(msg, { action, onAction, type = '', ms = 3500 } = {}) {
  const box = document.getElementById('toasts');
  const el = h('div', { class: `toast ${type}` }, h('span', {}, msg),
    action && h('button', { onclick: () => { onAction?.(); el.remove(); } }, action));
  box.append(el);
  setTimeout(() => el.classList.add('out'), ms);
  setTimeout(() => el.remove(), ms + 400);
}

// ---------- Folhas (painéis que sobem do fundo) ----------
/** Abre uma folha. Devolve { close, body }. */
export function sheet(title, content, { full = false, onClose } = {}) {
  const dlg = h('dialog', { class: 'sheet' + (full ? ' full' : '') });
  const close = () => { if (dlg.open) dlg.close(); };
  const body = h('div', { class: 'sheet-body' });
  dlg.append(
    h('div', { class: 'sheet-head' },
      h('div', { class: 'grab' }),
      h('h2', {}, title),
      h('button', { class: 'icon-btn', 'aria-label': 'Fechar', onclick: close }, icon('x'))),
    body,
  );
  append(body, [typeof content === 'function' ? content(close) : content]);
  dlg.addEventListener('close', () => { onClose?.(); setTimeout(() => dlg.remove(), 250); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  document.body.append(dlg);
  dlg.showModal();
  return { close, body, dialog: dlg };
}

export function confirmSheet(text, { ok = 'Confirmar', danger = false } = {}) {
  return new Promise((resolve) => {
    let answer = false;
    sheet('Confirmar', (close) => h('div', { class: 'stack' },
      h('p', {}, text),
      h('div', { class: 'row-end' },
        h('button', { class: 'btn ghost', onclick: close }, 'Cancelar'),
        h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => { answer = true; close(); } }, ok))),
    { onClose: () => resolve(answer) });
  });
}

/** Campo de formulário com rótulo. */
export function field(label, input, hint) {
  return h('label', { class: 'field' }, h('span', {}, label), input, hint && h('small', {}, hint));
}

/** Botões − valor + */
export function stepper(value, onChange, { step = 1, min = 0, label = '' } = {}) {
  const out = h('span', { class: 'stepper-val' }, fmtQty(value) + (label ? ' ' + label : ''));
  return h('div', { class: 'stepper' },
    h('button', { type: 'button', 'aria-label': 'Menos', onclick: (e) => { e.stopPropagation(); onChange(Math.max(min, +(value - step).toFixed(3))); } }, icon('minus', 18)),
    out,
    h('button', { type: 'button', 'aria-label': 'Mais', onclick: (e) => { e.stopPropagation(); onChange(+(value + step).toFixed(3)); } }, icon('plus', 18)));
}

export function empty(emoji, title, text, action) {
  return h('div', { class: 'empty' }, h('div', { class: 'empty-emoji' }, emoji), h('h3', {}, title), text && h('p', {}, text), action);
}

/** Lê e grava preferências deste dispositivo. */
export const prefs = {
  get(key, def) { try { const v = localStorage.getItem('despensa.pref.' + key); return v === null ? def : JSON.parse(v); } catch { return def; } },
  set(key, val) { try { localStorage.setItem('despensa.pref.' + key, JSON.stringify(val)); } catch { /* sem armazenamento */ } },
};
