// Lista de compras: gerada a partir do stock (mín./máx.), do plano de refeições e de itens manuais.
import { h, icon, sheet, field, toast, fmtQty, fmtMoney, empty, prefs, stepper } from '../ui.js';
import { store } from '../store.js';
import { shoppingList, STORES, storeOf, latestPrices, packsFor, bestMatch, groupOf, parseReceipt, todayISO, addDays, convertToProduct } from '../domain.js';
import { thumb, restock, openProduct } from './product.js';
import { openCompare } from './prices.js';

export function currentList() {
  return shoppingList({
    products: store.all('products'), recipes: store.all('recipes'),
    plan: store.all('meal_plan'), extras: store.all('shopping_items'),
  });
}

/** Melhor preço conhecido para um item (mesmo produto) e loja onde está. */
export function bestPrice(item, onlyStore) {
  if (!item.product) return null;
  let best = null;
  for (const pr of latestPrices(store.all('prices'), item.product.id).values()) {
    if (onlyStore && pr.store !== onlyStore) continue;
    if (!best || pr.price < best.price) best = pr;
  }
  return best;
}

export default {
  id: 'shopping',
  title: 'Lista de compras',
  mount(root) {
    let groupBy = prefs.get('shop.group', 'category');
    const atStore = () => prefs.get('shop.store', '');
    const head = h('div');
    const body = h('div', { class: 'list-groups' });
    const addInput = h('input', { placeholder: 'Adicionar à lista…', list: 'dl-shop', autocomplete: 'off' });
    const addForm = h('form', {
      class: 'searchbar add', onsubmit: (e) => {
        e.preventDefault();
        const name = addInput.value.trim();
        if (!name) return;
        const m = parseQtyName(name);
        const p = store.all('products').find((x) => x.name.toLowerCase() === m.name.toLowerCase()) || bestMatch(m.name, store.all('products'), 0.8)?.product;
        store.insert('shopping_items', { name: p?.name || m.name, product_id: p?.id || null, qty: m.qty, unit: p?.unit || '' });
        addInput.value = '';
      },
    }, icon('plus', 18), addInput, h('datalist', { id: 'dl-shop' }));
    root.append(head, addForm, body);

    function draw() {
      const items = currentList();
      addForm.querySelector('datalist').replaceChildren(...store.all('products').map((p) => h('option', { value: p.name })));
      let total = 0;
      let priced = 0;
      for (const it of items) {
        const bp = bestPrice(it, atStore() || null) || bestPrice(it);
        if (bp) { total += bp.price * packsFor(it); priced++; }
      }

      head.replaceChildren(
        h('div', { class: 'hero-card' },
          h('div', {}, h('div', { class: 'hero-num' }, items.length), h('div', {}, items.length === 1 ? 'produto a comprar' : 'produtos a comprar')),
          h('div', { class: 'right' }, h('div', { class: 'hero-num sm' }, priced ? '≈ ' + fmtMoney(total) : '—'),
            h('div', { class: 'small' }, priced ? `estimativa (${priced}/${items.length} com preço)` : 'compara preços para estimar'))),
        h('div', { class: 'toolbar' },
          h('button', { class: 'btn primary', disabled: !items.length, onclick: () => openCompare(items) }, icon('store', 18), 'Comparar preços'),
          h('button', { class: 'btn soft', onclick: () => receiptFlow() }, icon('receipt', 18), 'Ler talão')),
        h('div', { class: 'filters' },
          h('select', { 'aria-label': 'Estou na loja', value: atStore(), onchange: (e) => { prefs.set('shop.store', e.target.value); draw(); } },
            h('option', { value: '' }, '🛒 Em que loja estás?'), STORES.map((s) => h('option', { value: s.id }, 'Estou no ' + s.label))),
          h('select', { 'aria-label': 'Agrupar', value: groupBy, onchange: (e) => { groupBy = e.target.value; prefs.set('shop.group', groupBy); draw(); } },
            h('option', { value: 'category' }, 'Por corredor'), h('option', { value: 'store' }, 'Pela loja mais barata'), h('option', { value: 'grp' }, 'Por tipo'))));

      if (!items.length) return body.replaceChildren(empty('🎉', 'Lista vazia', 'Está tudo acima do mínimo. Os produtos aparecem aqui sozinhos quando chegam ao mínimo.'));

      const groups = new Map();
      for (const it of items) {
        let k;
        if (groupBy === 'store') { const bp = bestPrice(it); k = bp ? storeOf(bp.store).label : 'Sem preço'; }
        else if (groupBy === 'grp') k = groupOf(it.product?.grp).emoji + ' ' + groupOf(it.product?.grp).label;
        else k = it.product?.category || 'Outros';
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(it);
      }
      const keys = [...groups.keys()].sort((a, b) => (['Outros', 'Sem preço'].includes(a)) - (['Outros', 'Sem preço'].includes(b)) || a.localeCompare(b, 'pt'));
      body.replaceChildren(...keys.map((k) => h('section', {},
        h('div', { class: 'group-title' }, k, h('span', {}, groups.get(k).length)),
        h('div', { class: 'card list' }, groups.get(k).map(row)))));
    }

    function row(it) {
      const bp = bestPrice(it, atStore() || null) || bestPrice(it);
      const reasons = { 'mínimo': 'Mínimo', receitas: 'Receitas', manual: 'Manual' };
      return h('div', { class: 'srow' },
        h('button', { class: 'check', 'aria-label': 'Comprado', onclick: () => quickBuy(it) }, icon('check', 18)),
        it.product ? thumb(it.product, 40) : h('div', { class: 'thumb' }, '🛍️'),
        h('div', { class: 'grow', onclick: () => buySheet(it) },
          h('div', { class: 'prow-name' }, it.name),
          h('div', { class: 'prow-meta' }, `${fmtQty(it.qty)} ${it.unit || ''}`, it.recipes.length ? ' · ' + it.recipes.join(', ') : '', it.note ? ' · ' + it.note : ''),
          h('div', { class: 'chips' }, [...new Set(it.reasons)].map((r) => h('span', { class: 'chip ' + (r === 'mínimo' ? 'warn' : 'info') }, reasons[r] || r)))),
        bp && h('div', { class: 'srow-price' }, h('div', { class: 'strong' }, fmtMoney(bp.price * packsFor(it))),
          h('div', { class: 'small', style: { color: storeOf(bp.store).color } }, storeOf(bp.store).label)),
        it.extra && !it.product && h('button', { class: 'icon-btn', 'aria-label': 'Remover', onclick: () => store.remove('shopping_items', it.extra.id) }, icon('x', 18)));
    }

    draw();
    return { update: draw };
  },
};

function parseQtyName(text) {
  const m = text.match(/^(\d+(?:[.,]\d+)?)\s*x?\s+(.+)$/i);
  return m ? { qty: parseFloat(m[1].replace(',', '.')), name: m[2] } : { qty: 1, name: text };
}

// ---------- Comprar ----------
function quickBuy(it) {
  const st = prefs.get('shop.store', '') || null;
  const bp = bestPrice(it, st) || null;
  const price = bp && (!st || bp.store === st) ? +(bp.price * packsFor(it)).toFixed(2) : null;
  applyBuy(it, { qty: it.qty, price, store: st, expiry: null });
  toast(`✓ ${it.name} comprado`, { action: 'Anular', onAction: () => undoBuy(it) });
}

let lastBuy = null;
function undoBuy(it) {
  if (!lastBuy || lastBuy.key !== it.key) return;
  const { product, created, extra, event } = lastBuy;
  if (product) store.update('products', product.id, { qty: product.qty, expiry: product.expiry ?? null });
  if (created) store.remove('products', created);
  if (extra) store.insert('shopping_items', extra);
  if (event) store.remove('events', event.id);
  lastBuy = null;
}

function applyBuy(it, { qty, price, store: st, expiry }) {
  let product = it.product && store.get('products', it.product.id);
  const before = product ? { ...product } : null;
  if (!product) {
    // Ingrediente/item sem produto: cria no stock e liga às receitas que o usam
    product = store.insert('products', { name: it.name, unit: it.unit || 'un', qty: 0, min: 0, max: 0, grp: 'alimentar' });
    for (const r of store.all('recipes')) {
      const ings = r.ingredients || [];
      if (ings.some((i) => !i.product_id && i.name?.trim().toLowerCase() === it.name.toLowerCase())) {
        store.update('recipes', r.id, { ingredients: ings.map((i) => (!i.product_id && i.name?.trim().toLowerCase() === it.name.toLowerCase() ? { ...i, product_id: product.id } : i)) });
      }
    }
  }
  const extras = store.all('shopping_items').filter((x) => x.product_id === product.id || x.id === it.extra?.id);
  for (const x of extras) store.remove('shopping_items', x.id);
  restock(product, qty, expiry, 'buy', { price: price || null, store: st || null });
  const event = store.all('events').filter((e) => e.product_id === product.id && e.type === 'buy').sort((a, b) => b.at.localeCompare(a.at))[0];
  if (price && st) {
    const packs = packsFor({ ...it, qty, product });
    store.insert('prices', { product_id: product.id, item_name: product.name, store: st, kind: 'manual', name: product.name, price: +(price / packs).toFixed(2) });
  }
  lastBuy = { key: it.key, product: before, created: before ? null : product.id, extra: extras[0] || null, event };
}

function buySheet(it) {
  let qty = it.qty;
  sheet(it.name, (close) => {
    const st = h('select', { value: prefs.get('shop.store', '') }, h('option', { value: '' }, '—'), STORES.map((s) => h('option', { value: s.id }, s.label)));
    const bp = bestPrice(it, prefs.get('shop.store', '') || null);
    const price = h('input', { type: 'number', step: '0.01', min: 0, inputmode: 'decimal', placeholder: bp ? (bp.price * packsFor(it)).toFixed(2) : '0,00' });
    const exp = h('input', { type: 'date' });
    const qBox = h('div');
    const drawQ = () => qBox.replaceChildren(stepper(qty, (v) => { qty = Math.max(0, v); drawQ(); }, { label: it.unit }));
    drawQ();
    return h('div', { class: 'stack' },
      it.product && h('button', { class: 'link', onclick: () => { close(); openProduct(it.product.id); } }, 'Ver ficha do produto →'),
      field('Quantidade comprada', qBox),
      h('div', { class: 'grid2' }, field('Loja', st), field('Total pago (€)', price)),
      field('Validade (opcional)', exp),
      h('div', { class: 'quick' }, [['+1 sem', 7], ['+1 mês', 30], ['+6 meses', 182], ['+1 ano', 365]].map(([l, d]) => h('button', { type: 'button', class: 'pill', onclick: () => { exp.value = addDays(todayISO(), d); } }, l))),
      h('div', { class: 'row-end' },
        it.extra && h('button', { class: 'btn ghost danger', onclick: () => { store.remove('shopping_items', it.extra.id); close(); } }, 'Remover da lista'),
        h('span', { class: 'grow' }),
        h('button', {
          class: 'btn primary', onclick: () => {
            if (st.value) prefs.set('shop.store', st.value);
            applyBuy(it, { qty, price: price.value ? parseFloat(price.value) : null, store: st.value || null, expiry: exp.value || null });
            close();
            toast(`✓ ${it.name} comprado e arrumado`);
          },
        }, icon('check', 18), 'Comprado')));
  });
}

// ---------- Talão ----------
export async function receiptFlow() {
  const { pickImage, recognizeReceipt } = await import('../ocr.js');
  const file = await pickImage();
  if (!file) return;
  const status = h('p', { class: 'muted' }, 'A preparar…');
  const s = sheet('Ler talão', h('div', { class: 'stack' }, status, h('div', { class: 'spinner' })));
  let lines;
  try {
    const text = await recognizeReceipt(file, (m) => { status.textContent = m; });
    lines = parseReceipt(text);
  } catch (e) {
    status.textContent = 'Não foi possível ler: ' + e.message;
    return;
  }
  s.close();
  if (!lines.length) return toast('Não encontrei produtos no talão. Tenta uma foto mais nítida e direita.', { type: 'error' });

  const products = store.all('products');
  const rows = lines.map((l) => ({ ...l, product: bestMatch(l.name, products, 0.4)?.product || null, use: true }));
  sheet('Confirmar talão', (close) => {
    const st = h('select', { value: prefs.get('shop.store', '') }, h('option', { value: '' }, 'Loja…'), STORES.map((x) => h('option', { value: x.id }, x.label)));
    const opts = [h('option', { value: '' }, '— ignorar —'), ...products.map((p) => h('option', { value: p.id }, p.name))];
    return h('div', { class: 'stack' },
      h('p', { class: 'muted small' }, 'Confirma a que produto corresponde cada linha. Os preços ficam registados e o stock é atualizado.'),
      field('Loja', st),
      h('div', { class: 'card list' }, rows.map((r) => h('div', { class: 'rrow' },
        h('div', { class: 'grow' }, h('div', { class: 'mono small' }, r.name), h('div', { class: 'strong' }, fmtMoney(r.price), r.qty > 1 ? ` · ${r.qty}×` : '')),
        h('select', { value: r.product?.id || '', onchange: (e) => { r.product = store.get('products', e.target.value) || null; } }, opts.map((o) => o.cloneNode(true)))))),
      h('button', {
        class: 'btn primary block', onclick: () => {
          let n = 0;
          for (const r of rows) {
            if (!r.product) continue;
            // 1 linha do talão = 1 embalagem; converte para a unidade do produto (ex.: 1 pacote de 500 g = 0,5 kg)
            const p = r.product;
            const add = p.package_size && p.package_unit ? convertToProduct(p.package_size * r.qty, p.package_unit, p) : r.qty;
            restock(r.product, add, null, 'buy', { price: r.price, store: st.value || null });
            if (st.value) store.insert('prices', { product_id: r.product.id, item_name: r.product.name, store: st.value, kind: 'receipt', name: r.name, price: +(r.price / r.qty).toFixed(2) });
            n++;
          }
          close();
          toast(`${n} produtos atualizados a partir do talão`);
        },
      }, icon('check', 18), 'Aplicar'));
  });
}
