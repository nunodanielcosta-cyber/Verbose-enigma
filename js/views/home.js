// Início: resumo do dia — o que expira, o que falta, refeições de hoje e atividade da família.
import { h, icon, fmtMoney, empty } from '../ui.js';
import { store } from '../store.js';
import { expiryStatus, useFirst, isTracked, todayISO, MEALS, effectiveExpiry } from '../domain.js';
import { productRow, warnDays, eventRow, openProductForm } from './product.js';
import { openRecipe } from './recipes.js';
import { currentList } from './shopping.js';
import { openScanner } from '../scanner.js';
import { openFresh } from './fresh.js';

export default {
  id: 'home',
  title: 'Início',
  mount(root) {
    const box = h('div', { class: 'stack lg' });
    root.append(box);

    function draw() {
      const products = store.all('products');
      const wd = warnDays();
      const expiring = products.filter((p) => ['soon', 'past'].includes(expiryStatus(p, wd)?.level))
        .sort((a, b) => (effectiveExpiry(a) || '').localeCompare(effectiveExpiry(b) || ''));
      const low = products.filter((p) => isTracked(p) && p.qty <= p.min);
      const list = currentList();
      const today = todayISO();
      const meals = store.all('meal_plan').filter((m) => m.day === today);
      const first = useFirst(store.all('recipes'), products, wd).slice(0, 4);
      const month = today.slice(0, 7);
      const spent = store.all('events').filter((e) => e.type === 'buy' && e.at.slice(0, 7) === month).reduce((s, e) => s + (Number(e.price) || 0), 0);
      const activity = store.all('events').sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
      const hour = new Date().getHours();
      const hello = hour < 6 ? 'Boa noite' : hour < 13 ? 'Bom dia' : hour < 20 ? 'Boa tarde' : 'Boa noite';

      if (!products.length) {
        return box.replaceChildren(
          h('div', { class: 'greet' }, h('h2', {}, `${hello}, ${store.ctx.userName}!`)),
          empty('🧺', 'Vamos encher a despensa', 'Começa por ler os códigos de barras do que tens em casa. Também podes adicionar à mão.',
            h('div', { class: 'row center' },
              h('button', { class: 'btn primary', onclick: () => openScanner({ mode: 'add' }) }, icon('scan', 18), 'Ler códigos'),
              h('button', { class: 'btn soft', onclick: () => openFresh() }, '🥕 Fruta e legumes'),
              h('button', { class: 'btn soft', onclick: () => openProductForm() }, icon('plus', 18), 'À mão'))));
      }

      box.replaceChildren(...[
        h('div', { class: 'greet' }, h('h2', {}, `${hello}, ${store.ctx.userName}!`), h('p', { class: 'muted' }, store.ctx.household?.name || '')),
        h('div', { class: 'stats' },
          stat('A expirar', expiring.length, 'clock', expiring.length ? 'warn' : '', '#/stock?f=exp'),
          stat('Para comprar', list.length, 'cart', low.length ? 'accent' : '', '#/shopping'),
          stat('Gasto este mês', spent ? fmtMoney(spent) : '—', 'chart', '', '#/more')),
        meals.length > 0 && section('Hoje', 'calendar', h('div', { class: 'card list' }, meals.map((m) => {
          const r = store.get('recipes', m.recipe_id);
          return h('div', { class: 'event', onclick: () => r && openRecipe(r.id, m) },
            h('span', { class: 'chip info' }, MEALS.find((x) => x.id === m.meal)?.label), h('span', { class: 'grow strong' }, r?.name || '?'),
            m.cooked ? icon('check', 18) : icon('chevronR', 18));
        }))),
        expiring.length > 0 && section('Usar ou deitar fora', 'alert', h('div', { class: 'card list' }, expiring.slice(0, 5).map((p) => productRow(p, { compact: true }))),
          expiring.length > 5 && h('a', { class: 'link small', href: '#/stock' }, `Ver todos (${expiring.length})`)),
        first.length > 0 && section('Receitas para aproveitar', 'leaf', h('div', { class: 'hscroll' }, first.map(({ recipe, uses, status }) =>
          h('div', { class: 'mini-card', onclick: () => openRecipe(recipe.id) },
            h('div', { class: 'strong' }, recipe.name),
            h('div', { class: 'small warn-text' }, 'Usa ' + uses.map((u) => u.name).join(', ')),
            h('div', { class: 'small muted' }, status.missing ? `Faltam ${status.missing}` : 'Tens tudo'))))),
        low.length > 0 && section('Chegaram ao mínimo', 'cart', h('div', { class: 'card list' }, low.slice(0, 5).map((p) => productRow(p, { compact: true })))),
        activity.length > 0 && section('Atividade da família', 'users', h('div', { class: 'card list' }, activity.map(eventRow))),
      ].filter(Boolean));
    }

    draw();
    return { update: draw };
  },
};

function stat(label, value, ic, cls, href) {
  return h('a', { class: 'stat ' + cls, href }, h('div', { class: 'stat-icon' }, icon(ic, 18)), h('div', { class: 'stat-val' }, value), h('div', { class: 'stat-label' }, label));
}

function section(title, ic, ...content) {
  return h('section', { class: 'stack' }, h('div', { class: 'section-title' }, icon(ic, 18), ' ', title), ...content);
}
