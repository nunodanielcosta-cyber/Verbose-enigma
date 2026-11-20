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

export function createStores({ fetch, parseHTML, env = {} }) {
  const getText = async (url) => {
    const r = await fetch(url, { headers: { ...HEADERS, Accept: 'text/html,*/*' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  };
  const getJSON = async (url) => {
    const r = await fetch(url, { headers: { ...HEADERS, Accept: 'application/json' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  };

  // Continente, Pingo Doce e Auchan usam a mesma plataforma (Salesforce Commerce Cloud),
  // que tem um URL de pesquisa que devolve só a grelha de produtos.
  const sfcc = (gridUrl, origin) => async (q) => {
    const url = `${gridUrl}?q=${encodeURIComponent(q)}&start=0&sz=24`;
    return parseSfccGrid(parseHTML(await getText(url)).document, origin);
  };

  return {
    continente: sfcc('https://www.continente.pt/on/demandware.store/Sites-continente-Site/default/Search-UpdateGrid', 'https://www.continente.pt'),
    pingodoce: sfcc('https://www.pingodoce.pt/on/demandware.store/Sites-pingo-doce-Site/default/Search-UpdateGrid', 'https://www.pingodoce.pt'),
    auchan: sfcc('https://www.auchan.pt/on/demandware.store/Sites-AuchanPT-Site/pt_PT/Search-UpdateGrid', 'https://www.auchan.pt'),
    mercadona: mercadona({ getJSON, env }),
  };
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
