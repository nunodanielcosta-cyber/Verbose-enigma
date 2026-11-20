// Comparação de preços: o mesmo produto e o mais barato da categoria em cada loja.
import { h, icon, sheet, toast, fmtMoney, prefs } from '../ui.js';
import { store } from '../store.js';
import { STORES, storeOf, packsFor } from '../domain.js';
import { PRICES_FUNCTION } from '../config.js';

const MAX_AGE_H = 24; // preços com menos de 24 h não voltam a ser procurados

/** Abre a comparação para os itens da lista. */
export async function openCompare(items) {
  const chosen = prefs.get('compare.stores', STORES.filter((s) => s.online).map((s) => s.id));
  const status = h('div', { class: 'muted small' });
  const content = h('div', { class: 'stack' });
  const s = sheet('Comparar preços', h('div', { class: 'stack' }, storePicker(chosen, () => run(false), () => run(true)), status, content), { full: true });
  let loose = new Map(); // resultados de itens sem produto (não ficam guardados)

  async function run(force = false) {
    const stores = prefs.get('compare.stores', chosen).filter((id) => storeOf(id).online);
    const stale = items.filter((it) => force || !fresh(it, stores));
    if (stale.length && stores.length) {
      status.replaceChildren(h('div', { class: 'spinner sm' }), ` A procurar ${stale.length} produto(s) em ${stores.length} lojas…`);
      try {
        const res = await store.invoke(PRICES_FUNCTION, {
          stores,
          items: stale.map((it) => ({
            id: it.key, name: it.product?.name || it.name, brand: it.product?.brand || null,
            size: it.product?.package_size ? `${it.product.package_size}${it.product.package_unit || ''}` : null,
            compare_as: it.product?.compare_as || null, category: it.product?.category || null,
          })),
        });
        save(res.results || [], stale);
        const errors = (res.results || []).filter((r) => r.error);
        const failedStores = [...new Set(errors.map((r) => storeOf(r.store).label))];
        status.textContent = failedStores.length ? `⚠️ Sem resposta de: ${failedStores.join(', ')} (o site pode ter mudado).` : `Atualizado agora.`;
      } catch (e) {
        status.textContent = '⚠️ ' + (e.message || 'Não foi possível procurar preços.') + ' A mostrar os últimos preços conhecidos.';
      }
    } else {
      status.textContent = stores.length ? 'Preços das últimas 24 h.' : 'Escolhe pelo menos uma loja.';
    }
    draw();
  }

  function fresh(it, stores) {
    if (!it.product) return false;
    const since = new Date(Date.now() - MAX_AGE_H * 3600e3).toISOString();
    return stores.every((st) => store.all('prices').some((p) => p.product_id === it.product.id && p.store === st && p.kind === 'same' && p.fetched_at > since));
  }

  function save(results, stale) {
    const byKey = new Map(stale.map((it) => [it.key, it]));
    const rows = [];
    for (const r of results) {
      const it = byKey.get(r.id);
      if (!it) continue;
      if (!it.product) { loose.set(r.id + '|' + r.store, r); continue; }
      for (const kind of ['same', 'cheapest']) {
        const x = r[kind];
        if (!x || !(x.price > 0)) continue;
        rows.push({ product_id: it.product.id, item_name: it.name, store: r.store, kind, name: x.name, price: x.price, unit_price: x.unit_price ?? null, unit_label: x.unit_label ?? null, url: x.url ?? null, image_url: x.image ?? null });
      }
    }
    store.insertMany('prices', rows);
  }

  /** { same, cheapest } mais recentes para um item numa loja. */
  function offers(it, st) {
    if (!it.product) {
      const r = loose.get(it.key + '|' + st);
      return { same: r?.same || null, cheapest: r?.cheapest || null };
    }
    const pick = (kinds) => store.all('prices').filter((p) => p.product_id === it.product.id && p.store === st && kinds.includes(p.kind))
      .sort((a, b) => b.fetched_at.localeCompare(a.fetched_at))[0] || null;
    return { same: pick(['same', 'manual', 'receipt']), cheapest: pick(['cheapest']) };
  }

  function draw() {
    const stores = prefs.get('compare.stores', chosen);
    const table = items.map((it) => ({ it, packs: packsFor(it), by: Object.fromEntries(stores.map((st) => [st, offers(it, st)])) }));

    // Totais por loja
    const totals = stores.map((st) => {
      let same = 0; let sameN = 0; let cheap = 0; let cheapN = 0;
      for (const row of table) {
        const o = row.by[st];
        if (o.same) { same += o.same.price * row.packs; sameN++; }
        const c = [o.cheapest, o.same].filter(Boolean).sort((a, b) => a.price - b.price)[0];
        if (c) { cheap += c.price * row.packs; cheapN++; }
      }
      return { st, same, sameN, cheap, cheapN };
    });
    const n = items.length;
    const complete = totals.filter((t) => t.sameN === n).sort((a, b) => a.same - b.same);
    const bestSingle = complete[0];

    // Melhor combinação: cada produto na loja onde está mais barato
    let combo = 0;
    const comboBy = new Map();
    for (const row of table) {
      let best = null;
      for (const st of stores) { const o = row.by[st].same; if (o && (!best || o.price < best.o.price)) best = { st, o }; }
      if (best) { combo += best.o.price * row.packs; comboBy.set(best.st, (comboBy.get(best.st) || 0) + 1); }
    }

    content.replaceChildren(...[
      h('div', { class: 'section-title' }, 'Resumo'),
      h('div', { class: 'store-cards' }, totals.map((t) => h('div', { class: 'store-card' + (bestSingle?.st === t.st ? ' best' : '') },
        h('div', { class: 'store-name', style: { '--c': storeOf(t.st).color } }, storeOf(t.st).label, bestSingle?.st === t.st && h('span', { class: 'chip ok' }, 'Mais barata')),
        h('div', { class: 'muted small' }, 'Mesmos produtos'),
        h('div', { class: 'big' }, t.sameN ? fmtMoney(t.same) : '—'),
        h('div', { class: 'muted small' }, `${t.sameN}/${n} encontrados`),
        h('div', { class: 'muted small mt' }, 'Opção mais barata'),
        h('div', { class: 'strong' }, t.cheapN ? fmtMoney(t.cheap) : '—')))),
      comboBy.size > 1 && h('div', { class: 'tip' }, icon('sparkles', 18), h('div', {},
        h('strong', {}, `Dividindo as compras: ${fmtMoney(combo)}`),
        h('div', { class: 'small' }, [...comboBy].map(([st, k]) => `${k} no ${storeOf(st).label}`).join(' · '),
          bestSingle ? ` — poupas ${fmtMoney(bestSingle.same - combo)} face a ir só ao ${storeOf(bestSingle.st).label}.` : ''))),
      h('div', { class: 'section-title' }, 'Por produto'),
      ...table.map(({ it, packs, by }) => {
        const all = stores.map((st) => ({ st, ...by[st] }));
        const minSame = Math.min(...all.map((x) => x.same?.price ?? Infinity));
        const minCheap = Math.min(...all.map((x) => Math.min(x.cheapest?.price ?? Infinity, x.same?.price ?? Infinity)));
        return h('details', { class: 'card cmp' },
          h('summary', {}, h('div', { class: 'grow' }, h('div', { class: 'strong' }, it.name), h('div', { class: 'muted small' }, `${packs} emb.`)),
            h('div', { class: 'right' }, isFinite(minSame) ? h('div', { class: 'strong' }, fmtMoney(minSame)) : h('div', { class: 'muted small' }, 'sem preço'),
              isFinite(minCheap) && minCheap < minSame && h('div', { class: 'small ok-text' }, 'alt. ' + fmtMoney(minCheap)))),
          h('div', { class: 'cmp-rows' }, all.map((x) => h('div', { class: 'cmp-row' },
            h('span', { class: 'store-dot', style: { background: storeOf(x.st).color } }),
            h('div', { class: 'grow' },
              h('div', { class: 'small strong' }, storeOf(x.st).label),
              offerLine('Mesmo', x.same, x.same?.price === minSame),
              x.cheapest && x.cheapest.name !== x.same?.name && offerLine('Mais barato', x.cheapest, x.cheapest.price === minCheap))))));
      }),
      h('p', { class: 'muted small' }, 'A Lidl não tem loja online de alimentação: regista os preços à mão (ficha do produto) ou lendo o talão. Os preços vêm dos sites das lojas e podem diferir na loja física.'),
    ].filter(Boolean));
  }

  draw();
  run();
  return s;
}

function offerLine(label, o, best) {
  if (!o) return h('div', { class: 'muted small' }, `${label}: —`);
  const unit = o.unit_price ? ` · ${fmtMoney(o.unit_price)}${(o.unit_label || '').replace(/^€/, '')}` : '';
  const name = o.url ? h('a', { href: o.url, target: '_blank', rel: 'noopener' }, o.name || 'ver') : (o.name || '');
  return h('div', { class: 'small offer' + (best ? ' best' : '') }, h('span', { class: 'muted' }, label + ': '), name, ' ', h('strong', {}, fmtMoney(o.price)), h('span', { class: 'muted' }, unit));
}

function storePicker(chosen, onToggle, onRefresh) {
  const box = h('div', { class: 'chip-scroll' });
  const draw = () => {
    const cur = prefs.get('compare.stores', chosen);
    box.replaceChildren(...STORES.map((s) => h('button', {
      class: 'fchip' + (cur.includes(s.id) ? ' on' : ''), title: s.online ? '' : 'Sem loja online — só preços manuais',
      onclick: () => {
        const next = cur.includes(s.id) ? cur.filter((x) => x !== s.id) : [...cur, s.id];
        prefs.set('compare.stores', next);
        draw();
        onToggle();
      },
    }, h('span', { class: 'store-dot', style: { background: s.color } }), s.label, !s.online && h('span', {}, 'manual'))));
  };
  draw();
  return h('div', {}, box, h('button', { class: 'link small', onclick: () => { toast('A atualizar preços…'); onRefresh(); } }, icon('download', 14), ' Procurar de novo'));
}
