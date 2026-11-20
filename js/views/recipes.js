// Receitas e plano semanal de refeições.
import { h, icon, sheet, field, toast, fmtQty, empty, confirmSheet, prefs, stepper } from '../ui.js';
import { store } from '../store.js';
import { recipeStatus, useFirst, MEALS, todayISO, addDays, convertToProduct, planNeeds, normalize, UNITS } from '../domain.js';
import { warnDays } from './product.js';

const DAY = new Intl.DateTimeFormat('pt-PT', { weekday: 'short', day: 'numeric' });
const LONG = new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });
const dayLabel = (iso) => DAY.format(new Date(iso + 'T00:00:00'));

export default {
  id: 'recipes',
  title: 'Receitas',
  mount(root) {
    let tab = prefs.get('recipes.tab', 'plan');
    let weekStart = mondayOf(todayISO());
    let q = '';
    const tabs = h('div', { class: 'seg big' });
    const body = h('div');
    root.append(tabs, body);

    function draw() {
      tabs.replaceChildren(...[['plan', 'Plano da semana', 'calendar'], ['list', 'Receitas', 'chef']].map(([id, label, ic]) =>
        h('button', { class: tab === id ? 'on' : '', onclick: () => { tab = id; prefs.set('recipes.tab', id); draw(); } }, icon(ic, 16), label)));
      body.replaceChildren(tab === 'plan' ? drawPlan() : drawList());
    }

    function drawList() {
      const recipes = store.all('recipes');
      const products = store.all('products');
      const first = useFirst(recipes, products, warnDays());
      const nq = normalize(q);
      const filtered = recipes.filter((r) => !nq || normalize([r.name, ...(r.tags || []), ...(r.ingredients || []).map((i) => i.name)].join(' ')).includes(nq))
        .map((r) => ({ r, st: recipeStatus(r, products) }))
        .sort((a, b) => a.st.missing - b.st.missing || a.r.name.localeCompare(b.r.name, 'pt'));
      return h('div', { class: 'stack' },
        h('div', { class: 'searchbar' }, icon('search', 18), h('input', { type: 'search', placeholder: 'Procurar receita ou ingrediente', value: q, oninput: (e) => { q = e.target.value; const pos = e.target.selectionStart; draw(); const i = body.querySelector('input[type=search]'); i.focus(); i.setSelectionRange(pos, pos); } })),
        first.length > 0 && !q && h('div', { class: 'stack' },
          h('div', { class: 'section-title' }, icon('leaf', 18), ' Usar primeiro'),
          h('div', { class: 'hscroll' }, first.slice(0, 6).map(({ recipe, uses }) => h('div', { class: 'mini-card', onclick: () => openRecipe(recipe.id) },
            h('div', { class: 'strong' }, recipe.name),
            h('div', { class: 'small warn-text' }, 'Usa ' + uses.map((u) => u.name).join(', ')))))),
        recipes.length ? h('div', { class: 'recipe-grid' }, filtered.map(({ r, st }) => recipeCard(r, st)))
          : empty('👩‍🍳', 'Ainda sem receitas', 'Guarda as receitas da família e a app calcula o que falta comprar.'),
      );
    }

    function drawPlan() {
      const plan = store.all('meal_plan');
      const recipes = new Map(store.all('recipes').map((r) => [r.id, r]));
      const days = [...Array(7)].map((_, i) => addDays(weekStart, i));
      const { needs, loose } = planNeeds(store.all('products'), store.all('recipes'), plan, { from: weekStart, days: 7 });
      const products = new Map(store.all('products').map((p) => [p.id, p]));
      const missing = [...needs].filter(([id, n]) => (products.get(id)?.qty || 0) < n.qty - 1e-9).length + loose.size;
      return h('div', { class: 'stack' },
        h('div', { class: 'week-nav' },
          h('button', { class: 'icon-btn', 'aria-label': 'Semana anterior', onclick: () => { weekStart = addDays(weekStart, -7); draw(); } }, icon('chevronL')),
          h('div', { class: 'center' }, h('div', { class: 'strong' }, weekStart === mondayOf(todayISO()) ? 'Esta semana' : `Semana de ${dayLabel(weekStart)}`),
            h('div', { class: 'muted small' }, `${dayLabel(days[0])} – ${dayLabel(days[6])}`)),
          h('button', { class: 'icon-btn', 'aria-label': 'Semana seguinte', onclick: () => { weekStart = addDays(weekStart, 7); draw(); } }, icon('chevronR'))),
        h('div', { class: 'tip' }, icon('cart', 18), h('div', { class: 'grow' }, missing
          ? h('span', {}, h('strong', {}, `${missing} ingrediente(s) em falta`), ' para as refeições planeadas. Já estão na lista de compras.')
          : 'Tens tudo o que precisas para as refeições planeadas.'),
        missing > 0 && h('a', { class: 'btn small', href: '#/shopping' }, 'Ver lista')),
        ...days.map((d) => h('div', { class: 'day' + (d === todayISO() ? ' today' : '') },
          h('div', { class: 'day-label' }, LONG.format(new Date(d + 'T00:00:00'))),
          h('div', { class: 'meals' }, MEALS.map((m) => {
            const entries = plan.filter((e) => e.day === d && e.meal === m.id);
            return h('div', { class: 'meal' },
              h('div', { class: 'meal-name' }, m.label),
              ...entries.map((e) => {
                const r = recipes.get(e.recipe_id);
                return h('div', { class: 'meal-entry' + (e.cooked ? ' done' : ''), onclick: () => r && openRecipe(r.id, e) },
                  h('span', { class: 'grow' }, r?.name || e.note || '?'), h('span', { class: 'muted small' }, `${e.servings || r?.servings || ''} p.`),
                  e.cooked && icon('check', 16));
              }),
              h('button', { class: 'meal-add', onclick: () => pickRecipe(d, m.id) }, icon('plus', 16), entries.length ? '' : 'Adicionar'));
          })))));
    }

    draw();
    return { update: draw, fab: () => (tab === 'plan' ? pickRecipe(todayISO(), 'jantar') : openRecipeForm()) };
  },
};

function mondayOf(iso) {
  const d = new Date(iso + 'T00:00:00');
  const dow = (d.getDay() + 6) % 7;
  return addDays(iso, -dow);
}

function recipeCard(r, st) {
  const label = st.missing ? `Faltam ${st.missing}` : st.unknown === st.rows.length && st.rows.length ? 'Ingredientes por ligar' : 'Tens tudo';
  return h('div', { class: 'recipe-card', onclick: () => openRecipe(r.id) },
    h('div', { class: 'recipe-emoji' }, emojiFor(r)),
    h('div', { class: 'strong' }, r.name),
    h('div', { class: 'muted small' }, `${r.servings} pessoas · ${(r.ingredients || []).length} ingredientes`),
    h('div', { class: 'chips' }, h('span', { class: 'chip ' + (st.missing ? 'warn' : 'ok') }, label), (r.tags || []).slice(0, 2).map((t) => h('span', { class: 'chip' }, t))));
}

function emojiFor(r) {
  const t = normalize(r.name + ' ' + (r.tags || []).join(' '));
  const map = [['bolo|sobremesa|doce', '🍰'], ['sopa|caldo', '🍲'], ['peixe|bacalhau|atum|salmao|pescada', '🐟'], ['frango|peru', '🍗'], ['carne|bife|porco|vaca', '🥩'], ['massa|esparguete|lasanha', '🍝'], ['arroz|risotto', '🍚'], ['salada|vegetariano|legumes', '🥗'], ['ovo|omelete', '🍳'], ['pizza', '🍕']];
  for (const [re, e] of map) if (new RegExp(re).test(t)) return e;
  return '🍽️';
}

// ---------- Receita ----------
export function openRecipe(id, planEntry = null) {
  let servings = planEntry?.servings || store.get('recipes', id)?.servings || 2;
  const s = sheet(store.get('recipes', id)?.name || 'Receita', (close) => {
    const box = h('div', { class: 'stack' });
    const draw = () => {
      const r = store.get('recipes', id);
      if (!r) return close();
      const st = recipeStatus(r, store.all('products'), servings);
      const factor = servings / (r.servings || 1);
      box.replaceChildren(...[
        h('div', { class: 'row between' }, h('span', { class: 'muted' }, 'Pessoas'), stepper(servings, (v) => { servings = Math.max(1, v); draw(); }, { min: 1 })),
        h('div', { class: 'card list' }, st.rows.map(({ ing, product, need, ok }) => h('div', { class: 'ing' },
          h('span', { class: 'ing-dot ' + (ok === null ? 'unk' : ok ? 'ok' : 'no') }, ok ? icon('check', 14) : ok === false ? icon('x', 14) : '?'),
          h('div', { class: 'grow' }, h('div', {}, ing.name || product?.name),
            h('div', { class: 'muted small' }, product ? `Em casa: ${fmtQty(product.qty)} ${product.unit}${ok === false ? ` · precisas ${fmtQty(+need.toFixed(2))}` : ''}` : 'Não ligado a nenhum produto do stock')),
          h('span', { class: 'strong' }, `${fmtQty(+((Number(ing.qty) || 0) * factor).toFixed(2))} ${ing.unit || ''}`)))),
        r.instructions && h('div', { class: 'card pad' }, h('div', { class: 'section-title' }, 'Preparação'), h('p', { class: 'pre' }, r.instructions)),
        h('div', { class: 'actions' },
          !planEntry && h('button', { class: 'btn soft', onclick: () => { close(); pickDay(r, servings); } }, icon('calendar', 18), 'Planear'),
          st.missing > 0 && h('button', { class: 'btn soft', onclick: () => { addMissing(st); } }, icon('cart', 18), 'Faltas para a lista'),
          planEntry && h('button', { class: 'btn soft', onclick: () => { store.remove('meal_plan', planEntry.id); close(); } }, icon('trash', 18), 'Tirar do plano'),
          h('button', { class: 'btn soft', onclick: () => { close(); openRecipeForm(r); } }, icon('edit', 18), 'Editar')),
        !planEntry?.cooked && h('button', { class: 'btn primary block', onclick: () => { cook(r, servings, planEntry); close(); } }, icon('chef', 18), 'Cozinhei — descontar do stock'),
      ].filter(Boolean));
    };
    draw();
    return box;
  });
  return s;
}

function addMissing(st) {
  for (const { product, need, ok } of st.rows) {
    if (ok !== false) continue;
    const qty = Math.ceil(need - product.qty);
    const ex = store.all('shopping_items').find((x) => x.product_id === product.id);
    if (ex) store.update('shopping_items', ex.id, { qty: Math.max(ex.qty, qty) });
    else store.insert('shopping_items', { product_id: product.id, name: product.name, qty, unit: product.unit, note: 'receita' });
  }
  toast('Ingredientes em falta adicionados à lista');
}

function cook(r, servings, planEntry) {
  const factor = servings / (r.servings || 1);
  let n = 0;
  for (const ing of r.ingredients || []) {
    const p = ing.product_id && store.get('products', ing.product_id);
    if (!p) continue;
    const q = convertToProduct((Number(ing.qty) || 0) * factor, ing.unit, p);
    store.changeQty(p, -Math.min(q, p.qty || 0), 'cook');
    n++;
  }
  if (planEntry) store.update('meal_plan', planEntry.id, { cooked: true });
  toast(`Bom apetite! ${n} ingredientes descontados do stock.`);
}

function pickDay(r, servings) {
  sheet('Planear ' + r.name, (close) => {
    const day = h('input', { type: 'date', value: todayISO() });
    const meal = h('select', {}, MEALS.map((m) => h('option', { value: m.id }, m.label)));
    meal.value = 'jantar';
    return h('div', { class: 'stack' }, h('div', { class: 'grid2' }, field('Dia', day), field('Refeição', meal)),
      h('button', { class: 'btn primary block', onclick: () => { store.insert('meal_plan', { day: day.value, meal: meal.value, recipe_id: r.id, servings, cooked: false }); close(); toast('Adicionado ao plano'); } }, 'Adicionar ao plano'));
  });
}

function pickRecipe(day, meal) {
  const recipes = store.all('recipes').sort((a, b) => a.name.localeCompare(b.name, 'pt'));
  const products = store.all('products');
  sheet(`${MEALS.find((m) => m.id === meal)?.label} · ${dayLabel(day)}`, (close) => h('div', { class: 'stack' },
    recipes.length ? h('div', { class: 'card list' }, recipes.map((r) => {
      const st = recipeStatus(r, products);
      return h('button', { class: 'pick', onclick: () => { store.insert('meal_plan', { day, meal, recipe_id: r.id, servings: r.servings, cooked: false }); close(); } },
        h('span', { class: 'recipe-emoji sm' }, emojiFor(r)), h('span', { class: 'grow' }, r.name),
        h('span', { class: 'chip ' + (st.missing ? 'warn' : 'ok') }, st.missing ? `faltam ${st.missing}` : 'tens tudo'));
    })) : empty('👩‍🍳', 'Sem receitas', 'Cria primeiro uma receita.'),
    h('button', { class: 'btn soft block', onclick: () => { close(); openRecipeForm(); } }, icon('plus', 18), 'Nova receita')));
}

// ---------- Formulário ----------
export function openRecipeForm(r = null) {
  const products = store.all('products').sort((a, b) => a.name.localeCompare(b.name, 'pt'));
  const ings = (r?.ingredients || []).map((i) => ({ ...i }));
  if (!ings.length) ings.push({ name: '', qty: '', unit: '', product_id: null });
  sheet(r ? 'Editar receita' : 'Nova receita', (close) => {
    const name = h('input', { required: true, value: r?.name || '', placeholder: 'Ex.: Arroz de pato' });
    const servings = h('input', { type: 'number', min: 1, value: r?.servings || 4 });
    const tags = h('input', { value: (r?.tags || []).join(', '), placeholder: 'peixe, rápido' });
    const instr = h('textarea', { rows: 5, placeholder: 'Passos da preparação…' }, r?.instructions || '');
    const list = h('div', { class: 'stack sm' });
    const drawIngs = () => list.replaceChildren(...ings.map((ing, i) => {
      const nm = h('input', {
        value: ing.name || '', placeholder: 'Ingrediente', list: 'dl-prod',
        onchange: (e) => {
          ing.name = e.target.value;
          const p = products.find((x) => x.name.toLowerCase() === ing.name.trim().toLowerCase());
          ing.product_id = p?.id || null;
          if (p && !ing.unit) { ing.unit = p.unit; drawIngs(); }
          linked.textContent = p ? '🔗' : '';
        },
      });
      const linked = h('span', { class: 'linked', title: 'Ligado ao stock' }, ing.product_id ? '🔗' : '');
      return h('div', { class: 'ing-edit' }, linked, nm,
        h('input', { type: 'number', step: 'any', min: 0, value: ing.qty ?? '', placeholder: 'Qtd', class: 'qty', oninput: (e) => { ing.qty = e.target.value; } }),
        h('input', { value: ing.unit || '', placeholder: 'un', class: 'unit', list: 'dl-units', oninput: (e) => { ing.unit = e.target.value; } }),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Remover', onclick: () => { ings.splice(i, 1); drawIngs(); } }, icon('x', 16)));
    }));
    drawIngs();
    return h('form', {
      class: 'stack', onsubmit: (e) => {
        e.preventDefault();
        const row = {
          name: name.value.trim(), servings: Math.max(1, parseInt(servings.value, 10) || 1),
          tags: tags.value.split(',').map((t) => t.trim()).filter(Boolean), instructions: instr.value.trim() || null,
          ingredients: ings.filter((i) => (i.name || '').trim()).map((i) => ({ product_id: i.product_id || null, name: i.name.trim(), qty: parseFloat(String(i.qty).replace(',', '.')) || 0, unit: (i.unit || '').trim() })),
        };
        if (r) store.update('recipes', r.id, row); else store.insert('recipes', row);
        close();
        toast(r ? 'Receita atualizada' : 'Receita criada');
      },
    },
    field('Nome', name),
    h('div', { class: 'grid2' }, field('Pessoas', servings), field('Etiquetas', tags)),
    h('div', { class: 'section-title' }, 'Ingredientes', h('span', { class: 'muted small' }, '🔗 = ligado ao stock')),
    list,
    h('button', { type: 'button', class: 'btn soft', onclick: () => { ings.push({ name: '', qty: '', unit: '', product_id: null }); drawIngs(); list.lastChild.querySelector('input:not([type=number])')?.focus(); } }, icon('plus', 18), 'Ingrediente'),
    field('Preparação', instr),
    h('datalist', { id: 'dl-prod' }, products.map((p) => h('option', { value: p.name }))),
    h('datalist', { id: 'dl-units' }, UNITS.map((u) => h('option', { value: u }))),
    h('div', { class: 'row-end' },
      r && h('button', { type: 'button', class: 'btn ghost danger', onclick: async () => { if (await confirmSheet(`Apagar a receita ${r.name}?`, { ok: 'Apagar', danger: true })) { store.remove('recipes', r.id); close(); } } }, icon('trash', 18), 'Apagar'),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn primary' }, icon('check', 18), 'Guardar')));
  });
}
