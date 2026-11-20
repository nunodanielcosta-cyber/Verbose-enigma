// Leitura de texto com a câmara (OCR) para datas de validade e talões. Usa Tesseract.js, carregado só quando é preciso.
// É uma ajuda: confirma sempre o resultado.
import { h, icon, sheet, toast, fmtDate } from './ui.js';
import { findDate } from './domain.js';
import { startCamera } from './scanner.js';

const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.esm.min.js';
let workerPromise = null;

function getWorker() {
  workerPromise ||= import(TESSERACT).then((m) => (m.default || m).createWorker('por'));
  return workerPromise;
}

export async function recognize(image) {
  const worker = await getWorker();
  const { data } = await worker.recognize(image);
  return data.text || '';
}

/** Abre a câmara, a pessoa aponta para a data e carrega em "Ler". Devolve 'AAAA-MM-DD' ou null. */
export function readDateWithCamera() {
  return new Promise((resolve) => {
    let result = null;
    let stop = null;
    const video = h('video', { class: 'scan-video', muted: true, playsinline: true });
    const out = h('div', { class: 'muted small center' }, 'Aproxima a data de validade e carrega em Ler.');
    const s = sheet('Ler validade', (close) => h('div', { class: 'stack' },
      h('div', { class: 'scan-box short' }, video, h('div', { class: 'scan-frame wide' })),
      out,
      h('button', {
        class: 'btn primary block', onclick: async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          out.textContent = 'A ler…';
          try {
            const text = await recognize(crop(video));
            const d = findDate(text);
            if (d) {
              out.replaceChildren(h('strong', {}, fmtDate(d)), ' — ', h('button', { class: 'link', onclick: () => { result = d; close(); } }, 'Usar esta data'));
            } else {
              out.textContent = 'Não encontrei uma data. Tenta mais perto, com boa luz.';
            }
          } catch (err) {
            out.textContent = 'Não foi possível ler (' + err.message + ').';
          }
          btn.disabled = false;
        },
      }, icon('camera', 18), 'Ler')),
    { onClose: () => { stop?.(); resolve(result); } });
    startCamera(video).then((fn) => { stop = fn; if (!s.dialog.open) fn(); }).catch(() => { out.textContent = 'Câmara indisponível.'; });
  });
}

// Recorta a faixa central da imagem (onde está a moldura), em tons de cinzento e ampliada: melhora muito o OCR.
function crop(video) {
  const w = video.videoWidth;
  const hgt = video.videoHeight;
  const cw = w * 0.8;
  const ch = hgt * 0.3;
  const c = document.createElement('canvas');
  c.width = cw * 2;
  c.height = ch * 2;
  const ctx = c.getContext('2d');
  ctx.filter = 'grayscale(1) contrast(1.6)';
  ctx.drawImage(video, (w - cw) / 2, (hgt - ch) / 2, cw, ch, 0, 0, c.width, c.height);
  return c;
}

/** Pede uma fotografia (câmara ou galeria). */
export function pickImage() {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept: 'image/*', capture: 'environment', style: { display: 'none' } });
    input.addEventListener('change', () => { resolve(input.files[0] || null); input.remove(); });
    document.body.append(input);
    input.click();
  });
}

export async function recognizeReceipt(file, onProgress) {
  onProgress?.('A preparar leitor de texto (a primeira vez demora um pouco)…');
  const worker = await getWorker();
  onProgress?.('A ler o talão…');
  const bitmap = await createImageBitmap(file);
  const c = document.createElement('canvas');
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  c.width = bitmap.width * scale;
  c.height = bitmap.height * scale;
  const ctx = c.getContext('2d');
  ctx.filter = 'grayscale(1) contrast(1.4)';
  ctx.drawImage(bitmap, 0, 0, c.width, c.height);
  const { data } = await worker.recognize(c);
  if (!data.text) toast('Não foi possível ler texto na imagem', { type: 'error' });
  return data.text || '';
}
