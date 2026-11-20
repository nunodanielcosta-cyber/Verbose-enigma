// Notificações locais: validades a terminar e produtos que chegam ao mínimo.
// Funcionam com a app aberta ou em segundo plano recente. (Notificações com a app totalmente fechada exigiriam
// um servidor de "push"; ficou de fora para manter a app simples.)
import { prefs, toast } from './ui.js';
import { store } from './store.js';
import { expiryStatus, isTracked, todayISO } from './domain.js';

export async function enableNotifications() {
  if (!('Notification' in window)) { toast('Este browser não suporta notificações', { type: 'error' }); return false; }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { toast('Notificações bloqueadas nas definições do browser', { type: 'error' }); return false; }
  prefs.set('notify', true);
  check(true);
  return true;
}

async function show(title, body, tag) {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, tag, icon: 'icon.svg', badge: 'icon.svg' });
    else new Notification(title, { body, tag, icon: 'icon.svg' });
  } catch { /* ignorar */ }
}

/** Verifica e notifica no máximo uma vez por dia por produto. */
export function check(force = false) {
  if (!prefs.get('notify', false) || !('Notification' in window) || Notification.permission !== 'granted') return;
  const today = todayISO();
  const sent = prefs.get('notified', {});
  for (const k of Object.keys(sent)) if (sent[k] !== today && !k.startsWith('min:')) delete sent[k];
  const products = store.all('products');
  const wd = prefs.get('warnDays', 5);

  const expiring = products.filter((p) => ['soon', 'past'].includes(expiryStatus(p, wd)?.level) && (force || !sent['exp:' + p.id]));
  if (expiring.length) {
    const names = expiring.slice(0, 4).map((p) => `${p.name} (${expiryStatus(p, wd).text.toLowerCase()})`).join(', ');
    show('Validades a terminar', names + (expiring.length > 4 ? ` e mais ${expiring.length - 4}` : ''), 'expiry');
    for (const p of expiring) sent['exp:' + p.id] = today;
  }

  // Mínimo: avisa quando passa a estar no mínimo; volta a poder avisar depois de reposto.
  const low = [];
  for (const p of products) {
    const isLow = isTracked(p) && p.qty <= p.min;
    if (isLow && !sent['min:' + p.id]) { low.push(p); sent['min:' + p.id] = today; }
    if (!isLow) delete sent['min:' + p.id];
  }
  if (low.length && !force) show('Adicionado à lista de compras', low.map((p) => p.name).join(', ') + ' chegou ao mínimo', 'min');
  prefs.set('notified', sent);
}

let timer = 0;
export function startNotifications() {
  store.on(() => { clearTimeout(timer); timer = setTimeout(() => check(), 1500); });
  check();
}
