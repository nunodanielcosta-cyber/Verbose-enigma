// Arranque e navegação da aplicação.
import { h, icon, toast } from './ui.js';
import { store } from './store.js';
import { boot } from './auth.js';
import { startNotifications } from './notify.js';
import { openScanner } from './scanner.js';
import { listen, voiceSupported } from './voice.js';
import { currentList } from './views/shopping.js';
import home from './views/home.js';
import stock from './views/stock.js';
import shopping from './views/shopping.js';
import recipes from './views/recipes.js';
import more from './views/more.js';

const VIEWS = { home, stock, shopping, recipes, more };
const NAV = [['home', 'Início', 'home'], ['stock', 'Stock', 'box'], ['scan'], ['shopping', 'Lista', 'cart'], ['recipes', 'Receitas', 'chef']];

const root = document.getElementById('app');
let current = null; // { id, ctrl }

async function start() {
  try {
    const { ctx, adapter } = await boot(root);
    root.replaceChildren(h('div', { class: 'loading' }, h('div', { class: 'spinner' }), 'A abrir a despensa…'));
    await store.start(ctx, adapter);
  } catch (e) {
    console.error(e);
    root.replaceChildren(h('div', { class: 'auth' }, h('div', { class: 'auth-card stack' },
      h('h1', {}, 'Ups…'), h('p', {}, 'Não foi possível abrir a despensa: ' + (e.message || e)),
      h('button', { class: 'btn primary', onclick: () => location.reload() }, 'Tentar de novo'),
      h('button', { class: 'link small', onclick: () => { localStorage.removeItem('despensa.pref.supabase'); location.reload(); } }, 'Mudar de base de dados'))));
    return;
  }
  shell();
  route();
  window.addEventListener('hashchange', route);
  store.on(({ tables, remote }) => {
    if (remote?.row && remote.table === 'events') {
      const e = remote.row;
      if (['consume', 'buy', 'add', 'cook'].includes(e.type)) toast(`${e.user_name || 'Alguém'}: ${e.type === 'consume' ? 'gastou' : e.type === 'cook' ? 'cozinhou com' : 'adicionou'} ${e.product_name || ''}`, { ms: 2500 });
    }
    if (tables) { current?.ctrl.update?.(); updateBadge(); }
  });
  startNotifications();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

let els = {};
function shell() {
  els.title = h('h1', {});
  els.sub = h('div', { class: 'sub' });
  els.view = h('main', { id: 'view' });
  els.fab = h('button', { class: 'fab', 'aria-label': 'Adicionar', hidden: true }, icon('plus', 26));
  els.nav = h('nav', { class: 'tabbar' }, NAV.map(([id, label, ic]) => id === 'scan'
    ? h('button', { class: 'tab-scan', 'aria-label': 'Ler código de barras', onclick: () => openScanner() }, icon('scan', 26))
    : h('a', { href: '#/' + id, class: 'tab', 'data-id': id }, icon(ic, 22), h('span', {}, label), id === 'shopping' && h('b', { class: 'badge', hidden: true }))));
  root.replaceChildren(
    h('header', { class: 'topbar' },
      h('div', { class: 'grow' }, els.title, els.sub),
      voiceSupported() && h('button', { class: 'icon-btn', 'aria-label': 'Comando de voz', onclick: listen }, icon('mic')),
      h('a', { class: 'avatar', href: '#/more', 'aria-label': 'Mais' }, (store.ctx.userName || '?')[0].toUpperCase())),
    store.ctx.mode === 'demo' && h('div', { class: 'demo-banner' }, icon('sparkles', 16), 'Modo demonstração — dados de exemplo só neste browser'),
    els.view, els.fab, els.nav);
  updateBadge();
}

function route() {
  const id = (location.hash.replace(/^#\/?/, '').split('?')[0]) || 'home';
  const view = VIEWS[id] || home;
  els.view.replaceChildren();
  els.view.className = 'view-' + view.id;
  const ctrl = view.mount(els.view) || {};
  current = { id: view.id, ctrl };
  els.title.textContent = view.title;
  els.sub.textContent = view.id === 'home' ? '' : store.ctx.household?.name || '';
  els.fab.hidden = !ctrl.fab;
  els.fab.onclick = () => ctrl.fab?.();
  els.nav.querySelectorAll('.tab').forEach((a) => a.classList.toggle('on', a.dataset.id === view.id));
  window.scrollTo(0, 0);
}

function updateBadge() {
  const b = els.nav?.querySelector('.badge');
  if (!b) return;
  const n = currentList().length;
  b.hidden = !n;
  b.textContent = n > 99 ? '99+' : n;
}

start();
