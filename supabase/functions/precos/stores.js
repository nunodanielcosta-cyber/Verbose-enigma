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
    page: null, // a página /pesquisa do Pingo Doce é de receitas; só a grelha serve
  },
  auchan: {
    origin: 'https://www.auchan.pt',
    grid: 'https://www.auchan.pt/on/demandware.store/Sites-AuchanPT-Site/pt_PT/Search-UpdateGrid?q={q}&start=0&sz=24',
    page: 'https://www.auchan.pt/pt/pesquisa?q={q}',
  },
};

/** Devolve { search: { loja: (q) => resultados }, diagnose(loja, q) }. */
export function createStores({ fetch, parseHTML }) {
  const get = async (url, accept) => {
    const r = await fetch(url, { headers: { ...HEADERS, Accept: accept } });
    return { status: r.status, ok: r.ok, text: await r.text(), finalUrl: r.url || url };
  };
  const fill = (tpl, q) => tpl.replace('{q}', encodeURIComponent(q));

  // Continente, Pingo Doce e Auchan usam a mesma plataforma (Salesforce Commerce Cloud).
  // Tenta a grelha; se falhar ou vier vazia, tenta a página de pesquisa normal.
  const sfcc = (site) => async (q) => {
    let lastError = null;
    for (const tpl of [site.grid, site.page].filter(Boolean)) {
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
  };

  /** Mostra o que a loja devolve de facto (para acertar os seletores quando um site muda). */
  async function diagnose(store, q) {
    const site = SFCC_SITES[store];
    const attempts = [];
    for (const tpl of [site.grid, site.page].filter(Boolean)) {
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
    // Tamanho: do texto da embalagem, do nome, ou deduzido do preço por kg/L (ex.: 0,85 € a 0,85 €/L = 1 L)
    let size = parseSize(sizeText);
    if (!size || size.unit === 'un') size = parseSize(name) || size;
    if ((!size || size.unit === 'un') && up && ['kg', 'L'].includes(up.unit) && up.value > 0) size = { amount: +(price / up.value).toFixed(3), unit: up.unit };
    const link = [...tile.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).find((hh) => /\.html|\/produto|\/p\//.test(hh));
    const img = tile.querySelector('img');
    seen.add(pid);
    out.push({
      name,
      brand: (meta.brand || meta.item_brand || pick(tile, SFCC_SELECTORS.brand)?.textContent || '').trim() || null,
      price,
      unit_price: up?.value ?? null,
      unit_label: up ? '€/' + up.unit : null,
      size,
      url: link ? new URL(link, origin).href : null,
      image: img ? (img.getAttribute('data-src') || img.getAttribute('src')) : null,
    });
  }
  return out;
}
