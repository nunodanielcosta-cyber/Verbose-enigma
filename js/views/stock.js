// Stock: tudo o que há em casa, com pesquisa e filtros.
import { h, icon, empty, prefs } from '../ui.js';
import { store } from '../store.js';
import { GROUPS, normalize, expiryStatus, effectiveExpiry, isTracked } from '../domain.js';
import { productRow, openProductForm, warnDays } from './product.js';

export default {
  id: 'stock',
  title: 'Stock',
  mount(root) {
    const fromLink = new URLSearchParams(location.hash.split('?')[1] || '').get('f') || ''; // ex.: #/stock?f=exp vindo do início
    const state = { q: '', grp: fromLink ? '' : prefs.get('stock.grp', ''), loc: '', sort: prefs.get('stock.sort', 'name'), filter: fromLink };
    const search = h('input', { type: 'search', placeholder: 'Procurar produto, marca, local…', oninput: (e) => { state.q = e.target.value; draw(); } });
    const chips = h('div', { class: 'chip-scroll' });
    const filters = h('div', { class: 'filters' });
    const list = h('div', { class: 'list-groups' });
    root.append(
      h('div', { class: 'searchbar' }, icon('search', 18), search),
      chips, filters, list);

    function draw() {
      const all = store.all('products');
      const count = (g) => all.filter((p) => p.grp === g).length;
      chips.replaceChildren(
        chip('', 'Tudo', all.length),
        ...GROUPS.filter((g) => count(g.id)).map((g) => chip(g.id, g.emoji + ' ' + g.label, count(g.id))));

      const locs = [...new Set(all.map((p) => p.location).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt'));
      filters.replaceChildren(
        h('select', { 'aria-label': 'Local', value: state.loc, onchange: (e) => { state.loc = e.target.value; draw(); } },
          h('option', { value: '' }, '📍 Todos os locais'), locs.map((l) => h('option', { value: l }, l))),
        h('select', { 'aria-label': 'Mostrar', value: state.filter, onchange: (e) => { state.filter = e.target.value; draw(); } },
          h('option', { value: '' }, 'Mostrar tudo'), h('option', { value: 'low' }, 'No mínimo'), h('option', { value: 'exp' }, 'A expirar'),
          h('option', { value: 'open' }, 'Abertos'), h('option', { value: 'out' }, 'Esgotados')),
        h('select', { 'aria-label': 'Ordenar', value: state.sort, onchange: (e) => { state.sort = e.target.value; prefs.set('stock.sort', state.sort); draw(); } },
          h('option', { value: 'name' }, '↕ Nome'), h('option', { value: 'expiry' }, '↕ Validade'), h('option', { value: 'level' }, '↕ Stock'), h('option', { value: 'recent' }, '↕ Recentes')));

      const q = normalize(state.q);
      const wd = warnDays();
      let items = all.filter((p) =>
        (!state.grp || p.grp === state.grp) && (!state.loc || p.location === state.loc) &&
        (!q || normalize([p.name, p.brand, p.category, p.location, p.barcode].join(' ')).includes(q)) &&
        (!state.filter ||
          (state.filter === 'low' && isTracked(p) && p.qty <= p.min) ||
          (state.filter === 'exp' && ['soon', 'past'].includes(expiryStatus(p, wd)?.level)) ||
          (state.filter === 'open' && p.opened_at) ||
          (state.filter === 'out' && !(p.qty > 0))));
      const sorters = {
        name: (a, b) => a.name.localeCompare(b.name, 'pt'),
        expiry: (a, b) => (effectiveExpiry(a) || '9999').localeCompare(effectiveExpiry(b) || '9999'),
        level: (a, b) => ratio(a) - ratio(b),
        recent: (a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''),
      };
      items.sort(sorters[state.sort]);

      if (!all.length) {
        return list.replaceChildren(empty('🧺', 'A despensa está vazia', 'Lê o código de barras de um produto ou adiciona-o à mão.',
          h('button', { class: 'btn primary', onclick: () => openProductForm() }, icon('plus', 18), 'Adicionar produto')));
      }
      if (!items.length) return list.replaceChildren(empty('🔎', 'Nada encontrado', 'Experimenta outros filtros.'));

      // Agrupar por categoria (ordem alfabética) quando ordenado por nome; senão lista simples.
      if (state.sort === 'name') {
        const groups = new Map();
        for (const p of items) {
          const k = p.category || 'Sem categoria';
          if (!groups.has(k)) groups.set(k, []);
          groups.get(k).push(p);
        }
        const keys = [...groups.keys()].sort((a, b) => (a === 'Sem categoria') - (b === 'Sem categoria') || a.localeCompare(b, 'pt'));
        list.replaceChildren(...keys.map((k) => h('section', {},
          h('div', { class: 'group-title' }, k, h('span', {}, groups.get(k).length)),
          h('div', { class: 'card list' }, groups.get(k).map((p) => productRow(p))))));
      } else {
        list.replaceChildren(h('div', { class: 'card list' }, items.map((p) => productRow(p))));
      }
    }

    function chip(id, label, n) {
      return h('button', { class: 'fchip' + (state.grp === id ? ' on' : ''), onclick: () => { state.grp = id; prefs.set('stock.grp', id); draw(); } }, label, h('span', {}, n));
    }

    draw();
    return { update: draw, fab: () => openProductForm() };
  },
};

const ratio = (p) => (isTracked(p) ? (p.qty || 0) / Math.max(p.max || p.min || 1, 1) : 9);
