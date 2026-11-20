// Dados da casa, guardados em memória e sincronizados com o Supabase (ou localStorage no modo demonstração).
// As alterações aparecem logo no ecrã ("otimistas") e são enviadas em segundo plano.

import { toast } from './ui.js';
import { demoData } from './demo-data.js';

export const TABLES = ['products', 'shopping_items', 'recipes', 'meal_plan', 'prices', 'events', 'members'];
const TOUCH = new Set(['products', 'recipes']); // tabelas com updated_at

const data = Object.fromEntries(TABLES.map((t) => [t, new Map()]));
const listeners = new Set();
let adapter = null;
let scheduled = false;
const changed = new Set();

export const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); }));

export const store = {
  /** { mode, householdId, household, userId, userName, client } */
  ctx: {},

  all(t) { return [...data[t].values()]; },
  get(t, id) { return data[t].get(id); },

  async start(ctx, adp) {
    this.ctx = ctx;
    adapter = adp;
    await this.reload();
    adapter.subscribe((ev) => {
      if (ev.reload) return this.reload();
      if (ev.type === 'delete') data[ev.table].delete(ev.id);
      else data[ev.table].set(ev.row.id, ev.row);
      emit(ev.table, ev.row && ev.row.user_id !== ctx.userId ? ev : null);
    });
  },

  async reload() {
    const rows = await adapter.loadAll();
    for (const t of TABLES) {
      data[t].clear();
      for (const r of rows[t] || []) data[t].set(r.id, r);
    }
    emit('*');
  },

  insert(t, row) {
    const full = { id: uuid(), household_id: this.ctx.householdId, ...row };
    if (TOUCH.has(t)) full.updated_at = new Date().toISOString();
    if (t === 'events') Object.assign(full, { user_id: this.ctx.userId, user_name: this.ctx.userName, at: new Date().toISOString() });
    if (t === 'prices' && !full.fetched_at) full.fetched_at = new Date().toISOString();
    data[t].set(full.id, full);
    emit(t);
    adapter.insert(t, full).catch((e) => fail(e));
    return full;
  },

  insertMany(t, rows) {
    const full = rows.map((r) => ({ id: uuid(), household_id: this.ctx.householdId, fetched_at: t === 'prices' ? new Date().toISOString() : undefined, ...r }));
    for (const r of full) { if (r.fetched_at === undefined) delete r.fetched_at; data[t].set(r.id, r); }
    emit(t);
    if (full.length) adapter.insertMany(t, full).catch((e) => fail(e));
    return full;
  },

  update(t, id, patch) {
    const cur = data[t].get(id);
    if (!cur) return;
    const p = { ...patch };
    if (TOUCH.has(t)) p.updated_at = new Date().toISOString();
    if (t === 'products') p.updated_by = this.ctx.userId;
    data[t].set(id, { ...cur, ...p });
    emit(t);
    adapter.update(t, id, p).catch((e) => fail(e));
  },

  remove(t, id) {
    if (!data[t].delete(id)) return;
    // A base de dados apaga em cascata; aqui fazemos o mesmo em memória.
    const cascade = { products: [['shopping_items', 'product_id'], ['prices', 'product_id']], recipes: [['meal_plan', 'recipe_id']] }[t] || [];
    for (const [tt, col] of cascade) for (const r of data[tt].values()) if (r[col] === id) data[tt].delete(r.id);
    emit(t);
    adapter.remove(t, id).catch((e) => fail(e));
  },

  /** Regista uma ação no histórico (quem fez o quê). */
  log(type, product, delta, extra = {}) {
    return this.insert('events', {
      type, delta, product_id: product?.id || null, product_name: product?.name || extra.product_name || null,
      grp: product?.grp || null, ...extra,
    });
  },

  /** Muda a quantidade de um produto e regista o movimento. */
  changeQty(product, delta, type = delta < 0 ? 'consume' : 'add', extra = {}) {
    const p = data.products.get(product.id) || product;
    const qty = Math.max(0, +((Number(p.qty) || 0) + delta).toFixed(3));
    const patch = { qty };
    if (qty === 0) patch.opened_at = null; // acabou: deixa de estar "aberto"
    this.update('products', p.id, patch);
    this.log(type, p, +(qty - (Number(p.qty) || 0)).toFixed(3), extra);
    return qty;
  },

  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  invoke(fn, body) { return adapter.invoke(fn, body); },
};

function emit(table, remote = null) {
  changed.add(table);
  if (remote) listeners.forEach((fn) => fn({ remote }));
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    const tables = new Set(changed);
    changed.clear();
    listeners.forEach((fn) => fn({ tables }));
  });
}

function fail(e) {
  console.error(e);
  toast('Não foi possível guardar: ' + (e.message || e), { type: 'error', action: 'Recarregar', onAction: () => store.reload() });
}

// ---------- Supabase ----------
export function supabaseAdapter(sb, householdId) {
  const check = ({ error }) => { if (error) throw error; };
  return {
    async loadAll() {
      const out = {};
      await Promise.all(TABLES.map(async (t) => {
        let q = sb.from(t).select('*').eq('household_id', householdId);
        if (t === 'events') q = q.order('at', { ascending: false }).limit(2000);
        if (t === 'prices') q = q.order('fetched_at', { ascending: false }).limit(4000);
        const { data: rows, error } = await q;
        if (error) throw error;
        out[t] = rows;
      }));
      return out;
    },
    insert: async (t, row) => check(await sb.from(t).insert(clean(row))),
    insertMany: async (t, rows) => check(await sb.from(t).insert(rows.map(clean))),
    update: async (t, id, patch) => check(await sb.from(t).update(clean(patch)).eq('id', id)),
    remove: async (t, id) => check(await sb.from(t).delete().eq('id', id)),
    async invoke(fn, body) {
      const { data: res, error } = await sb.functions.invoke(fn, { body });
      if (error) throw error;
      return res;
    },
    subscribe(cb) {
      const ch = sb.channel('casa-' + householdId);
      for (const t of TABLES) {
        const filter = `household_id=eq.${householdId}`;
        ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: t, filter }, (p) => cb({ table: t, type: 'upsert', row: p.new }));
        ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: t, filter }, (p) => cb({ table: t, type: 'upsert', row: p.new }));
        ch.on('postgres_changes', { event: 'DELETE', schema: 'public', table: t }, (p) => p.old?.id && cb({ table: t, type: 'delete', id: p.old.id }));
      }
      ch.subscribe((status) => { if (status === 'CHANNEL_ERROR') console.warn('Tempo real indisponível'); });
      // Ao voltar à app depois de estar em segundo plano, recarrega (pode ter perdido alterações).
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') cb({ reload: true }); });
    },
  };
}

// Datas vazias têm de ir como null para o Postgres.
function clean(row) {
  const o = {};
  for (const [k, v] of Object.entries(row)) o[k] = v === '' ? null : v;
  return o;
}

// ---------- Modo demonstração (só neste browser) ----------
export function localAdapter() {
  const KEY = 'despensa.demo.v2';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
  let db = read();
  if (!db) { db = demoData(); write(); }
  function write() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* sem espaço / privado */ } }
  const tbl = (t) => (db[t] ||= {});
  return {
    async loadAll() { return Object.fromEntries(TABLES.map((t) => [t, Object.values(tbl(t))])); },
    async insert(t, row) { tbl(t)[row.id] = row; write(); },
    async insertMany(t, rows) { for (const r of rows) tbl(t)[r.id] = r; write(); },
    async update(t, id, patch) { tbl(t)[id] = { ...tbl(t)[id], ...patch }; write(); },
    async remove(t, id) {
      delete tbl(t)[id];
      // imitar "on delete cascade" da base de dados
      if (t === 'products') for (const tt of ['shopping_items', 'prices']) for (const [k, r] of Object.entries(tbl(tt))) if (r.product_id === id) delete tbl(tt)[k];
      if (t === 'recipes') for (const [k, r] of Object.entries(tbl('meal_plan'))) if (r.recipe_id === id) delete tbl('meal_plan')[k];
      write();
    },
    async invoke() { throw new Error('A comparação automática de preços precisa do Supabase (ver README).'); },
    subscribe(cb) {
      window.addEventListener('storage', (e) => { if (e.key === KEY) { db = read() || db; cb({ reload: true }); } });
    },
    reset() { localStorage.removeItem(KEY); },
  };
}
