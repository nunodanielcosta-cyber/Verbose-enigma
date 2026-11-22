// Ler talão: atualiza o stock (e cria produtos novos) a partir de uma fotografia do talão.
import { h, icon, sheet, toast, field, fmtMoney, fmtQty, prefs } from '../ui.js';
import { store } from '../store.js';
import { STORES, parseReceipt, bestMatch, convertToProduct, normalize } from '../domain.js';
import { matchProduce, productFromCatalog, unitsFromKg, PRODUCE } from '../produce.js';
import { restock } from './product.js';

export async function receiptFlow() {
  const { pickImage, recognizeReceipt } = await import('../ocr.js');
  const file = await pickImage();
  if (!file) return;
  const status = h('p', { class: 'muted center' }, 'A preparar…');
  const s = sheet('Ler talão', h('div', { class: 'stack' }, h('div', { class: 'spinner' }), status));
  let lines;
  try {
    const text = await recognizeReceipt(file, (m) => { status.textContent = m; });
    lines = parseReceipt(text);
  } catch (e) {
    status.textContent = 'Não foi possível ler: ' + e.message;
    return;
  }
  s.close();
  if (!lines.length) return toast('Não encontrei produtos no talão. Tenta uma foto mais nítida, direita e com boa luz.', { type: 'error', ms: 6000 });
  reviewReceipt(lines);
}

/** Ecrã de confirmação: cada linha do talão → produto do stock (ou novo), quantidade e preço. */
export function reviewReceipt(lines) {
  const products = store.all('products');
  const rows = lines.map((l) => {
    const r = { ...l, choice: 'ignore', qty: l.qty };
    const m = bestMatch(l.name, products, 0.5);
    const fresh = matchProduce(l.name);
    if (m) r.choice = 'p:' + m.product.id;
    else if (fresh) {
      const existing = products.find((p) => normalize(p.name) === normalize(fresh.name));
      r.choice = existing ? 'p:' + existing.id : 'c:' + fresh.name;
    } else r.choice = 'n:'; // criar produto novo com o nome do talão
    r.qty = suggestQty(r);
    return r;
  });

  sheet('Confirmar talão', (close) => {
    const st = h('select', { value: prefs.get('shop.store', '') }, h('option', { value: '' }, 'Em que loja foi?'), STORES.map((x) => h('option', { value: x.id }, x.label)));
    const list = h('div', { class: 'card list' });
    const summary = h('div', { class: 'muted small' });
    const drawSummary = () => {
      const used = rows.filter((r) => r.choice !== 'ignore');
      summary.textContent = `${used.length} de ${rows.length} linhas vão atualizar o stock · ${fmtMoney(used.reduce((t, r) => t + r.price, 0))}`;
    };
    const drawRows = () => list.replaceChildren(...rows.map((r) => {
      const qty = h('input', { type: 'number', step: 'any', min: 0, value: r.qty, class: 'qty', 'aria-label': 'Quantidade', oninput: (e) => { r.qty = parseFloat(e.target.value) || 0; } });
      const unit = h('span', { class: 'muted small' }, unitOf(r));
      const sel = h('select', {
        value: r.choice, onchange: (e) => { r.choice = e.target.value; r.qty = suggestQty(r); qty.value = r.qty; unit.textContent = unitOf(r); drawSummary(); },
      }, choiceOptions(r));
      return h('div', { class: 'rrow' + (r.choice === 'ignore' ? ' off' : '') },
        h('div', { class: 'grow' },
          h('div', { class: 'mono small' }, r.name, r.kg ? ` · ${fmtQty(r.kg)} kg` : ''),
          h('div', { class: 'strong' }, fmtMoney(r.price), r.qty > 1 && !r.kg ? h('span', { class: 'muted' }, ` · ${r.qty}×`) : null),
          sel),
        h('div', { class: 'rrow-qty' }, qty, unit));
    }));
    drawRows();
    drawSummary();
    return h('div', { class: 'stack' },
      h('p', { class: 'muted small' }, 'Confirma a que produto corresponde cada linha. Os que ainda não existem são criados no stock. A fruta e os legumes ficam com validade automática.'),
      field('Loja', st),
      list,
      summary,
      h('button', {
        class: 'btn primary block', onclick: () => {
          const n = applyReceipt(rows, st.value || null);
          if (st.value) prefs.set('shop.store', st.value);
          close();
          toast(`✓ ${n} produtos arrumados a partir do talão`);
        },
      }, icon('check', 18), 'Arrumar no stock'));
  }, { full: true });
}

function choiceOptions(r) {
  const products = store.all('products').sort((a, b) => a.name.localeCompare(b.name, 'pt'));
  const have = new Set(products.map((p) => normalize(p.name)));
  return [
    h('option', { value: 'ignore' }, '— ignorar esta linha —'),
    h('option', { value: 'n:' }, `➕ Criar novo: ${prettyName(r.name)}`),
    h('optgroup', { label: 'No stock' }, products.map((p) => h('option', { value: 'p:' + p.id }, p.name))),
    h('optgroup', { label: 'Frutas e legumes (novo)' }, PRODUCE.filter((i) => !have.has(normalize(i.name))).map((i) => h('option', { value: 'c:' + i.name }, `${i.emoji} ${i.name}`))),
  ];
}

/** "MACA GALA CAT I" → "Maca gala cat i" (nome legível para produtos novos) */
function prettyName(s) {
  const t = s.toLowerCase().replace(/\s+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function target(r) {
  if (r.choice.startsWith('p:')) return { product: store.get('products', r.choice.slice(2)) };
  if (r.choice.startsWith('c:')) { const item = PRODUCE.find((i) => i.name === r.choice.slice(2)); return { item, product: productFromCatalog(item) }; }
  if (r.choice === 'n:') return { product: { name: prettyName(r.name), unit: 'un' } };
  return {};
}

const unitOf = (r) => target(r).product?.unit || 'un';

/** Quantidade a somar ao stock, na unidade do produto. */
function suggestQty(r) {
  const { product: p, item } = target(r);
  if (!p) return r.qty;
  if (r.kg) return unitsFromKg(r.kg, p, item || matchProduce(p.name)) ?? r.qty;
  // 1 linha = 1 embalagem; converte para a unidade do produto (ex.: 1 pacote de 500 g = 0,5 kg)
  if (p.package_size && p.package_unit && p.unit !== 'un') return +convertToProduct(p.package_size * r.qty, p.package_unit, p).toFixed(3);
  return r.qty;
}

function applyReceipt(rows, st) {
  let n = 0;
  const created = new Map(); // evita criar o mesmo produto duas vezes no mesmo talão
  for (const r of rows) {
    if (r.choice === 'ignore' || !(r.qty > 0)) continue;
    let { product: p } = target(r);
    if (!p) continue;
    if (!p.id) {
      const key = normalize(p.name);
      p = created.get(key) || store.insert('products', { grp: 'alimentar', qty: 0, min: 0, max: 0, ...p });
      created.set(key, p);
    }
    restock(p, r.qty, null, 'buy', { price: r.price, store: st });
    if (st) {
      const perKg = r.kg ? +(r.price / r.kg).toFixed(2) : null;
      store.insert('prices', {
        product_id: p.id, item_name: p.name, store: st, kind: 'receipt', name: r.name,
        price: +(r.price / (r.kg ? 1 : r.qty || 1)).toFixed(2), unit_price: perKg, unit_label: perKg ? '€/kg' : null,
      });
    }
    n++;
  }
  return n;
}
