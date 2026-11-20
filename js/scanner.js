// Leitor de códigos de barras com a câmara.
// Usa o BarcodeDetector do browser quando existe (Android/Chrome); senão carrega um equivalente (zxing, WebAssembly).
import { h, icon, sheet, toast, prefs } from './ui.js';
import { store } from './store.js';
import { parseGS1, groupOf } from './domain.js';
import { openProductForm, askQtyExpiry, restock, thumb } from './views/product.js';

const PONYFILL = 'https://cdn.jsdelivr.net/npm/barcode-detector@3.2.3/dist/es/ponyfill.js/+esm';
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'data_matrix', 'qr_code'];

async function getDetector() {
  if ('BarcodeDetector' in window) {
    try {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      if (supported.includes('ean_13')) return new window.BarcodeDetector({ formats: FORMATS.filter((f) => supported.includes(f)) });
    } catch { /* usa o equivalente */ }
  }
  const { BarcodeDetector } = await import(PONYFILL);
  return new BarcodeDetector({ formats: FORMATS });
}

/** Liga a câmara traseira num <video>. Devolve uma função para desligar. */
export async function startCamera(video) {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  video.muted = true;
  await video.play();
  return () => stream.getTracks().forEach((t) => t.stop());
}

// ---------- Open Food Facts (e bases irmãs para limpeza/higiene) ----------
const SOURCES = [
  ['https://world.openfoodfacts.org', 'alimentar'],
  ['https://world.openbeautyfacts.org', 'higiene'],
  ['https://world.openproductsfacts.org', 'limpeza'],
];
const FIELDS = 'product_name,product_name_pt,generic_name_pt,brands,quantity,product_quantity,product_quantity_unit,image_front_small_url,image_small_url,categories_tags';

export async function lookupBarcode(code) {
  for (const [baseUrl, grp] of SOURCES) {
    try {
      const r = await fetch(`${baseUrl}/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`);
      if (!r.ok) continue;
      const j = await r.json();
      if (j.status !== 1 || !j.product) continue;
      const p = j.product;
      const name = p.product_name_pt || p.product_name || p.generic_name_pt;
      if (!name) continue;
      const size = parseFloat(p.product_quantity);
      const unit = (p.product_quantity_unit || '').toLowerCase();
      return {
        name: name.trim(),
        brand: (p.brands || '').split(',')[0].trim() || null,
        image_url: p.image_front_small_url || p.image_small_url || null,
        package_size: size > 0 ? size : null,
        package_unit: size > 0 ? ({ l: 'L' }[unit] || unit || null) : null,
        grp: guessGroup(p.categories_tags || [], grp),
        category: prettyCategory(p.categories_tags || []),
      };
    } catch { /* sem rede: tenta a seguinte */ }
  }
  return null;
}

function guessGroup(tags, fallback) {
  const t = tags.join(' ');
  if (/beverages|waters|drinks|sodas|juices|coffees|teas/.test(t) && fallback === 'alimentar') return 'bebidas';
  if (/pet-food|cat-food|dog-food/.test(t)) return 'animais';
  if (/baby/.test(t)) return 'bebe';
  return fallback;
}
const CAT_PT = {
  'en:dairies': 'Laticínios', 'en:milks': 'Laticínios', 'en:yogurts': 'Laticínios', 'en:cheeses': 'Laticínios',
  'en:pastas': 'Mercearia', 'en:rices': 'Mercearia', 'en:cereals-and-potatoes': 'Mercearia', 'en:breakfast-cereals': 'Pequeno-almoço',
  'en:canned-foods': 'Conservas', 'en:fishes': 'Peixe', 'en:meats': 'Talho', 'en:frozen-foods': 'Congelados',
  'en:beverages': 'Bebidas', 'en:waters': 'Águas', 'en:coffees': 'Café e chá', 'en:biscuits-and-cakes': 'Bolachas',
  'en:snacks': 'Snacks', 'en:sauces': 'Molhos', 'en:fruits': 'Frutas e legumes', 'en:vegetables': 'Frutas e legumes',
  'en:breads': 'Padaria', 'en:fats': 'Mercearia', 'en:olive-oils': 'Mercearia', 'en:chocolates': 'Doces',
};
function prettyCategory(tags) {
  for (let i = tags.length - 1; i >= 0; i--) if (CAT_PT[tags[i]]) return CAT_PT[tags[i]];
  return null;
}

// ---------- Ecrã do leitor ----------
export function openScanner({ mode: initialMode } = {}) {
  let mode = initialMode || prefs.get('scanMode', 'add');
  let continuous = prefs.get('scanContinuous', false);
  let stop = null;
  let busy = false;
  let lastCode = '';
  let lastAt = 0;
  let raf = 0;
  let closed = false;
  const video = h('video', { class: 'scan-video', muted: true, playsinline: true });
  const status = h('div', { class: 'scan-status' }, 'A ligar a câmara…');
  const recent = h('div', { class: 'scan-recent' });
  const manual = h('input', { inputmode: 'numeric', placeholder: 'Ou escreve o código', 'aria-label': 'Código de barras' });

  const s = sheet('Ler código', (close) => {
    const seg = h('div', { class: 'seg' },
      [['add', 'Arrumar compras', 'plus'], ['consume', 'Gastar', 'minus']].map(([id, label, ic]) => h('button', {
        type: 'button', class: mode === id ? 'on' : '', onclick: (e) => {
          mode = id;
          prefs.set('scanMode', id);
          seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget));
        },
      }, icon(ic, 16), label)));
    return h('div', { class: 'stack' },
      seg,
      h('div', { class: 'scan-box' }, video, h('div', { class: 'scan-frame' }), status),
      h('label', { class: 'switch' },
        h('input', { type: 'checkbox', checked: continuous, onchange: (e) => { continuous = e.target.checked; prefs.set('scanContinuous', continuous); } }),
        h('span', {}, 'Modo contínuo (ler vários seguidos)')),
      h('form', { class: 'row', onsubmit: (e) => { e.preventDefault(); if (manual.value.trim()) handle(manual.value.trim()); manual.value = ''; } },
        manual, h('button', { class: 'btn' }, 'OK')),
      recent);
  }, { full: true, onClose: () => { closed = true; cancelAnimationFrame(raf); stop?.(); } });

  (async () => {
    try {
      stop = await startCamera(video);
      if (closed) return stop();
      status.textContent = 'A carregar leitor…';
      const detector = await getDetector();
      status.textContent = 'Aponta para o código de barras';
      let lastScan = 0;
      const loop = async (t) => {
        if (closed) return;
        // não ler enquanto outro painel (ex.: formulário de produto) está aberto por cima
        const covered = document.querySelectorAll('dialog[open]').length > 1;
        if (!busy && !covered && t - lastScan > 200 && video.readyState >= 2) {
          lastScan = t;
          try {
            const codes = await detector.detect(video);
            if (codes.length) await handle(codes[0].rawValue);
          } catch { /* frame inválido */ }
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    } catch (e) {
      status.textContent = 'Câmara indisponível — escreve o código abaixo.';
      console.warn(e);
    }
  })();

  async function handle(raw) {
    const now = Date.now();
    if (raw === lastCode && now - lastAt < 3000) return;
    lastCode = raw;
    lastAt = now;
    busy = true;
    navigator.vibrate?.(60);
    try {
      const gs1 = parseGS1(raw);
      const code = gs1?.gtin || raw.trim();
      const p = store.all('products').find((x) => x.barcode === code);
      if (mode === 'consume') {
        if (!p) { toast('Produto não está no stock', { type: 'error' }); return; }
        store.changeQty(p, -1);
        note(p, `−1 · ficam ${store.get('products', p.id).qty} ${p.unit}`);
        toast(`−1 ${p.name}`, { action: 'Anular', onAction: () => store.changeQty(store.get('products', p.id), +1, 'adjust') });
      } else if (p) {
        let qty = 1;
        let expiry = gs1?.expiry || null;
        if (!continuous || !expiry) {
          const ans = await askQtyExpiry(p, { qty, expiry });
          if (!ans) return;
          ({ qty, expiry } = ans);
        }
        restock(p, qty, expiry);
        note(p, `+${qty} ${p.unit}`);
      } else {
        status.textContent = 'Produto novo — a procurar informação…';
        const info = await lookupBarcode(code);
        status.textContent = 'Aponta para o código de barras';
        if (!continuous) s.close();
        openProductForm(null, { barcode: code, expiry: gs1?.expiry || null, qty: 1, ...(info || {}) });
        if (!info) toast('Não encontrado nas bases públicas — preenche uma vez e fica guardado.');
      }
    } finally {
      busy = false;
    }
    if (!continuous && mode === 'add') s.close();
  }

  function note(p, text) {
    recent.prepend(h('div', { class: 'scan-item' }, thumb(p, 36), h('div', { class: 'grow' }, h('div', { class: 'strong' }, p.name), h('div', { class: 'muted small' }, text)), groupOf(p.grp).emoji));
  }
}
