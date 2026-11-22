// ============================================================================
// Edge Function "precos" — FICHEIRO ÚNICO GERADO (npm run bundle). Não editar aqui:
// edita supabase/functions/precos/*.js e volta a gerar.
// Colar no painel do Supabase: Edge Functions → Deploy a new function → Via Editor,
// nome da função: precos
// ============================================================================

import { parseHTML } from 'npm:linkedom@0.18.14';

// ---------- lib.js ----------
// Lógica pura de comparação de produtos (sem rede). Testável em Node: npm test
// Usada pela Edge Function "precos".

const normalize = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/(\d),(\d)/g, '$1.$2').replace(/[^a-z0-9.]+/g, ' ').replace(/\s\.|\.\s/g, ' ').trim();

const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'com', 'sem', 'e', 'em', 'a', 'o', 'para', 'emb', 'embalagem', 'un', 'unid', 'pack']);
const tokens = (s) => normalize(s).split(' ').filter((w) => w.length > 1 && !STOP.has(w) && !/^\d/.test(w));

const UNIT = { kg: ['kg', 1], g: ['kg', 0.001], gr: ['kg', 0.001], mg: ['kg', 1e-6], l: ['L', 1], lt: ['L', 1], lts: ['L', 1], litro: ['L', 1], litros: ['L', 1], cl: ['L', 0.01], ml: ['L', 0.001] };
const COUNT = /(\d+)\s*(rolos?|unidades?|un|uni|saquetas?|capsulas?|doses?|lavagens?|toalhitas?|ovos|fraldas?)\b/;

/** "Leite 6x1L" → { amount: 6, unit: 'L' }; "Papel 12 rolos" → { amount: 12, unit: 'un' } */
function parseSize(text) {
  const t = normalize(text);
  let m = t.match(/(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*(kg|gr|g|mg|lts?|l|cl|ml)\b/);
  if (m) return { amount: +m[1] * +m[2] * UNIT[m[3]][1], unit: UNIT[m[3]][0] };
  m = t.match(/(\d+(?:\.\d+)?)\s*(kg|gr|g|mg|lts?|litros?|l|cl|ml)\b/);
  if (m) return { amount: +m[1] * UNIT[m[2]][1], unit: UNIT[m[2]][0] };
  m = t.match(COUNT);
  if (m) return { amount: +m[1], unit: 'un' };
  return null;
}

/** Converte "1,09 €/lt" / "€/Kg" para { value, unit } normalizado. */
function parseUnitPrice(text) {
  if (!text) return null;
  const t = String(text).toLowerCase().replace(',', '.');
  const m = t.match(/(\d+(?:\.\d+)?)\s*€?\s*\/\s*(kg|lt?|un|dz|rolo|m)\b/) || t.match(/€\s*(\d+(?:\.\d+)?)\s*\/\s*(kg|lt?|un|dz|rolo|m)\b/);
  if (!m) return null;
  const unit = { kg: 'kg', l: 'L', lt: 'L', un: 'un', dz: 'dz', rolo: 'un', m: 'm' }[m[2]];
  return { value: +m[1], unit };
}

function parsePrice(text) {
  if (typeof text === 'number') return text;
  const m = String(text || '').replace(/\s/g, '').match(/(\d+)[.,](\d{2})/);
  return m ? +(`${m[1]}.${m[2]}`) : null;
}

/** Completa preço por kg/L quando a loja não o indica. */
function withUnitPrice(o) {
  if (o.unit_price && o.unit_label) return o;
  const size = o.size || parseSize(o.name);
  if (size && size.amount > 0 && o.price > 0) {
    return { ...o, unit_price: +(o.price / size.amount).toFixed(3), unit_label: '€/' + size.unit };
  }
  return o;
}

// Palavras que mudam o produto: se o resultado as tem e a pesquisa não, é outra variante
// (ex.: procurar "arroz agulha" e aparecer "arroz agulha integral"). Acrescenta aqui quando apanhares casos novos.
const VARIANTS = new Set([
  'integral', 'magro', 'meio', 'gordo', 'lactose', 'humido', 'humidas', 'humidos', 'toalhitas', 'light', 'zero', 'bio', 'biologico',
  'vegetal', 'vegetais', 'codorniz', 'travel', 'maquina', 'gel', 'capsulas', 'pastilhas', 'soja', 'aveia', 'amendoa', 'arroz',
  'coco', 'chocolate', 'morango', 'baunilha', 'descafeinado', 'infantil', 'bebe', 'basmati', 'carolino', 'vaporizado', 'thai',
  'agulha', 'tomate', 'picante', 'fumado', 'congelado', 'ultracongelado', 'po', 'liquido', 'concentrado', 'desnatado', 'condensado',
  'achocolatado', 'proteina', 'kids', 'mini', 'aromatizado', 'limao', 'lavanda', 'natural', 'grego', 'aguas', 'sardinha', 'salmao',
]);
function extraVariants(query, resultName) {
  const want = new Set(tokens(query));
  return tokens(resultName).filter((w) => VARIANTS.has(w) && !want.has(w));
}

/** Semelhança (0–1) entre o que procuramos e um resultado da loja. */
function score(item, result) {
  const want = tokens([item.brand, item.name].filter(Boolean).join(' '));
  const got = new Set(tokens([result.brand, result.name].filter(Boolean).join(' ')));
  if (!want.length || !got.size) return 0;
  const match = (w) => got.has(w) || [...got].some((g) => g.length > 3 && w.length > 3 && (g.startsWith(w) || w.startsWith(g)));
  let s = want.filter(match).length / want.length;
  // marca tem de coincidir para ser "o mesmo produto"
  if (item.brand) {
    const b = tokens(item.brand);
    if (b.length && !b.every(match)) s *= 0.5;
  }
  // tamanho parecido (± 15 %)
  const a = item.size ? parseSize(item.size) : parseSize(item.name);
  const c = result.size || parseSize(result.name);
  if (a && c) s *= a.unit === c.unit && Math.abs(a.amount - c.amount) / a.amount <= 0.15 ? 1.1 : 0.7;
  // variante diferente (integral, húmido, codorniz…) não é o mesmo produto
  s *= 0.5 ** extraVariants([item.brand, item.name].join(' '), result.name).length;
  return Math.min(1, s);
}

/** O resultado que é "o mesmo produto" (ou null). */
function pickSame(item, results, threshold = 0.6) {
  let best = null;
  for (const r of results) {
    const s = score(item, r);
    if (s >= threshold && (!best || s > best.score || (s === best.score && r.price < best.price))) best = { ...r, score: +s.toFixed(2) };
  }
  return best;
}

/** O mais barato da mesma categoria: relevante para o termo e com o menor preço por kg/L/un. */
function pickCheapest(item, results) {
  const query = item.compare_as || genericName(item);
  const want = tokens(query);
  const size = item.size ? parseSize(item.size) : parseSize(item.name);
  const relevant = results.filter((r) => {
    const got = tokens(r.name);
    const hits = want.filter((w) => got.some((g) => g === w || (g.length > 3 && w.length > 3 && (g.startsWith(w) || w.startsWith(g))))).length;
    return want.length && hits / want.length >= 0.75;
  }).map(withUnitPrice);
  // sem variantes diferentes (se isso deixar a lista vazia, aceita-as)
  const same = relevant.filter((r) => !extraVariants(query, r.name).length);
  if (same.length) relevant.splice(0, relevant.length, ...same);
  const comparable = relevant.filter((r) => r.unit_price && (!size || r.unit_label === '€/' + size.unit));
  const pool = comparable.length ? comparable : relevant;
  const key = (r) => (comparable.length ? r.unit_price : r.price);
  return pool.reduce((best, r) => (!best || key(r) < key(best) ? r : best), null);
}

/** "Leite meio-gordo Mimosa 1L" (marca Mimosa) → "leite meio gordo" */
function genericName(item) {
  const brand = new Set(tokens(item.brand || ''));
  return tokens(item.name).filter((w) => !brand.has(w)).slice(0, 3).join(' ');
}

/** Corre tarefas com no máximo `limit` em paralelo. */
async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

// ---------- stores.js ----------
// Leitores de cada loja. Cada um recebe um termo de pesquisa e devolve
// [{ name, brand, price, unit_price, unit_label, size, url, image }].
//
// ⚠️ As lojas não têm API pública: isto lê as páginas de pesquisa dos sites.
// Se uma loja mudar o site, só o leitor dessa loja deixa de funcionar — as outras continuam.
// Para corrigir, normalmente basta ajustar os seletores em SFCC_SELECTORS ou o URL abaixo.


const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; DespensaFamiliar/1.0; comparador pessoal)',
  'Accept-Language': 'pt-PT,pt;q=0.9',
};

// URLs de pesquisa. "grid" devolve só a grelha de produtos; "page" é a página de pesquisa normal (alternativa).
const SFCC_SITES = {
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
function createStores({ fetch, parseHTML }) {
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

function parseSfccGrid(doc, origin) {
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

// ---------- index.ts ----------
// Edge Function "precos": procura cada produto da lista nas lojas e devolve
// o mesmo produto e a alternativa mais barata da categoria.
//
// Publicar:  npx supabase functions deploy precos --project-ref <REF>
// Só aceita pedidos de utilizadores com sessão iniciada (verificação JWT ativa por omissão).


const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Item = { id: string; name: string; brand?: string | null; size?: string | null; compare_as?: string | null; category?: string | null };
type Offer = Record<string, unknown> & { name: string; price: number };

const { search: stores, diagnose } = createStores({ fetch, parseHTML }) as {
  search: Record<string, (q: string) => Promise<Offer[]>>;
  diagnose: (store: string, q: string) => Promise<unknown>;
};

// Cache de pesquisas (6 h) para não repetir pedidos às lojas.
const cache = new Map<string, { at: number; value: Promise<Offer[]> }>();
function search(store: string, q: string): Promise<Offer[]> {
  const key = store + '|' + q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 6 * 3600e3) return hit.value;
  const value = stores[store](q).catch((e) => { cache.delete(key); throw e; });
  cache.set(key, { at: Date.now(), value });
  return value;
}

const clean = (o: Offer | null) => {
  if (!o) return null;
  const { _search, size, ...rest } = withUnitPrice(o) as Offer;
  void _search; void size;
  return rest;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const body = await req.json();

    // Diagnóstico: { "diagnose": true, "q": "leite meio gordo", "stores": ["continente"] }
    // Mostra o que cada loja devolve, para acertar os leitores quando um site muda.
    if (body.diagnose) {
      const q = body.q || 'leite meio gordo';
      const which: string[] = (body.stores || Object.keys(stores)).filter((s: string) => s in stores);
      const report = await Promise.all(which.map((s) => diagnose(s, q).catch((e) => ({ store: s, error: String(e) }))));
      return new Response(JSON.stringify({ q, report }, null, 2), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    const items: Item[] = (body.items || []).slice(0, 60);
    const wanted: string[] = (body.stores || Object.keys(stores)).filter((s: string) => s in stores);

    const tasks = items.flatMap((item) => wanted.map((store) => ({ item, store })));
    const results = await pool(tasks, 6, async ({ item, store }) => {
      try {
        const sameQ = [item.brand, item.name, item.size].filter(Boolean).join(' ');
        const catQ = item.compare_as || genericName(item) || item.name;
        const [a, b] = await Promise.all([search(store, sameQ), catQ.toLowerCase() === sameQ.toLowerCase() ? Promise.resolve([]) : search(store, catQ)]);
        return {
          id: item.id, store,
          same: clean(pickSame(item, a)),
          cheapest: clean(pickCheapest(item, [...b, ...a])),
        };
      } catch (e) {
        return { id: item.id, store, same: null, cheapest: null, error: String((e as Error).message || e) };
      }
    });

    return new Response(JSON.stringify({ results, at: new Date().toISOString() }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
