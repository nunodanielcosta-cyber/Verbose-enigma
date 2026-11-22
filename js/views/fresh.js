// Frutas e legumes: grelha de ícones para arrumar (+1) ou gastar (−1) com um toque.
import { h, icon, sheet, toast, fmtQty, prefs } from '../ui.js';
import { store } from '../store.js';
import { normalize, expiryStatus } from '../domain.js';
import { PRODUCE, productFromCatalog } from '../produce.js';
import { restock, openProduct, warnDays } from './product.js';

export function openFresh() {
  let mode = prefs.get('fresh.mode', 'add');
  let q = '';
  const grid = h('div', { class: 'fresh-grid' });
  const seg = h('div', { class: 'seg' });

  const drawSeg = () => seg.replaceChildren(...[['add', 'Arrumar  +1', 'plus'], ['use', 'Gastar  −1', 'minus']].map(([id, label, ic]) =>
    h('button', { class: mode === id ? 'on' : '', onclick: () => { mode = id; prefs.set('fresh.mode', id); drawSeg(); draw(); } }, icon(ic, 16), label)));

  function findProduct(item) {
    const n = normalize(item.name);
    return store.all('products').find((p) => normalize(p.name) === n);
  }

  function tap(item) {
    let p = findProduct(item);
    if (mode === 'add') {
      if (!p) p = store.insert('products', productFromCatalog(item));
      const step = p.unit === 'kg' ? 0.5 : 1;
      restock(p, step, null);
    } else {
      if (!p || !(p.qty > 0)) return toast(`Não há ${item.name.toLowerCase()} em casa`);
      store.changeQty(p, -Math.min(p.unit === 'kg' ? 0.5 : 1, p.qty));
    }
    navigator.vibrate?.(30);
  }

  function draw() {
    const nq = normalize(q);
    const wd = warnDays();
    const items = PRODUCE.filter((i) => !nq || normalize(i.name + ' ' + i.alias.join(' ')).includes(nq));
    // os que já existem em casa primeiro
    items.sort((a, b) => (findProduct(b)?.qty > 0) - (findProduct(a)?.qty > 0));
    grid.replaceChildren(...items.map((item) => {
      const p = findProduct(item);
      const st = p && expiryStatus(p, wd);
      return h('button', {
        class: 'fresh' + (p?.qty > 0 ? ' has' : '') + (st && st.level !== 'ok' ? ' ' + st.level : ''),
        onclick: () => tap(item),
        oncontextmenu: (e) => { e.preventDefault(); if (p) openProduct(p.id); },
        title: p ? `${item.name}: ${fmtQty(p.qty)} ${p.unit}${st?.text ? ' · ' + st.text : ''}` : item.name,
      },
      h('span', { class: 'fresh-emoji' }, item.emoji),
      h('span', { class: 'fresh-name' }, item.name),
      p?.qty > 0 && h('span', { class: 'fresh-qty' }, `${fmtQty(p.qty)}${p.unit === 'un' ? '' : ' ' + p.unit}`),
      st && st.level !== 'ok' && h('span', { class: 'fresh-warn' }, '⏳'));
    }));
  }

  const off = store.on(() => draw());
  sheet('Frutas e legumes', h('div', { class: 'stack' },
    seg,
    h('div', { class: 'searchbar' }, icon('search', 18), h('input', { type: 'search', placeholder: 'Procurar…', oninput: (e) => { q = e.target.value; draw(); } })),
    grid,
    h('p', { class: 'muted small' }, 'Toca para somar ou tirar. Mantém o dedo (ou clique direito) para ver a ficha e acertar mínimo, máximo ou quanto tempo dura. A validade é calculada sozinha ao arrumar.')),
  { full: true, onClose: off });
  drawSeg();
  draw();
}
