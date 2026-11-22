// Arranque: escolher modo (Supabase ou demonstração), iniciar sessão e escolher/criar a casa.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { h, icon, toast, prefs, field } from './ui.js';
import { supabaseAdapter, localAdapter } from './store.js';

const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm';

/** Devolve { ctx, adapter } quando a pessoa está pronta para usar a app. */
export async function boot(root) {
  const cfg = SUPABASE_URL ? { url: SUPABASE_URL, key: SUPABASE_ANON_KEY } : prefs.get('supabase', null);
  if (!cfg) {
    const choice = await welcome(root);
    if (choice === 'demo') return demo();
    return boot(root);
  }
  if (cfg === 'demo') return demo();

  const { createClient } = await import(SUPABASE_JS);
  const sb = createClient(cfg.url, cfg.key, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'implicit' } });
  let { data: { session } } = await sb.auth.getSession();
  if (!session) session = await login(root, sb);

  const user = session.user;
  const { data: memberships, error } = await sb.from('members').select('household_id, display_name, households(id, name, invite_code)').eq('user_id', user.id);
  if (error) throw error;
  let m = memberships.find((x) => x.household_id === prefs.get('household')) || memberships[0];
  if (!m) m = await chooseHousehold(root, sb, user);
  prefs.set('household', m.household_id);

  return {
    adapter: supabaseAdapter(sb, m.household_id),
    ctx: {
      mode: 'supabase', client: sb, householdId: m.household_id, household: m.households,
      households: memberships, userId: user.id, userEmail: user.email,
      userName: m.display_name || user.email.split('@')[0],
    },
  };
}

function demo() {
  return {
    adapter: localAdapter(),
    ctx: { mode: 'demo', householdId: 'demo', household: { id: 'demo', name: 'Casa de demonstração', invite_code: 'DEMO1234' }, userId: 'demo-user', userName: 'Eu' },
  };
}

function screen(root, ...content) {
  root.replaceChildren(h('div', { class: 'auth' },
    h('div', { class: 'auth-card' },
      h('div', { class: 'auth-logo' }, h('img', { src: 'icon.svg', alt: '' })),
      ...content)));
}

function welcome(root) {
  return new Promise((resolve) => {
    const url = h('input', { placeholder: 'https://xxxx.supabase.co', type: 'url', required: true });
    const key = h('input', { placeholder: 'eyJhbGciOi…', required: true });
    screen(root,
      h('h1', {}, 'Despensa'),
      h('p', { class: 'muted' }, 'A despensa da família, sempre em dia: stock, validades, lista de compras, receitas e preços.'),
      h('button', { class: 'btn primary block', onclick: () => { prefs.set('supabase', 'demo'); resolve('demo'); } }, icon('sparkles'), 'Experimentar com dados de exemplo'),
      h('div', { class: 'divider' }, 'ou ligar à base de dados da família'),
      h('form', {
        class: 'stack', onsubmit: (e) => {
          e.preventDefault();
          prefs.set('supabase', { url: url.value.trim().replace(/\/$/, ''), key: key.value.trim() });
          resolve('supabase');
        },
      },
      field('URL do projeto Supabase', url),
      field('Chave pública (anon key)', key, 'Supabase → Project Settings → API. Para não pedir isto a cada pessoa, coloca os valores em js/config.js.'),
      h('button', { class: 'btn block' }, 'Ligar')));
  });
}

function login(root, sb) {
  return new Promise((resolve) => {
    const { data: sub } = sb.auth.onAuthStateChange((_ev, session) => { if (session) { sub.subscription.unsubscribe(); resolve(session); } });
    const email = h('input', { type: 'email', placeholder: 'o.teu@email.pt', required: true, autocomplete: 'email', value: prefs.get('email', '') });
    const sent = h('div', { class: 'stack', hidden: true },
      h('div', { class: 'tip' }, icon('check', 18), h('div', {}, h('strong', {}, 'Enviámos-te um email.'), ' Abre-o neste mesmo telemóvel/computador e carrega no link para entrar.')),
      h('p', { class: 'muted small' }, 'Não chegou? Vê a pasta de spam. No iPhone: entra primeiro pelo Safari e só depois usa “Adicionar ao ecrã principal”.'),
      h('button', { class: 'btn ghost block', onclick: () => { sent.hidden = true; form.hidden = false; } }, 'Usar outro email'));
    const form = h('form', {
      class: 'stack', onsubmit: async (e) => {
        e.preventDefault();
        prefs.set('email', email.value.trim());
        const btn = e.target.querySelector('button');
        btn.disabled = true;
        const { error } = await sb.auth.signInWithOtp({ email: email.value.trim(), options: { emailRedirectTo: location.origin + location.pathname } });
        btn.disabled = false;
        if (error) {
          const msg = /rate limit/i.test(error.message) ? 'Foram pedidos demasiados emails na última hora. Tenta daqui a pouco.' : error.message;
          return toast(msg, { type: 'error', ms: 6000 });
        }
        form.hidden = true;
        sent.hidden = false;
      },
    }, field('Email', email), h('button', { class: 'btn primary block' }, 'Enviar link de acesso'));
    screen(root, h('h1', {}, 'Entrar'), h('p', { class: 'muted' }, 'Sem palavras-passe: enviamos-te um link por email. Só é preciso fazer isto uma vez em cada dispositivo.'), form, sent);
  });
}

function chooseHousehold(root, sb, user) {
  return new Promise((resolve) => {
    const name = h('input', { required: true, placeholder: 'Ex.: Nuno', value: user.email.split('@')[0] });
    const house = h('input', { placeholder: 'Ex.: Casa Costa' });
    const code = h('input', { placeholder: 'Ex.: 4F9A12BC', style: { textTransform: 'uppercase' } });
    const finish = async (rpc, args) => {
      if (!name.value.trim()) return toast('Indica o teu nome', { type: 'error' });
      const { data: id, error } = await sb.rpc(rpc, { ...args, p_display_name: name.value.trim() });
      if (error) return toast(error.message, { type: 'error' });
      const { data: hh } = await sb.from('households').select('id, name, invite_code').eq('id', id).single();
      resolve({ household_id: id, display_name: name.value.trim(), households: hh });
    };
    screen(root,
      h('h1', {}, 'Bem-vindo(a)!'),
      field('Como te chamas?', name, 'Aparece no histórico ("Rita gastou 1 leite").'),
      h('div', { class: 'auth-choice' },
        h('div', { class: 'stack' }, h('h3', {}, icon('home'), ' Criar casa nova'), field('Nome da casa', house),
          h('button', { class: 'btn primary block', onclick: () => finish('create_household', { p_name: house.value }) }, 'Criar')),
        h('div', { class: 'stack' }, h('h3', {}, icon('users'), ' Juntar-me à família'), field('Código de convite', code, 'Quem criou a casa encontra-o em Mais → Família.'),
          h('button', { class: 'btn block', onclick: () => finish('join_household', { p_code: code.value }) }, 'Entrar na casa'))));
  });
}
