// Despensa — catálogo simples da despensa.
// Tudo corre no browser; os dados ficam em localStorage (chave STORAGE_KEY).

const STORAGE_KEY = 'despensa.v1';
const SOON_DAYS = 7; // "a expirar em breve" se faltar até X dias

const DEFAULT_UNITS = ['un', 'kg', 'g', 'L', 'ml', 'pacote', 'lata', 'frasco'];

const $ = (sel) => document.querySelector(sel);
const state = { items: load(), view: 'stock' };

// ---------- Armazenamento ----------
function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
  render();
}

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

// ---------- Regras ----------
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  return Math.round((d - today) / 86400000);
}

const needsBuying = (it) => it.qty <= 0 || (it.min > 0 && it.qty <= it.min);

function expiryLabel(it) {
  const d = daysUntil(it.expiry);
  if (d === null) return null;
  const date = new Date(it.expiry + 'T00:00:00').toLocaleDateString('pt-PT');
  if (d < 0) return { cls: 'exp-past', text: `Expirou ${date}` };
  if (d === 0) return { cls: 'exp-past', text: 'Expira hoje' };
  if (d <= SOON_DAYS) return { cls: 'exp-soon', text: `Expira em ${d} dia${d > 1 ? 's' : ''}` };
  return { cls: '', text: `Val. ${date}` };
}

const fmtQty = (n) => Number(n.toFixed(3)).toLocaleString('pt-PT');

// ---------- Render ----------
function render() {
  const q = $('#search').value.trim().toLowerCase();
  const cat = $('#filterCategory').value;
  const loc = $('#filterLocation').value;
  const sort = $('#sort').value;

  let items = state.items.filter((it) =>
    (!q || [it.name, it.category, it.location, it.notes].join(' ').toLowerCase().includes(q)) &&
    (!cat || it.category === cat) &&
    (!loc || it.location === loc) &&
    (state.view === 'stock' || needsBuying(it))
  );

  const cmp = {
    name: (a, b) => a.name.localeCompare(b.name, 'pt'),
    expiry: (a, b) => (a.expiry || '9999').localeCompare(b.expiry || '9999'),
    qty: (a, b) => a.qty - b.qty,
    updated: (a, b) => (b.updated || 0) - (a.updated || 0),
  }[sort];
  items.sort(cmp);

  const list = $('#list');
  list.replaceChildren(...items.map(itemEl));
  $('#empty').hidden = items.length > 0;
  $('#empty').innerHTML = state.view === 'shopping'
    ? 'Lista de compras vazia 🎉'
    : 'Nada por aqui. Toca em <strong>+</strong> para adicionar.';

  // Alertas de validade
  const expired = state.items.filter((it) => it.qty > 0 && daysUntil(it.expiry) !== null && daysUntil(it.expiry) < 0).length;
  const soon = state.items.filter((it) => { const d = daysUntil(it.expiry); return it.qty > 0 && d !== null && d >= 0 && d <= SOON_DAYS; }).length;
  const alerts = [];
  if (expired) alerts.push(`⚠️ ${expired} produto(s) fora de validade`);
  if (soon) alerts.push(`⏳ ${soon} a expirar nos próximos ${SOON_DAYS} dias`);
  $('#alerts').hidden = !alerts.length || state.view !== 'stock';
  $('#alerts').textContent = alerts.join(' · ');

  const shop = state.items.filter(needsBuying).length;
  $('#shopCount').hidden = !shop;
  $('#shopCount').textContent = shop;

  refreshOptions();
}

function itemEl(it) {
  const li = document.createElement('li');
  li.className = 'item' + (it.qty <= 0 ? ' out' : needsBuying(it) ? ' low' : '');

  const info = document.createElement('div');
  info.className = 'info';
  info.addEventListener('click', () => openDialog(it));

  const name = document.createElement('div');
  name.className = 'name';
  name.textContent = it.name;

  const meta = document.createElement('div');
  meta.className = 'meta';
  const exp = expiryLabel(it);
  for (const part of [it.category, it.location, exp, it.notes]) {
    if (!part) continue;
    const s = document.createElement('span');
    if (typeof part === 'object') { s.className = part.cls; s.textContent = part.text; }
    else s.textContent = part;
    meta.append(s);
  }
  info.append(name, meta);

  const qty = document.createElement('div');
  qty.className = 'qty';
  const minus = btn('−', `Retirar 1 ${it.name}`, () => changeQty(it.id, -1));
  const plus = btn('+', `Adicionar 1 ${it.name}`, () => changeQty(it.id, +1));
  const val = document.createElement('span');
  val.textContent = `${fmtQty(it.qty)} ${it.unit || ''}`.trim();
  qty.append(minus, val, plus);

  li.append(info, qty);
  return li;
}

function btn(text, label, onClick) {
  const b = document.createElement('button');
  b.textContent = text;
  b.setAttribute('aria-label', label);
  b.addEventListener('click', onClick);
  return b;
}

function refreshOptions() {
  const uniq = (key) => [...new Set(state.items.map((i) => i[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt'));
  fillSelect('#filterCategory', uniq('category'), 'Categoria: todas');
  fillSelect('#filterLocation', uniq('location'), 'Local: todos');
  fillDatalist('#nameList', uniq('name'));
  fillDatalist('#categoryList', uniq('category'));
  fillDatalist('#locationList', uniq('location'));
  fillDatalist('#unitList', [...new Set([...DEFAULT_UNITS, ...uniq('unit')])]);
}

function fillSelect(sel, values, allLabel) {
  const el = $(sel);
  const current = el.value;
  el.replaceChildren(new Option(allLabel, ''), ...values.map((v) => new Option(v, v)));
  el.value = values.includes(current) ? current : '';
}

function fillDatalist(sel, values) {
  $(sel).replaceChildren(...values.map((v) => new Option(v)));
}

// ---------- Ações ----------
function changeQty(id, delta) {
  const it = state.items.find((i) => i.id === id);
  if (!it) return;
  it.qty = Math.max(0, +(it.qty + delta).toFixed(3));
  it.updated = Date.now();
  save();
}

function openDialog(it = null) {
  const form = $('#itemForm');
  form.reset();
  $('#dialogTitle').textContent = it ? 'Editar produto' : 'Novo produto';
  $('#deleteBtn').hidden = !it;
  if (it) {
    for (const [k, v] of Object.entries(it)) {
      if (form.elements[k]) form.elements[k].value = v ?? '';
    }
  } else {
    form.elements.id.value = '';
    // Pré-preencher com os filtros ativos, para adicionar mais depressa
    form.elements.category.value = $('#filterCategory').value;
    form.elements.location.value = $('#filterLocation').value;
  }
  $('#itemDialog').returnValue = ''; // evita que Esc reaproveite um 'save' anterior
  $('#itemDialog').showModal();
  form.elements.name.focus();
}

$('#itemDialog').addEventListener('close', () => {
  if ($('#itemDialog').returnValue !== 'save') return;
  const f = $('#itemForm').elements;
  const data = {
    id: f.id.value || newId(),
    name: f.name.value.trim(),
    qty: Math.max(0, parseFloat(f.qty.value) || 0),
    unit: f.unit.value.trim(),
    category: f.category.value.trim(),
    location: f.location.value.trim(),
    expiry: f.expiry.value,
    min: Math.max(0, parseFloat(f.min.value) || 0),
    notes: f.notes.value.trim(),
    updated: Date.now(),
  };
  if (!data.name) return;
  const idx = state.items.findIndex((i) => i.id === data.id);
  if (idx >= 0) state.items[idx] = data;
  else state.items.push(data);
  save();
});

$('#deleteBtn').addEventListener('click', () => {
  const id = $('#itemForm').elements.id.value;
  const it = state.items.find((i) => i.id === id);
  if (!it || !confirm(`Apagar "${it.name}"?`)) return;
  state.items = state.items.filter((i) => i.id !== id);
  $('#itemDialog').close('deleted');
  save();
});

// Ao escrever um nome que já existe, preenche o resto dos campos
$('#itemForm').elements.name.addEventListener('change', (e) => {
  const f = $('#itemForm').elements;
  if (f.id.value) return;
  const match = state.items.find((i) => i.name.toLowerCase() === e.target.value.trim().toLowerCase());
  if (match && confirm(`"${match.name}" já existe. Editar o existente?`)) {
    $('#itemDialog').close('cancel');
    openDialog(match);
  }
});

// ---------- Backup ----------
$('#exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state.items, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `despensa-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$('#importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data)) throw new Error('formato inválido');
    const valid = data.filter((i) => i && typeof i.name === 'string').map((i) => ({
      ...i, id: i.id || newId(), qty: Number(i.qty) || 0, min: Number(i.min) || 0,
    }));
    if (!confirm(`Importar ${valid.length} produtos? Isto substitui os dados atuais.`)) return;
    state.items = valid;
    save();
  } catch (err) {
    alert('Não foi possível importar: ' + err.message);
  }
});

// ---------- UI ----------
document.querySelectorAll('.tabs button').forEach((b) =>
  b.addEventListener('click', () => {
    state.view = b.dataset.view;
    document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
    render();
  })
);
['#search', '#filterCategory', '#filterLocation', '#sort'].forEach((s) =>
  $(s).addEventListener('input', render)
);
$('#addBtn').addEventListener('click', () => openDialog());

// Sincroniza se a app estiver aberta noutro separador
window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY) { state.items = load(); render(); }
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js');
}

render();
