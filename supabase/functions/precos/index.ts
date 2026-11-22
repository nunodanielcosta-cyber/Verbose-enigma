// Edge Function "precos": procura cada produto da lista nas lojas e devolve
// o mesmo produto e a alternativa mais barata da categoria.
//
// Publicar:  npx supabase functions deploy precos --project-ref <REF>
// Só aceita pedidos de utilizadores com sessão iniciada (verificação JWT ativa por omissão).

import { parseHTML } from 'npm:linkedom@0.18.14';
import { createStores } from './stores.js';
import { pickSame, pickCheapest, genericName, withUnitPrice, pool } from './lib.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Item = { id: string; name: string; brand?: string | null; size?: string | null; compare_as?: string | null; category?: string | null };
type Offer = Record<string, unknown> & { name: string; price: number };

const { search: stores, diagnose } = createStores({ fetch, parseHTML, env: { MERCADONA_WH: Deno.env.get('MERCADONA_WH') ?? '' } }) as {
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
