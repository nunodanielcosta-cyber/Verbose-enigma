// Lógica pura de comparação de produtos (sem rede). Testável em Node: npm test
// Usada pela Edge Function "precos".

export const normalize = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/(\d),(\d)/g, '$1.$2').replace(/[^a-z0-9.]+/g, ' ').replace(/\s\.|\.\s/g, ' ').trim();

const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'com', 'sem', 'e', 'em', 'a', 'o', 'para', 'emb', 'embalagem', 'un', 'unid', 'pack']);
export const tokens = (s) => normalize(s).split(' ').filter((w) => w.length > 1 && !STOP.has(w) && !/^\d/.test(w));

const UNIT = { kg: ['kg', 1], g: ['kg', 0.001], gr: ['kg', 0.001], mg: ['kg', 1e-6], l: ['L', 1], lt: ['L', 1], lts: ['L', 1], litro: ['L', 1], litros: ['L', 1], cl: ['L', 0.01], ml: ['L', 0.001] };
const COUNT = /(\d+)\s*(rolos?|unidades?|un|uni|saquetas?|capsulas?|doses?|lavagens?|toalhitas?|ovos|fraldas?)\b/;

/** "Leite 6x1L" → { amount: 6, unit: 'L' }; "Papel 12 rolos" → { amount: 12, unit: 'un' } */
export function parseSize(text) {
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
export function parseUnitPrice(text) {
  if (!text) return null;
  const t = String(text).toLowerCase().replace(',', '.');
  const m = t.match(/(\d+(?:\.\d+)?)\s*€?\s*\/\s*(kg|lt?|un|dz|rolo|m)\b/) || t.match(/€\s*(\d+(?:\.\d+)?)\s*\/\s*(kg|lt?|un|dz|rolo|m)\b/);
  if (!m) return null;
  const unit = { kg: 'kg', l: 'L', lt: 'L', un: 'un', dz: 'dz', rolo: 'un', m: 'm' }[m[2]];
  return { value: +m[1], unit };
}

export function parsePrice(text) {
  if (typeof text === 'number') return text;
  const m = String(text || '').replace(/\s/g, '').match(/(\d+)[.,](\d{2})/);
  return m ? +(`${m[1]}.${m[2]}`) : null;
}

/** Completa preço por kg/L quando a loja não o indica. */
export function withUnitPrice(o) {
  if (o.unit_price && o.unit_label) return o;
  const size = o.size || parseSize(o.name);
  if (size && size.amount > 0 && o.price > 0) {
    return { ...o, unit_price: +(o.price / size.amount).toFixed(3), unit_label: '€/' + size.unit };
  }
  return o;
}

/** Semelhança (0–1) entre o que procuramos e um resultado da loja. */
export function score(item, result) {
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
  return Math.min(1, s);
}

/** O resultado que é "o mesmo produto" (ou null). */
export function pickSame(item, results, threshold = 0.6) {
  let best = null;
  for (const r of results) {
    const s = score(item, r);
    if (s >= threshold && (!best || s > best.score || (s === best.score && r.price < best.price))) best = { ...r, score: +s.toFixed(2) };
  }
  return best;
}

/** O mais barato da mesma categoria: relevante para o termo e com o menor preço por kg/L/un. */
export function pickCheapest(item, results) {
  const query = item.compare_as || genericName(item);
  const want = tokens(query);
  const size = item.size ? parseSize(item.size) : parseSize(item.name);
  const relevant = results.filter((r) => {
    const got = tokens(r.name);
    const hits = want.filter((w) => got.some((g) => g === w || (g.length > 3 && w.length > 3 && (g.startsWith(w) || w.startsWith(g))))).length;
    return want.length && hits / want.length >= 0.75;
  }).map(withUnitPrice);
  const comparable = relevant.filter((r) => r.unit_price && (!size || r.unit_label === '€/' + size.unit));
  const pool = comparable.length ? comparable : relevant;
  const key = (r) => (comparable.length ? r.unit_price : r.price);
  return pool.reduce((best, r) => (!best || key(r) < key(best) ? r : best), null);
}

/** "Leite meio-gordo Mimosa 1L" (marca Mimosa) → "leite meio gordo" */
export function genericName(item) {
  const brand = new Set(tokens(item.brand || ''));
  return tokens(item.name).filter((w) => !brand.has(w)).slice(0, 3).join(' ');
}

/** Corre tarefas com no máximo `limit` em paralelo. */
export async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}
