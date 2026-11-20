// Ficha de produto, formulário de edição e escolha rápida de validade.
import { h, icon, sheet, field, toast, fmtQty, fmtMoney, fmtDate, confirmSheet, prefs, stepper } from '../ui.js';
import { store } from '../store.js';
import {
  GROUPS, UNITS, STORES, groupOf, storeOf, expiryStatus, effectiveExpiry, todayISO, addDays,
  packageBase, suggestMinMax, isTracked, productEmoji,
} from '../domain.js';

export const warnDays = () => prefs.get('warnDays', 5);

/** Miniatura: imagem do produto ou emoji do grupo. */
export function thumb(p, size = 44) {
  return h('div', { class: 'thumb', style: { width: size + 'px', height: size + 'px' } },
    p.image_url ? h('img', { src: p.image_url, alt: '', loading: 'lazy', onerror: (e) => e.target.replaceWith(productEmoji(p)) }) : productEmoji(p));
}

/** Barra de stock entre 0 e o máximo, com marca no mínimo. */
export function stockBar(p) {
  if (!isTracked(p)) return null;
  const max = Math.max(p.max || 0, p.min || 0, p.qty || 0, 1);
  const pct = Math.min(100, ((p.qty || 0) / max) * 100);
  const lvl = p.qty <= 0 ? 'out' : p.qty <= p.min ? 'low' : 'ok';
  return h('div', { class: 'bar ' + lvl, title: `mín. ${fmtQty(p.min)} · máx. ${fmtQty(p.max)}` },
    h('i', { style: { width: pct + '%' } }),
    p.min > 0 && h('b', { style: { left: Math.min(100, (p.min / max) * 100) + '%' } }));
}

export function expiryChip(p) {
  const st = expiryStatus(p, warnDays());
  if (!st || st.level === 'ok') return null;
  return h('span', { class: 'chip ' + st.level }, icon('clock', 14), st.text);
}

/** Linha de produto usada no stock e no início. */
export function productRow(p, { compact = false } = {}) {
  const meta = [p.brand, p.location].filter(Boolean).join(' · ');
  return h('div', { class: 'prow', onclick: () => openProduct(p.id) },
    thumb(p),
    h('div', { class: 'prow-main' },
      h('div', { class: 'prow-name' }, p.name),
      !compact && meta && h('div', { class: 'prow-meta' }, meta),
      h('div', { class: 'chips' },
        expiryChip(p),
        p.opened_at && h('span', { class: 'chip info' }, icon('open', 14), 'Aberto'),
        isTracked(p) && p.qty <= p.min && h('span', { class: 'chip warn' }, p.qty <= 0 ? 'Esgotado' : 'Mínimo')),
      !compact && stockBar(p)),
    stepper(Number(p.qty) || 0, (v) => store.changeQty(p, +(v - (Number(p.qty) || 0)).toFixed(3)), { step: stepFor(p), label: p.unit }));
}

const stepFor = (p) => (['kg', 'L'].includes(p.unit) ? (p.package_size && ['kg', 'L'].includes(p.package_unit) ? p.package_size : 0.5) : ['g', 'ml'].includes(p.unit) ? 100 : 1);

// ---------- Ficha ----------
export function openProduct(id) {
  const render = (close) => {
    const p = store.get('products', id);
    if (!p) { close(); return h('div'); }
    const exp = effectiveExpiry(p);
    const latest = new Map(); // preço mais recente por loja e tipo
    for (const x of store.all('prices')) {
      if (x.product_id !== p.id) continue;
      const k = x.store + '|' + x.kind;
      if (!latest.has(k) || x.fetched_at > latest.get(k).fetched_at) latest.set(k, x);
    }
    const prices = [...latest.values()].sort((a, b) => a.price - b.price);
    const sug = suggestMinMax(store.all('events'), p.id);
    const history = store.all('events').filter((e) => e.product_id === p.id).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);

    return h('div', { class: 'stack' },
      h('div', { class: 'pd-head' }, thumb(p, 72),
        h('div', {}, h('div', { class: 'muted small' }, groupOf(p.grp).emoji + ' ' + [groupOf(p.grp).label, p.category].filter(Boolean).join(' · ')),
          h('div', { class: 'pd-brand' }, p.brand || ''),
          p.barcode && h('div', { class: 'muted small mono' }, p.barcode))),
      h('div', { class: 'pd-qty card' },
        h('div', {}, h('div', { class: 'muted small' }, 'Em casa'), h('div', { class: 'big' }, `${fmtQty(p.qty)} ${p.unit}`),
          isTracked(p) && h('div', { class: 'muted small' }, `mín. ${fmtQty(p.min)} · máx. ${fmtQty(p.max)}`)),
        stepper(Number(p.qty) || 0, (v) => store.changeQty(p, +(v - p.qty).toFixed(3)), { step: stepFor(p) })),
      stockBar(p),
      h('div', { class: 'grid2' },
        info('Validade', exp ? fmtDate(exp) : '—', expiryChip(p)),
        info('Local', p.location || '—'),
        p.opened_at && info('Aberto em', fmtDate(p.opened_at), p.open_days && h('span', { class: 'muted small' }, `dura ${p.open_days} dias`)),
        p.package_size && info('Embalagem', `${fmtQty(p.package_size)} ${p.package_unit || ''}`)),
      p.notes && h('p', { class: 'muted' }, p.notes),
      h('div', { class: 'actions' },
        p.qty > 0 && !p.opened_at && h('button', { class: 'btn soft', onclick: () => markOpened(p).then(refresh) }, icon('open', 18), 'Abrir'),
        h('button', { class: 'btn soft', onclick: () => addToList(p) }, icon('cart', 18), 'Para a lista'),
        p.qty > 0 && h('button', { class: 'btn soft', onclick: () => waste(p).then(refresh) }, icon('trash', 18), 'Deitar fora'),
        h('button', { class: 'btn soft', onclick: () => { close(); openProductForm(p); } }, icon('edit', 18), 'Editar')),
      sug && h('div', { class: 'tip' }, icon('sparkles', 18),
        h('div', {}, h('strong', {}, 'Sugestão pelo consumo: '), `gastam ~${fmtQty(+sug.perWeek.toFixed(1))} ${p.unit}/semana → mín. ${sug.min}, máx. ${sug.max}`),
        (sug.min !== p.min || sug.max !== p.max) && h('button', { class: 'btn small', onclick: () => { store.update('products', p.id, { min: sug.min, max: sug.max }); refresh(); toast('Mínimo e máximo atualizados'); } }, 'Aplicar')),
      h('div', { class: 'section-title' }, 'Preços', h('button', { class: 'link', onclick: () => priceEntry(p, refresh) }, '+ Registar preço')),
      prices.length ? h('div', { class: 'card list' }, prices.map((pr) => h('div', { class: 'price-row' },
        h('span', { class: 'store-dot', style: { background: storeOf(pr.store).color } }),
        h('div', { class: 'grow' }, h('div', {}, storeOf(pr.store).label, pr.kind === 'cheapest' && h('span', { class: 'chip info' }, 'mais barato da categoria')),
          h('div', { class: 'muted small' }, pr.name || '', pr.unit_price ? ` · ${fmtMoney(pr.unit_price)}${(pr.unit_label || '').replace(/^€/, '')}` : '')),
        pr.url ? h('a', { href: pr.url, target: '_blank', rel: 'noopener', class: 'price' }, fmtMoney(pr.price)) : h('span', { class: 'price' }, fmtMoney(pr.price)))))
        : h('p', { class: 'muted small' }, 'Ainda sem preços. Usa “Comparar preços” na lista de compras ou regista à mão.'),
      history.length && h('div', { class: 'section-title' }, 'Histórico'),
      history.length && h('div', { class: 'card list' }, history.map(eventRow)),
    );
  };
  let s;
  const refresh = () => { s.body.replaceChildren(render(s.close)); };
  s = sheet(store.get('products', id)?.name || 'Produto', render);
  const off = store.on(() => { if (s.dialog.open) refresh(); });
  s.dialog.addEventListener('close', off);
}

const info = (label, value, extra) => h('div', { class: 'info-box card' }, h('div', { class: 'muted small' }, label), h('div', { class: 'strong' }, value), extra);

const EVENT_TEXT = { consume: 'gastou', add: 'adicionou', buy: 'comprou', waste: 'deitou fora', open: 'abriu', cook: 'cozinhou com', adjust: 'acertou' };
export function eventRow(e) {
  const q = e.delta ? `${fmtQty(Math.abs(e.delta))} ` : '';
  return h('div', { class: 'event' },
    h('span', { class: 'avatar sm' }, (e.user_name || '?')[0].toUpperCase()),
    h('div', { class: 'grow' }, h('span', { class: 'strong' }, e.user_name || 'Alguém'), ` ${EVENT_TEXT[e.type] || e.type} ${e.type === 'buy' && !e.product_id ? '' : q}${e.product_name || ''}`,
      e.price ? h('span', { class: 'muted' }, ` · ${fmtMoney(e.price)}`) : null),
    h('span', { class: 'muted small' }, timeAgoShort(e.at)));
}
function timeAgoShort(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 3600) return Math.max(1, Math.floor(s / 60)) + ' min';
  if (s < 86400) return Math.floor(s / 3600) + ' h';
  return Math.floor(s / 86400) + ' d';
}

async function markOpened(p) {
  let days = p.open_days;
  if (!days) {
    const v = prompt('Depois de aberto dura quantos dias? (deixa vazio se não souberes)', '');
    days = parseInt(v, 10) || null;
  }
  store.update('products', p.id, { opened_at: todayISO(), open_days: days });
  store.log('open', p, null);
  toast(`${p.name} marcado como aberto`);
}

async function waste(p) {
  if (!(await confirmSheet(`Deitar fora ${fmtQty(p.qty)} ${p.unit} de ${p.name}? Fica registado como desperdício.`, { ok: 'Deitar fora', danger: true }))) return;
  store.changeQty(p, -p.qty, 'waste');
}

export function addToList(p, qty) {
  const existing = store.all('shopping_items').find((x) => x.product_id === p.id);
  if (existing) store.update('shopping_items', existing.id, { qty: (Number(existing.qty) || 0) + (qty || 1) });
  else store.insert('shopping_items', { product_id: p.id, name: p.name, qty: qty || 1, unit: p.unit });
  toast(`${p.name} adicionado à lista`);
}

export function priceEntry(p, done) {
  sheet('Registar preço', (close) => {
    const st = h('select', {}, STORES.map((s) => h('option', { value: s.id }, s.label)));
    const price = h('input', { type: 'number', step: '0.01', min: '0', inputmode: 'decimal', required: true, placeholder: '0,00' });
    return h('form', {
      class: 'stack', onsubmit: (e) => {
        e.preventDefault();
        const v = parseFloat(price.value);
        const pkg = packageBase(p); // ex.: { amount: 0.75, unit: 'L' }
        store.insert('prices', {
          product_id: p.id, item_name: p.name, store: st.value, kind: 'manual', name: [p.brand, p.name].filter(Boolean).join(' '),
          price: v, unit_price: pkg ? +(v / pkg.amount).toFixed(3) : null, unit_label: pkg ? '€/' + pkg.unit : null,
        });
        close();
        done?.();
        toast('Preço registado');
      },
    }, field('Loja', st), field('Preço por embalagem (€)', price), h('button', { class: 'btn primary block' }, 'Guardar'));
  });
}

// ---------- Formulário ----------
export function openProductForm(p = null, prefill = {}) {
  const v = { grp: 'alimentar', unit: 'un', qty: 1, min: 0, max: 0, ...prefill, ...(p || {}) };
  const products = store.all('products');
  const opts = (key) => [...new Set(products.map((x) => x[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt'));
  const dl = (id, values) => h('datalist', { id }, values.map((x) => h('option', { value: x })));
  const inp = (name, attrs = {}) => h('input', { name, value: v[name] ?? '', ...attrs });

  sheet(p ? 'Editar produto' : 'Novo produto', (close) => {
    const groupBtns = h('div', { class: 'seg wrap' }, GROUPS.map((g) => h('button', {
      type: 'button', class: v.grp === g.id ? 'on' : '', onclick: (e) => {
        v.grp = g.id;
        groupBtns.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
        e.currentTarget.classList.add('on');
      },
    }, g.emoji + ' ' + g.label)));
    const expiry = inp('expiry', { type: 'date' });
    const form = h('form', {
      class: 'stack', onsubmit: (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(form));
        const num = (x) => (x === '' || x === undefined ? null : Math.max(0, parseFloat(String(x).replace(',', '.')) || 0));
        const row = {
          name: f.name.trim(), brand: f.brand.trim() || null, barcode: f.barcode.trim() || null, grp: v.grp,
          category: f.category.trim() || null, location: f.location.trim() || null, unit: f.unit.trim() || 'un',
          qty: num(f.qty) ?? 0, min: num(f.min) ?? 0, max: num(f.max) ?? 0, expiry: f.expiry || null,
          package_size: num(f.package_size), package_unit: f.package_unit || null, open_days: parseInt(f.open_days, 10) || null,
          compare_as: f.compare_as.trim() || null, notes: f.notes.trim() || null, image_url: v.image_url || null,
        };
        if (row.max && row.min && row.max < row.min) return toast('O máximo tem de ser maior ou igual ao mínimo', { type: 'error' });
        if (p) {
          if (row.qty !== Number(p.qty)) store.log('adjust', p, +(row.qty - p.qty).toFixed(3));
          store.update('products', p.id, row);
        } else {
          const np = store.insert('products', row);
          if (row.qty) store.log('add', np, row.qty);
        }
        close();
        toast(p ? 'Produto atualizado' : `${row.name} adicionado`);
      },
    },
    v.image_url && h('img', { class: 'form-img', src: v.image_url, alt: '' }),
    field('Nome *', inp('name', { required: true, autocomplete: 'off' })),
    h('div', { class: 'grid2' }, field('Marca', inp('brand', { list: 'dl-brand' })), field('Código de barras', inp('barcode', { inputmode: 'numeric' }))),
    field('Tipo', groupBtns),
    h('div', { class: 'grid2' }, field('Categoria / corredor', inp('category', { list: 'dl-cat', placeholder: 'Laticínios' })), field('Local', inp('location', { list: 'dl-loc', placeholder: 'Despensa' }))),
    h('div', { class: 'grid3' },
      field('Em casa', inp('qty', { type: 'number', step: 'any', min: 0, inputmode: 'decimal' })),
      field('Unidade', inp('unit', { list: 'dl-unit' })),
      field('Validade', expiry)),
    h('div', { class: 'quick' }, [['+3 d', 3], ['+1 sem', 7], ['+1 mês', 30], ['+6 meses', 182], ['+1 ano', 365]].map(([l, d]) =>
      h('button', { type: 'button', class: 'pill', onclick: () => { expiry.value = addDays(todayISO(), d); } }, l)),
    h('button', { type: 'button', class: 'pill', onclick: async () => { const { readDateWithCamera } = await import('../ocr.js'); const d = await readDateWithCamera(); if (d) expiry.value = d; } }, icon('camera', 14), 'Ler data')),
    h('div', { class: 'grid2' },
      field('Mínimo', inp('min', { type: 'number', step: 'any', min: 0, inputmode: 'decimal' }), 'Ao chegar aqui vai para a lista'),
      field('Máximo', inp('max', { type: 'number', step: 'any', min: 0, inputmode: 'decimal' }), 'Compra-se até este valor')),
    h('details', { class: 'more' }, h('summary', {}, 'Mais opções'),
      h('div', { class: 'stack' },
        h('div', { class: 'grid2' },
          field('Tamanho da embalagem', inp('package_size', { type: 'number', step: 'any', min: 0, placeholder: '1' })),
          field('Unidade da embalagem', h('select', { name: 'package_unit', value: v.package_unit || '' }, ['', 'g', 'kg', 'ml', 'cl', 'L', 'un'].map((u) => h('option', { value: u }, u || '—'))))),
        field('Dura depois de aberto (dias)', inp('open_days', { type: 'number', min: 0 })),
        field('Comparar como', inp('compare_as', { placeholder: 'ex.: leite meio-gordo 1L' }), 'Termo usado para procurar a alternativa mais barata nas lojas'),
        field('Notas', inp('notes')))),
    h('div', { class: 'row-end' },
      p && h('button', {
        type: 'button', class: 'btn ghost danger', onclick: async () => {
          if (await confirmSheet(`Apagar ${p.name}? O histórico mantém-se.`, { ok: 'Apagar', danger: true })) { store.remove('products', p.id); close(); }
        },
      }, icon('trash', 18), 'Apagar'),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn primary' }, icon('check', 18), 'Guardar')),
    dl('dl-brand', opts('brand')), dl('dl-cat', opts('category')), dl('dl-loc', opts('location')), dl('dl-unit', [...new Set([...UNITS, ...opts('unit')])]));
    return form;
  });
}

// ---------- Validade rápida (ao arrumar compras) ----------
/** Pergunta quantidade e validade. Devolve { qty, expiry } ou null. */
export function askQtyExpiry(p, { qty = 1, expiry = null } = {}) {
  return new Promise((resolve) => {
    let result = null;
    let q = qty;
    let exp = expiry;
    sheet(`Arrumar ${p.name}`, (close) => {
      const date = h('input', { type: 'date', value: exp || '' , onchange: (e) => { exp = e.target.value || null; } });
      const qtyBox = h('div');
      const drawQty = () => qtyBox.replaceChildren(stepper(q, (nv) => { q = Math.max(0.001, nv); drawQty(); }, { step: stepFor(p), label: p.unit }));
      drawQty();
      const pick = (d) => { exp = addDays(todayISO(), d); date.value = exp; };
      return h('div', { class: 'stack' },
        h('div', { class: 'pd-head' }, thumb(p, 56), h('div', {}, h('div', { class: 'strong' }, p.name), h('div', { class: 'muted small' }, `Em casa: ${fmtQty(p.qty)} ${p.unit}`))),
        field('Quantidade a adicionar', qtyBox),
        field('Validade', date),
        h('div', { class: 'quick' },
          [['+3 dias', 3], ['+1 semana', 7], ['+2 semanas', 14], ['+1 mês', 30], ['+3 meses', 91], ['+6 meses', 182], ['+1 ano', 365]].map(([l, d]) => h('button', { type: 'button', class: 'pill', onclick: () => pick(d) }, l)),
          h('button', { type: 'button', class: 'pill', onclick: () => { exp = null; date.value = ''; } }, 'Sem validade'),
          h('button', {
            type: 'button', class: 'pill accent', onclick: async () => {
              const { readDateWithCamera } = await import('../ocr.js');
              const d = await readDateWithCamera();
              if (d) { exp = d; date.value = d; }
            },
          }, icon('camera', 14), 'Ler da embalagem')),
        h('button', { class: 'btn primary block', onclick: () => { result = { qty: q, expiry: exp }; close(); } }, icon('check', 18), 'Arrumar'));
    }, { onClose: () => resolve(result) });
  });
}

/** Junta stock novo a um produto, mantendo a validade mais próxima. */
export function restock(p, qty, expiry, type = 'add', extra = {}) {
  const cur = store.get('products', p.id) || p;
  const patch = {};
  if (expiry) patch.expiry = cur.qty > 0 && cur.expiry && cur.expiry < expiry ? cur.expiry : expiry;
  if (Object.keys(patch).length) store.update('products', p.id, patch);
  store.changeQty(cur, qty, type, extra);
}
