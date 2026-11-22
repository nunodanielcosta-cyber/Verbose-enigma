// Regras da aplicação. Funções puras (sem interface), fáceis de testar.

export const GROUPS = [
  { id: 'alimentar', label: 'Alimentar', emoji: '🍎' },
  { id: 'bebidas', label: 'Bebidas', emoji: '🥤' },
  { id: 'limpeza', label: 'Limpeza', emoji: '🧽' },
  { id: 'higiene', label: 'Higiene', emoji: '🧴' },
  { id: 'casa', label: 'Casa', emoji: '🏠' },
  { id: 'animais', label: 'Animais', emoji: '🐾' },
  { id: 'bebe', label: 'Bebé', emoji: '🍼' },
  { id: 'outros', label: 'Outros', emoji: '📦' },
];
export const groupOf = (id) => GROUPS.find((g) => g.id === id) || GROUPS[GROUPS.length - 1];

export const STORES = [
  { id: 'continente', label: 'Continente', color: '#e30613', online: true },
  { id: 'pingodoce', label: 'Pingo Doce', color: '#5aa531', online: true },
  { id: 'auchan', label: 'Auchan', color: '#e2001a', online: true },
  { id: 'mercadona', label: 'Mercadona', color: '#00a650', online: false }, // sem loja online em Portugal: só preços manuais/talão
  { id: 'lidl', label: 'Lidl', color: '#0050aa', online: false }, // sem loja online de alimentação: só preços manuais/talão
];
export const storeOf = (id) => STORES.find((s) => s.id === id) || { id, label: id, color: '#888' };

export const UNITS = ['un', 'kg', 'g', 'L', 'ml', 'pacote', 'lata', 'frasco', 'garrafa', 'caixa', 'rolo', 'saco'];
export const MEALS = [{ id: 'almoco', label: 'Almoço' }, { id: 'jantar', label: 'Jantar' }];

// ---------- Datas ----------
export const todayISO = () => toISO(new Date());
export function toISO(d) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}
export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toISO(d);
}
export function daysUntil(iso, from = todayISO()) {
  if (!iso) return null;
  return Math.round((new Date(iso + 'T00:00:00') - new Date(from + 'T00:00:00')) / 86400000);
}

/** Validade real: a mais próxima entre a da embalagem e a "depois de aberto". */
export function effectiveExpiry(p) {
  let exp = p.expiry || null;
  if (p.opened_at && p.open_days) {
    const opened = addDays(p.opened_at, p.open_days);
    if (!exp || opened < exp) exp = opened;
  }
  return exp;
}

export function expiryStatus(p, warnDays = 5) {
  if (!(p.qty > 0)) return null;
  const d = daysUntil(effectiveExpiry(p));
  if (d === null) return null;
  if (d < 0) return { level: 'past', days: d, text: d === -1 ? 'Expirou ontem' : `Expirou há ${-d} dias` };
  if (d === 0) return { level: 'past', days: 0, text: 'Expira hoje' };
  if (d <= warnDays) return { level: 'soon', days: d, text: d === 1 ? 'Expira amanhã' : `Expira em ${d} dias` };
  return { level: 'ok', days: d, text: '' };
}

// ---------- Unidades ----------
const FACTORS = { g: ['kg', 0.001], kg: ['kg', 1], mg: ['kg', 1e-6], ml: ['L', 0.001], cl: ['L', 0.01], l: ['L', 1], lt: ['L', 1] };
const base = (u) => FACTORS[(u || '').toLowerCase()];

/** Converte uma quantidade de uma receita (ex.: 200 g) para a unidade do produto (ex.: 0,2 kg ou 0,2 pacotes de 1 kg). */
export function convertToProduct(qty, unit, p) {
  if (!unit || !p || unit === p.unit) return qty;
  const from = base(unit);
  const to = base(p.unit);
  if (from && to && from[0] === to[0]) return (qty * from[1]) / to[1];
  const pkg = base(p.package_unit);
  if (from && pkg && from[0] === pkg[0] && p.package_size > 0) return (qty * from[1]) / (pkg[1] * p.package_size);
  return qty;
}

/** Quantidade de uma embalagem na unidade base (kg/L), para calcular preço por kg/L. */
export function packageBase(p) {
  const b = base(p.package_unit);
  return b && p.package_size > 0 ? { amount: p.package_size * b[1], unit: b[0] } : null;
}

// ---------- Lista de compras ----------
export const isTracked = (p) => p.min > 0 || p.max > 0;

/** Quanto falta de cada produto para as refeições planeadas (de hoje até +days). */
export function planNeeds(products, recipes, plan, { from = todayISO(), days = 7 } = {}) {
  const to = addDays(from, days - 1);
  const byId = new Map(products.map((p) => [p.id, p]));
  const recipesById = new Map(recipes.map((r) => [r.id, r]));
  const needs = new Map(); // product_id -> { qty, recipes:Set }
  const loose = new Map(); // ingredientes sem produto associado -> { name, qty, unit, recipes }
  for (const m of plan) {
    if (m.cooked || m.day < from || m.day > to) continue;
    const r = recipesById.get(m.recipe_id);
    if (!r) continue;
    const factor = (m.servings || r.servings || 1) / (r.servings || 1);
    for (const ing of r.ingredients || []) {
      const q = (Number(ing.qty) || 0) * factor;
      const p = ing.product_id && byId.get(ing.product_id);
      if (p) {
        const e = needs.get(p.id) || { qty: 0, recipes: new Set() };
        e.qty += convertToProduct(q, ing.unit, p);
        e.recipes.add(r.name);
        needs.set(p.id, e);
      } else if (ing.name) {
        const key = ing.name.trim().toLowerCase() + '|' + (ing.unit || '');
        const e = loose.get(key) || { name: ing.name.trim(), unit: ing.unit || '', qty: 0, recipes: new Set() };
        e.qty += q;
        e.recipes.add(r.name);
        loose.set(key, e);
      }
    }
  }
  return { needs, loose };
}

/**
 * Lista de compras completa:
 *  - produtos com quantidade ≤ mínimo → comprar até ao máximo
 *  - ingredientes das refeições planeadas que não chegam
 *  - itens adicionados à mão
 */
export function shoppingList({ products, recipes = [], plan = [], extras = [] }, opts = {}) {
  const { needs, loose } = planNeeds(products, recipes, plan, opts);
  const out = [];
  for (const p of products) {
    const meal = needs.get(p.id)?.qty || 0;
    const after = (Number(p.qty) || 0) - meal; // o que sobra depois de cozinhar o plano
    const tracked = isTracked(p);
    let buy = 0;
    const reasons = [];
    if (tracked && after <= p.min) {
      // Atingiu o mínimo: comprar até ao máximo (e repor o que as receitas vão gastar).
      const target = Math.max(p.max || 0, p.min || 0);
      buy = target - after;
      if (buy <= 0) buy = 1; // mínimo = máximo: compra pelo menos 1
      if ((Number(p.qty) || 0) <= p.min) reasons.push('mínimo');
      if (meal > 0) reasons.push('receitas');
    } else if (!tracked && after < 0) {
      buy = -after;
      reasons.push('receitas');
    }
    if (buy > 0) {
      out.push({
        key: 'p:' + p.id, product: p, name: p.name, unit: p.unit, qty: roundUp(buy, p.unit),
        reasons, recipes: [...(needs.get(p.id)?.recipes || [])],
      });
    }
  }
  for (const l of loose.values()) {
    out.push({ key: 'l:' + l.name + l.unit, product: null, name: l.name, unit: l.unit, qty: roundUp(l.qty, l.unit), reasons: ['receitas'], recipes: [...l.recipes] });
  }
  for (const x of extras) {
    const p = x.product_id && products.find((pp) => pp.id === x.product_id);
    const existing = p && out.find((o) => o.product?.id === p.id);
    if (existing) { existing.qty += Number(x.qty) || 0; existing.extra = x; existing.reasons.push('manual'); continue; }
    out.push({ key: 'x:' + x.id, product: p || null, extra: x, name: p?.name || x.name, unit: x.unit || p?.unit || '', qty: Number(x.qty) || 1, reasons: ['manual'], recipes: [], note: x.note });
  }
  return out.sort((a, b) => (a.product?.category || 'zz').localeCompare(b.product?.category || 'zz', 'pt') || a.name.localeCompare(b.name, 'pt'));
}

// Para unidades contáveis arredonda para cima (não se compra meio pacote).
const COUNTABLE = new Set(['un', 'pacote', 'lata', 'frasco', 'garrafa', 'caixa', 'rolo', 'saco', '']);
function roundUp(q, unit) {
  return COUNTABLE.has(unit || '') ? Math.ceil(q - 1e-9) : Math.round(q * 1000) / 1000;
}

/** Embalagens a comprar, para estimar o custo. */
export function packsFor(item) {
  const p = item.product;
  if (!p) return Math.max(1, Math.ceil(item.qty));
  if (p.package_unit === 'un' && p.package_size > 1) return Math.max(1, Math.ceil(item.qty / p.package_size - 1e-9)); // ex.: pacote de 12 rolos
  const b = base(p.unit);
  const pkg = packageBase(p);
  if (b && pkg && b[0] === pkg.unit) return Math.max(1, Math.ceil((item.qty * b[1]) / pkg.amount - 1e-9));
  return Math.max(1, Math.ceil(item.qty - 1e-9));
}

// ---------- Preços ----------
/** Preço mais recente de cada loja para um produto/tipo. */
export function latestPrices(prices, productId, kinds = ['same', 'manual', 'receipt']) {
  const best = new Map();
  for (const pr of prices) {
    if (pr.product_id !== productId || !kinds.includes(pr.kind)) continue;
    const cur = best.get(pr.store);
    if (!cur || pr.fetched_at > cur.fetched_at) best.set(pr.store, pr);
  }
  return best;
}

export function bestStoreFor(prices, productId) {
  let best = null;
  for (const pr of latestPrices(prices, productId).values()) {
    if (!best || pr.price < best.price) best = pr;
  }
  return best;
}

// ---------- Consumo ----------
/** Sugere mínimo e máximo com base no consumo dos últimos 90 dias. */
export function suggestMinMax(events, productId, now = Date.now()) {
  const since = now - 90 * 86400000;
  let used = 0;
  let first = now;
  for (const e of events) {
    if (e.product_id !== productId || !['consume', 'cook'].includes(e.type)) continue;
    const t = new Date(e.at).getTime();
    if (t < since) continue;
    used += Math.abs(Number(e.delta) || 0);
    first = Math.min(first, t);
  }
  if (!used) return null;
  const days = Math.max(14, (now - first) / 86400000);
  const perWeek = (used / days) * 7;
  return {
    perWeek,
    min: Math.max(1, Math.ceil(perWeek * 0.5)),
    max: Math.max(2, Math.ceil(perWeek * 2)),
  };
}

// ---------- Receitas ----------
export function recipeStatus(recipe, products, servings) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const factor = (servings || recipe.servings || 1) / (recipe.servings || 1);
  const rows = (recipe.ingredients || []).map((ing) => {
    const p = ing.product_id && byId.get(ing.product_id);
    const need = p ? convertToProduct((Number(ing.qty) || 0) * factor, ing.unit, p) : null;
    const ok = p ? (Number(p.qty) || 0) >= need - 1e-9 && p.qty > 0 : null;
    return { ing, product: p || null, need, ok };
  });
  const missing = rows.filter((r) => r.ok === false).length;
  const unknown = rows.filter((r) => r.ok === null).length;
  return { rows, missing, unknown, canCook: missing === 0 };
}

/** Receitas que usam produtos a expirar — "usar primeiro". */
export function useFirst(recipes, products, warnDays = 5) {
  const expiring = new Map();
  for (const p of products) {
    const st = expiryStatus(p, warnDays);
    if (st && st.level !== 'ok') expiring.set(p.id, p);
  }
  return recipes
    .map((r) => {
      const uses = (r.ingredients || []).map((i) => expiring.get(i.product_id)).filter(Boolean);
      return { recipe: r, uses, status: recipeStatus(r, products) };
    })
    .filter((x) => x.uses.length)
    .sort((a, b) => b.uses.length - a.uses.length || a.status.missing - b.status.missing);
}

// ---------- Texto ----------
export const normalize = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Semelhança entre dois textos (0–1), tolerante a ordem das palavras e abreviaturas de talões. */
export function similarity(a, b) {
  const ta = normalize(a).split(' ').filter((w) => w.length > 1);
  const tb = normalize(b).split(' ').filter((w) => w.length > 1);
  if (!ta.length || !tb.length) return 0;
  let hit = 0;
  for (const w of ta) {
    if (tb.some((x) => x === w || (w.length >= 3 && x.length >= 3 && (x.startsWith(w) || w.startsWith(x))))) hit++;
  }
  return hit / Math.max(ta.length, Math.min(tb.length, ta.length + 1));
}

export function bestMatch(text, products, min = 0.5) {
  let best = null;
  for (const p of products) {
    const s = Math.max(similarity(text, p.name), similarity(text, [p.brand, p.name].filter(Boolean).join(' ')));
    if (s >= min && (!best || s > best.score)) best = { product: p, score: s };
  }
  return best;
}

// ---------- Voz ----------
const NUMBERS = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, meio: 0.5, meia: 0.5, doze: 12, duzia: 12 };
const VERBS = [
  { type: 'consume', words: ['gastei', 'usei', 'tirei', 'consumi', 'comi', 'bebi', 'acabou', 'acabaram', 'retira', 'tira', 'gasta'] },
  { type: 'add', words: ['comprei', 'adiciona', 'adicionar', 'junta', 'juntar', 'mete', 'arrumei', 'chegou', 'chegaram', 'trouxe'] },
  { type: 'shop', words: ['lista', 'comprar', 'falta', 'faltam', 'precisamos', 'preciso'] },
];
const FILLER = new Set(['de', 'do', 'da', 'dos', 'das', 'o', 'a', 'os', 'as', 'e', 'na', 'no', 'para', 'à', 'ao', 'mais', 'pacote', 'pacotes', 'lata', 'latas', 'garrafa', 'garrafas', 'unidade', 'unidades', 'frasco', 'frascos', 'caixa', 'caixas', 'kg', 'quilo', 'quilos', 'litro', 'litros', 'rolo', 'rolos', 'saco', 'sacos']);

/** "Gastei dois pacotes de arroz e um leite" → [{type:'consume', qty:2, text:'arroz'}, {type:'consume', qty:1, text:'leite'}] */
export function parseVoice(text) {
  const words = normalize(text).split(' ');
  let type = 'add';
  for (const v of VERBS) if (words.some((w) => v.words.includes(w))) { type = v.type; break; }
  const verbWords = new Set(VERBS.flatMap((v) => v.words));
  const parts = normalize(text).split(/\s(?:e|mais)\s|,/);
  const out = [];
  for (const part of parts) {
    let qty = null;
    const rest = [];
    for (const w of part.split(' ')) {
      if (!w || verbWords.has(w)) continue;
      if (qty === null && /^\d+([.,]\d+)?$/.test(w)) { qty = parseFloat(w.replace(',', '.')); continue; }
      if (qty === null && NUMBERS[w] !== undefined) { qty = NUMBERS[w]; continue; }
      if (FILLER.has(w) || w === 'a' || w === 'compras') continue;
      rest.push(w);
    }
    if (rest.length) out.push({ type, qty: qty ?? 1, text: rest.join(' ') });
  }
  return out;
}

// ---------- Leitura de datas (OCR) ----------
const MONTHS = { jan: 1, fev: 2, feb: 2, mar: 3, abr: 4, apr: 4, mai: 5, may: 5, jun: 6, jul: 7, ago: 8, aug: 8, set: 9, sep: 9, out: 10, oct: 10, nov: 11, dez: 12, dec: 12 };

/** Procura uma data de validade num texto lido por OCR. Devolve 'AAAA-MM-DD' ou null. */
export function findDate(text, today = todayISO()) {
  const t = (text || '').toLowerCase().replace(/[oO]/g, (m, i, s) => (/\d/.test(s[i - 1] || '') || /\d/.test(s[i + 1] || '') ? '0' : m));
  const found = [];
  const push = (d, m, y) => {
    y = y < 100 ? 2000 + y : y;
    if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return;
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (!isNaN(new Date(iso + 'T00:00:00'))) found.push(iso);
  };
  for (const m of t.matchAll(/\b(\d{1,2})\s*[./\-\s]\s*(\d{1,2})\s*[./\-\s]\s*(\d{2,4})\b/g)) push(+m[1], +m[2], +m[3]);
  for (const m of t.matchAll(/\b(\d{1,2})\s*[./\-\s]?\s*([a-z]{3})[a-z]*\.?\s*[./\-\s]?\s*(\d{2,4})\b/g)) if (MONTHS[m[2]]) push(+m[1], MONTHS[m[2]], +m[3]);
  // só mês/ano (ex.: 08/2027) → último dia do mês
  if (!found.length) {
    for (const m of t.matchAll(/\b(\d{1,2})\s*[./\-]\s*(20\d{2}|\d{2})\b/g)) {
      const mo = +m[1];
      let y = +m[2];
      y = y < 100 ? 2000 + y : y;
      if (mo >= 1 && mo <= 12) push(new Date(y, mo, 0).getDate(), mo, y);
    }
  }
  // preferir a data futura mais próxima (a de produção costuma ser anterior)
  const future = found.filter((d) => d >= addDays(today, -30)).sort();
  return future[0] || found.sort().pop() || null;
}

/** Códigos GS1 (DataMatrix / GS1-128) podem trazer validade: (17)AAMMDD. */
export function parseGS1(raw) {
  if (!raw) return null;
  const s = raw.replace(/^\]\w\d/, '').replace(/[()]/g, (c) => (c === '(' ? '\x1d' : '')).replace(/^\x1d/, '');
  const gtin = s.match(/(?:^|\x1d)01(\d{14})/);
  if (!gtin) return null;
  // procurar a validade só DEPOIS do GTIN (senão os dígitos do próprio código confundem)
  const rest = s.slice(gtin.index + gtin[0].length);
  const exp = rest.match(/(?:^|\x1d)(?:17|15)(\d{2})(\d{2})(\d{2})/) || s.slice(0, gtin.index).match(/^(?:17|15)(\d{2})(\d{2})(\d{2})/);
  let expiry = null;
  if (exp) {
    const y = 2000 + +exp[1];
    const m = +exp[2];
    let d = +exp[3];
    if (d === 0) d = new Date(y, m, 0).getDate();
    expiry = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return { gtin: gtin[1].replace(/^0+(?=\d{13}$)/, ''), expiry };
}

// ---------- Talões ----------
/** Extrai linhas "PRODUTO ... 1,99" de um talão lido por OCR. */
export function parseReceipt(text) {
  const skip = /total|subtotal|iva|troco|multibanco|visa|mb way|desconto|cart[aã]o|poupan|saldo|nif|contribuinte|fatura|data|hora|obrigado|pagamento|numer[aá]rio|entregue/i;
  const lines = [];
  for (const raw of (text || '').split(/\n/)) {
    const line = raw.replace(/\s+/g, ' ').trim();
    const m = line.match(/^(?:(\d+)\s*[xX]\s*)?(.{3,}?)\s+(-?\d{1,4}[.,]\d{2})\s*(?:€|eur|[a-z])?$/i);
    if (!m || skip.test(line)) continue;
    const price = parseFloat(m[3].replace(',', '.'));
    if (!(price > 0)) continue;
    const name = m[2].replace(/^[\d\s.*%]+/, '').replace(/\s+\d+[.,]\d{2}$/, '').trim();
    if (name.replace(/[^a-z]/gi, '').length < 3) continue;
    lines.push({ name, qty: m[1] ? +m[1] : 1, price });
  }
  return lines;
}

// ---------- Emoji do produto (quando não há fotografia) ----------
const CAT_EMOJI = [
  ['latic|leite|iogurte|queijo|manteiga', '🥛'], ['ovo', '🥚'], ['conserva|atum|sardinha|polpa', '🥫'], ['talho|carne|frango|peru|porco', '🍗'],
  ['peixe|bacalhau|marisco', '🐟'], ['fruta|legume|cebola|batata|tomate|alface', '🥕'], ['padaria|pao|tosta', '🍞'], ['congel|gelado', '🧊'],
  ['cafe|cha|capsula', '☕'], ['agua', '💧'], ['sumo|refrigerante', '🧃'], ['vinho|cerveja', '🍷'], ['bolach|doce|chocolate|snack', '🍪'],
  ['cereal|pequeno almoco', '🥣'], ['azeite|oleo', '🫒'], ['arroz', '🍚'], ['massa|esparguete', '🍝'], ['mercearia|farinha|acucar|sal', '🌾'],
  ['roupa|amaciador', '👕'], ['loica|cozinha', '🍽️'], ['lixivia|desinfet|wc|casa', '🧽'], ['papel|guardanapo|rolo', '🧻'],
  ['oral|dent', '🪥'], ['champo|gel|banho|sabonete', '🧴'], ['gato', '🐱'], ['cao', '🐶'], ['fralda|bebe', '🍼'], ['pilha|lampada', '🔋'],
];
export function productEmoji(p) {
  const t = normalize(`${p.category || ''} ${p.name || ''}`);
  for (const [re, e] of CAT_EMOJI) if (new RegExp(re).test(t)) return e;
  return groupOf(p.grp).emoji;
}
