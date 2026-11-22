// Leitores de cada loja. Cada um recebe um termo de pesquisa e devolve
// [{ name, brand, price, unit_price, unit_label, size, url, image }].
//
// ⚠️ As lojas não têm API pública: isto lê as páginas de pesquisa dos sites.
// Se uma loja mudar o site, só o leitor dessa loja deixa de funcionar — as outras continuam.
// Para corrigir, normalmente basta ajustar os seletores em SFCC_SELECTORS ou o URL abaixo.

import { parsePrice, parseUnitPrice, parseSize } from './lib.js';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; DespensaFamiliar/1.0; comparador pessoal)',
  'Accept-Language': 'pt-PT,pt;q=0.9',
};

// URLs de pesquisa. "grid" devolve só a grelha de produtos; "page" é a página de pesquisa normal (alternativa).
export const SFCC_SITES = {
  continente: {
    origin: 'https://www.continente.pt',
    grid: 'https://www.continente.pt/on/demandware.store/Sites-continente-Site/default/Search-UpdateGrid?q={q}&start=0&sz=24',
    page: 'https://www.continente.pt/pesquisa/?q={q}',
  },
  pingodoce: {
    origin: 'https://www.pingodoce.pt',
    grid: 'https://www.pingodoce.pt/on/demandware.store/Sites-pingo-doce-Site/default/Search-UpdateGrid?q={q}&start=0&sz=24',
    page: 'https://www.pingodoce.pt/pesquisa/?q={q}',
  },
  auchan: {
    origin: 'https://www.auchan.pt',
    grid: 'https://www.auchan.pt/on/demandware.store/Sites-AuchanPT-Site/pt_PT/Search-UpdateGrid?q={q}&start=0&sz=24',
    page: 'https://www.auchan.pt/pt/pesquisa?q={q}',
  },
};

/** Devolve { search: { loja: (q) => resultados }, diagnose(loja, q) }. */
export function createStores({ fetch, parseHTML, env = {} }) {
  const get = async (url, accept) => {
    const r = await fetch(url, { headers: { ...HEADERS, Accept: accept } });
    return { status: r.status, ok: r.ok, text: await r.text(), finalUrl: r.url || url };
  };
  const getJSON = async (url) => {
    const r = await get(url, 'application/json');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return JSON.parse(r.text);
  };
  const fill = (tpl, q) => tpl.replace('{q}', encodeURIComponent(q));

  // Continente, Pingo Doce e Auchan usam a mesma plataforma (Salesforce Commerce Cloud).
  // Tenta a grelha; se falhar ou vier vazia, tenta a página de pesquisa normal.
  const sfcc = (site) => async (q) => {
    let lastError = null;
    for (const tpl of [site.grid, site.page]) {
      try {
        const r = await get(fill(tpl, q), 'text/html,*/*');
        if (!r.ok) { lastError = new Error(`HTTP ${r.status}`); continue; }
        const out = parseSfccGrid(parseHTML(r.text).document, site.origin);
        if (out.length) return out;
      } catch (e) { lastError = e; }
    }
    if (lastError) throw lastError;
    return [];
  };

  const search = {
    continente: sfcc(SFCC_SITES.continente),
    pingodoce: sfcc(SFCC_SITES.pingodoce),
    auchan: sfcc(SFCC_SITES.auchan),
    mercadona: mercadona({ getJSON, env }),
  };

  /** Mostra o que a loja devolve de facto (para acertar os seletores quando um site muda). */
  async function diagnose(store, q) {
    if (store === 'mercadona') {
      const out = { store };
      try {
        const root = await getJSON(`https://tienda.mercadona.pt/api/categories/?lang=pt`);
        const ids = (root.results || []).flatMap((c) => (c.categories || []).map((x) => x.id));
        out.categories = ids.length;
        if (ids.length) {
          const cat = await getJSON(`https://tienda.mercadona.pt/api/categories/${ids[0]}/?lang=pt`);
          const prod = cat.categories?.[0]?.products?.[0];
          out.sampleRaw = prod ? JSON.stringify(prod).slice(0, 1200) : JSON.stringify(cat).slice(0, 1200);
          out.sampleParsed = prod ? mapMercadona(prod) : null;
        }
        out.results = (await search.mercadona(q)).slice(0, 3);
      } catch (e) { out.error = String(e.message || e); }
      return out;
    }
    const site = SFCC_SITES[store];
    const attempts = [];
    for (const tpl of [site.grid, site.page]) {
      const url = fill(tpl, q);
      try {
        const r = await get(url, 'text/html,*/*');
        const doc = parseHTML(r.text).document;
        const parsed = r.ok ? parseSfccGrid(doc, site.origin) : [];
        const i = r.text.indexOf('data-pid');
        attempts.push({
          url, status: r.status, finalUrl: r.finalUrl, bytes: r.text.length,
          title: doc.querySelector('title')?.textContent?.trim() || null,
          tilesWithDataPid: doc.querySelectorAll('[data-pid]').length,
          parsed: parsed.length, first: parsed.slice(0, 2),
          snippet: (i >= 0 ? r.text.slice(Math.max(0, i - 300), i + 2200) : r.text.slice(0, 1500)).replace(/\s+/g, ' '),
        });
      } catch (e) { attempts.push({ url, error: String(e.message || e) }); }
    }
    return { store, attempts };
  }

  return { search, diagnose };
}

// ---------- Salesforce Commerce Cloud (Continente, Pingo Doce, Auchan) ----------
const SFCC_SELECTORS = {
  tile: '[data-pid]',
  name: ['.pwc-tile--description', '.ct-tile--description', '.pdp-link a', '.product-name', '.auc-product-tile__name', '[class*="tile--description"]', '[class*="product-name"]'],
  brand: ['.pwc-tile--brand', '.ct-tile--brand', '[class*="brand"]'],
  price: ['[itemprop="price"]', '.sales .value', '.pwc-tile--price-primary', '.ct-price-formatted', '[class*="price-primary"]', '.price .value'],
  unitPrice: ['.pwc-tile--price-secondary', '.ct-price-value', '[class*="price-secondary"]', '[class*="price-unit"]', '[class*="unit-price"]'],
  size: ['.pwc-tile--quantity', '.ct-tile--quantity', '[class*="quantity"]'],
  json: ['data-product-tile-impression', 'data-gtm', 'data-gtm-info', 'data-product', 'data-gtm-new'],
};

const pick = (el, sels) => {
  for (const s of sels) { const x = el.querySelector(s); if (x && x.textContent.trim()) return x; }
  return null;
};

export function parseSfccGrid(doc, origin) {
  const out = [];
  const seen = new Set();
  for (const tile of doc.querySelectorAll(SFCC_SELECTORS.tile)) {
    const pid = tile.getAttribute('data-pid');
    if (!pid || seen.has(pid)) continue;
    // ignorar elementos interiores com data-pid repetido
    if (tile.parentElement?.closest?.('[data-pid="' + pid + '"]')) continue;
    let meta = {};
    for (const attr of SFCC_SELECTORS.json) {
      const raw = tile.getAttribute(attr) || tile.querySelector(`[${attr}]`)?.getAttribute(attr);
      if (!raw) continue;
      try { const j = JSON.parse(raw); meta = j.ecommerce?.items?.[0] || j.items?.[0] || j; break; } catch { /* atributo não-JSON */ }
    }
    const name = (meta.name || meta.item_name || pick(tile, SFCC_SELECTORS.name)?.textContent || '').replace(/\s+/g, ' ').trim();
    if (!name) continue;
    const priceEl = pick(tile, SFCC_SELECTORS.price);
    const price = parsePrice(meta.price ?? meta.item_price ?? priceEl?.getAttribute('content') ?? priceEl?.textContent);
    if (!(price > 0)) continue;
    const unitText = pick(tile, SFCC_SELECTORS.unitPrice)?.textContent || tile.textContent.match(/\d+[.,]\d{2}\s*€\s*\/\s*\w+/)?.[0];
    const up = parseUnitPrice(unitText);
    const sizeText = pick(tile, SFCC_SELECTORS.size)?.textContent || '';
    const link = [...tile.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).find((hh) => /\.html|\/produto|\/p\//.test(hh));
    const img = tile.querySelector('img');
    seen.add(pid);
    out.push({
      name,
      brand: (meta.brand || meta.item_brand || pick(tile, SFCC_SELECTORS.brand)?.textContent || '').trim() || null,
      price,
      unit_price: up?.value ?? null,
      unit_label: up ? '€/' + up.unit : null,
      size: parseSize(sizeText) || parseSize(name),
      url: link ? new URL(link, origin).href : null,
      image: img ? (img.getAttribute('data-src') || img.getAttribute('src')) : null,
    });
  }
  return out;
}

// ---------- Mercadona ----------
// A loja online tem uma API JSON com as categorias e os produtos (com preço por kg/L).
// Não há pesquisa por texto, por isso carregamos o catálogo (≈ 150 pedidos) e guardamo-lo 12 h em memória.
// MERCADONA_WH: armazém/região (ex.: o que o site usa para o teu código postal). Opcional.
function mercadona({ getJSON, env }) {
  const BASE = 'https://tienda.mercadona.pt/api';
  let cache = { at: 0, products: [] };
  const qs = () => `?lang=pt${env.MERCADONA_WH ? `&wh=${env.MERCADONA_WH}` : ''}`;

  async function catalog() {
    if (cache.products.length && Date.now() - cache.at < 12 * 3600e3) return cache.products;
    const root = await getJSON(`${BASE}/categories/${qs()}`);
    const ids = (root.results || []).flatMap((c) => (c.categories || []).map((s) => s.id));
    const products = [];
    // poucos pedidos de cada vez, para não sobrecarregar o site
    for (let i = 0; i < ids.length; i += 4) {
      const batch = await Promise.all(ids.slice(i, i + 4).map((id) => getJSON(`${BASE}/categories/${id}/${qs()}`).catch(() => null)));
      for (const cat of batch) for (const sub of cat?.categories || []) for (const p of sub.products || []) products.push(mapMercadona(p));
    }
    cache = { at: Date.now(), products };
    return products;
  }

  return async (q) => {
    const words = q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter((w) => w.length > 2);
    const all = await catalog();
    return all
      .map((p) => ({ p, hits: words.filter((w) => p._search.includes(w)).length }))
      .filter((x) => x.hits >= Math.ceil(words.length * 0.6))
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 30)
      .map((x) => x.p);
  };
}

export function mapMercadona(p) {
  const pi = p.price_instructions || {};
  const name = [p.display_name, p.packaging, pi.unit_size && pi.size_format ? `${pi.unit_size} ${pi.size_format}` : ''].filter(Boolean).join(' ');
  const refUnit = { l: 'L', kg: 'kg', ud: 'un', u: 'un' }[(pi.reference_format || '').toLowerCase()] || pi.reference_format;
  return {
    name,
    brand: p.brand || null,
    price: parseFloat(pi.unit_price ?? pi.bulk_price),
    unit_price: pi.reference_price ? parseFloat(pi.reference_price) : null,
    unit_label: refUnit ? '€/' + refUnit : null,
    size: parseSize(name),
    url: p.share_url || null,
    image: p.thumbnail || null,
    _search: (name + ' ' + (p.brand || '')).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''),
  };
}
