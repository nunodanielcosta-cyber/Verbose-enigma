// Comandos de voz: "gastei dois leites", "comprei arroz", "falta detergente".
import { h, icon, sheet, toast, fmtQty } from './ui.js';
import { store } from './store.js';
import { parseVoice, bestMatch } from './domain.js';
import { addToList } from './views/product.js';

export const voiceSupported = () => !!(window.SpeechRecognition || window.webkitSpeechRecognition);

export function listen() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return toast('O reconhecimento de voz não está disponível neste browser (experimenta no Chrome).', { type: 'error' });
  const rec = new SR();
  rec.lang = 'pt-PT';
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  const heard = h('p', { class: 'voice-text' }, '…');
  const s = sheet('A ouvir', h('div', { class: 'stack center' },
    h('div', { class: 'voice-orb' }, icon('mic', 32)),
    heard,
    h('p', { class: 'muted small' }, 'Ex.: “gastei dois iogurtes”, “comprei 3 pacotes de arroz”, “falta lixívia”')),
  { onClose: () => { try { rec.abort(); } catch { /* já parado */ } } });
  let final = '';
  rec.onresult = (e) => {
    final = [...e.results].map((r) => r[0].transcript).join(' ');
    heard.textContent = final;
  };
  rec.onerror = (e) => { heard.textContent = e.error === 'not-allowed' ? 'Microfone bloqueado.' : 'Não percebi. Tenta outra vez.'; };
  rec.onend = () => { if (final) { s.close(); run(final); } };
  rec.start();
}

function run(text) {
  const actions = parseVoice(text);
  const products = store.all('products');
  const done = [];
  for (const a of actions) {
    const m = bestMatch(a.text, products, 0.5);
    if (a.type === 'shop') {
      if (m) addToList(m.product, a.qty);
      else store.insert('shopping_items', { name: a.text, qty: a.qty });
      done.push(`🛒 ${a.text}`);
    } else if (m) {
      store.changeQty(m.product, a.type === 'consume' ? -a.qty : a.qty);
      done.push(`${a.type === 'consume' ? '−' : '+'}${fmtQty(a.qty)} ${m.product.name}`);
    } else {
      done.push(`❓ “${a.text}” não encontrado`);
    }
  }
  toast(done.length ? done.join(' · ') : `Não percebi: “${text}”`, { ms: 5000 });
}
