// Mais: estatísticas, família, definições e dados.
import { h, icon, field, toast, fmtMoney, fmtQty, prefs, confirmSheet, sheet } from '../ui.js';
import { store } from '../store.js';
import { groupOf, STORES } from '../domain.js';
import { receiptFlow } from './shopping.js';
import { enableNotifications } from '../notify.js';

export default {
  id: 'more',
  title: 'Mais',
  mount(root) {
    const box = h('div', { class: 'stack lg' });
    root.append(box);
    const draw = () => box.replaceChildren(statsSection(), familySection(), settingsSection(), dataSection());
    draw();
    return { update: draw };
  },
};

// ---------- Estatísticas ----------
function statsSection() {
  const events = store.all('events');
  const now = new Date();
  const months = [...Array(6)].map((_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('pt-PT', { month: 'short' }).replace('.', '') };
  });
  for (const m of months) m.value = events.filter((e) => e.type === 'buy' && e.at.slice(0, 7) === m.key).reduce((s, e) => s + (Number(e.price) || 0), 0);

  const thisMonth = months[5].key;
  const byGroup = new Map();
  for (const e of events) if (e.type === 'buy' && e.at.slice(0, 7) === thisMonth && e.price) byGroup.set(e.grp || 'outros', (byGroup.get(e.grp || 'outros') || 0) + Number(e.price));

  const since30 = new Date(Date.now() - 30 * 86400e3).toISOString();
  const used = new Map();
  let wasted = 0;
  for (const e of events) {
    if (e.at < since30) continue;
    if (e.type === 'waste') wasted++;
    if (['consume', 'cook'].includes(e.type) && e.product_name) used.set(e.product_name, (used.get(e.product_name) || 0) + Math.abs(Number(e.delta) || 0));
  }
  const top = [...used].sort((a, b) => b[1] - a[1]).slice(0, 5);

  return h('section', { class: 'stack' },
    h('div', { class: 'section-title' }, icon('chart', 18), ' Gastos'),
    h('div', { class: 'card pad' },
      h('div', { class: 'muted small' }, 'Gasto por mês (compras registadas)'),
      monthChart(months)),
    byGroup.size > 0 && h('div', { class: 'card pad' },
      h('div', { class: 'muted small' }, 'Este mês por tipo'),
      hbars([...byGroup].sort((a, b) => b[1] - a[1]).map(([g, v]) => ({ label: `${groupOf(g).emoji} ${groupOf(g).label}`, value: v, text: fmtMoney(v) })))),
    h('div', { class: 'grid2' },
      h('div', { class: 'card pad' }, h('div', { class: 'muted small' }, 'Mais gastos (30 dias)'),
        top.length ? h('ol', { class: 'toplist' }, top.map(([n, q]) => h('li', {}, h('span', {}, n), h('span', { class: 'muted' }, fmtQty(+q.toFixed(1)))))) : h('p', { class: 'muted small' }, 'Sem dados ainda')),
      h('div', { class: 'card pad center' }, h('div', { class: 'muted small' }, 'Desperdício (30 dias)'),
        h('div', { class: 'big' }, wasted), h('div', { class: 'small ' + (wasted ? 'warn-text' : 'ok-text') }, wasted ? 'produtos deitados fora' : 'Nada deitado fora 👏'))));
}

/** Barras verticais de uma só série, com valor por cima da barra mais recente e detalhe ao passar o rato. */
function monthChart(months) {
  const W = 320; const H = 150; const pad = 22; const gap = 10;
  const max = Math.max(...months.map((m) => m.value), 1);
  const bw = (W - gap * (months.length - 1)) / months.length;
  const bars = months.map((m, i) => {
    const bh = Math.max(m.value ? 3 : 0, (m.value / max) * (H - pad * 2));
    const x = i * (bw + gap);
    const y = H - pad - bh;
    const last = i === months.length - 1;
    return `<g class="bar-g"><title>${m.label}: ${fmtMoney(m.value)}</title>
      <rect x="${x}" y="0" width="${bw}" height="${H - pad}" fill="transparent"/>
      <path d="${roundTop(x + bw * 0.2, y, bw * 0.6, bh)}" class="${last ? 'mark now' : 'mark'}"/>
      ${last || m.value === max ? `<text x="${x + bw / 2}" y="${y - 6}" text-anchor="middle" class="val">${Math.round(m.value)} €</text>` : ''}
      <text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle" class="axis">${m.label}</text></g>`;
  }).join('');
  return h('div', { class: 'chart', html: `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gasto mensal: ${months.map((m) => `${m.label} ${Math.round(m.value)} euros`).join(', ')}"><line x1="0" x2="${W}" y1="${H - pad}" y2="${H - pad}" class="base"/>${bars}</svg>` });
}

// Barra com os cantos de cima arredondados (4px) e base reta no eixo.
function roundTop(x, y, w, hgt) {
  if (hgt <= 0) return '';
  const r = Math.min(4, w / 2, hgt);
  return `M${x},${y + hgt}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + hgt}Z`;
}

function hbars(rows) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return h('div', { class: 'hbars' }, rows.map((r) => h('div', { class: 'hbar', title: `${r.label}: ${r.text}` },
    h('span', { class: 'hbar-label' }, r.label),
    h('span', { class: 'hbar-track' }, h('i', { style: { width: Math.max(2, (r.value / max) * 100) + '%' } })),
    h('span', { class: 'hbar-val' }, r.text))));
}

// ---------- Família ----------
function familySection() {
  const hh = store.ctx.household || {};
  const members = store.all('members');
  const code = hh.invite_code || '';
  const shareText = `Junta-te à nossa despensa na app Despensa: ${location.origin + location.pathname} — código de convite: ${code}`;
  return h('section', { class: 'stack' },
    h('div', { class: 'section-title' }, icon('users', 18), ' Família'),
    h('div', { class: 'card pad stack' },
      h('div', { class: 'row between' }, h('div', {}, h('div', { class: 'strong' }, hh.name || 'A nossa casa'), h('div', { class: 'muted small' }, `${members.length} membro(s)`)),
        store.ctx.mode === 'supabase' && h('button', { class: 'btn small soft', onclick: renameHousehold }, icon('edit', 16), 'Nome')),
      h('div', { class: 'members' }, members.map((m) => h('div', { class: 'member' }, h('span', { class: 'avatar' }, (m.display_name || '?')[0].toUpperCase()),
        h('span', {}, m.display_name || 'Sem nome', m.user_id === store.ctx.userId ? h('span', { class: 'muted' }, ' (eu)') : null)))),
      h('div', { class: 'invite' },
        h('div', {}, h('div', { class: 'muted small' }, 'Código de convite'), h('div', { class: 'code' }, code)),
        h('button', {
          class: 'btn primary', onclick: async () => {
            if (navigator.share) { try { await navigator.share({ title: 'Despensa', text: shareText }); return; } catch { /* cancelado */ } }
            await navigator.clipboard?.writeText(shareText);
            toast('Convite copiado — envia por WhatsApp ou email');
          },
        }, icon('link', 18), 'Convidar')),
      h('p', { class: 'muted small' }, 'Cada pessoa instala a app, entra com o seu email e escolhe “Juntar-me à família” com este código.')));
}

async function renameHousehold() {
  const name = prompt('Nome da casa', store.ctx.household?.name || '');
  if (!name) return;
  const { error } = await store.ctx.client.from('households').update({ name }).eq('id', store.ctx.householdId);
  if (error) return toast(error.message, { type: 'error' });
  store.ctx.household = { ...store.ctx.household, name };
  toast('Nome atualizado');
}

// ---------- Definições ----------
function settingsSection() {
  const me = store.all('members').find((m) => m.user_id === store.ctx.userId);
  const name = h('input', {
    value: store.ctx.userName, onchange: (e) => {
      const v = e.target.value.trim();
      if (!v) return;
      store.ctx.userName = v;
      if (me) store.update('members', me.id, { display_name: v });
      toast('Nome atualizado');
    },
  });
  const warn = h('input', { type: 'number', min: 1, max: 60, value: prefs.get('warnDays', 5), onchange: (e) => { prefs.set('warnDays', Math.max(1, parseInt(e.target.value, 10) || 5)); toast('Guardado'); } });
  const notifOn = prefs.get('notify', false) && 'Notification' in window && Notification.permission === 'granted';
  return h('section', { class: 'stack' },
    h('div', { class: 'section-title' }, icon('settings', 18), ' Definições'),
    h('div', { class: 'card pad stack' },
      h('div', { class: 'grid2' }, field('O meu nome', name), field('Avisar validade (dias antes)', warn)),
      h('label', { class: 'switch' },
        h('input', {
          type: 'checkbox', checked: notifOn, onchange: async (e) => {
            if (e.target.checked) e.target.checked = await enableNotifications();
            else prefs.set('notify', false);
          },
        }),
        h('span', {}, 'Notificações neste dispositivo', h('small', { class: 'muted block' }, 'Validades a terminar e produtos que chegam ao mínimo.'))),
      h('div', { class: 'field' }, h('span', {}, 'Lojas para comparar'),
        h('div', { class: 'chip-scroll wrap' }, STORES.map((s) => {
          const cur = prefs.get('compare.stores', STORES.filter((x) => x.online).map((x) => x.id));
          return h('button', {
            class: 'fchip' + (cur.includes(s.id) ? ' on' : ''), onclick: (e) => {
              const next = cur.includes(s.id) ? cur.filter((x) => x !== s.id) : [...cur, s.id];
              prefs.set('compare.stores', next);
              e.currentTarget.classList.toggle('on');
            },
          }, h('span', { class: 'store-dot', style: { background: s.color } }), s.label);
        })))));
}

// ---------- Dados ----------
function dataSection() {
  const demo = store.ctx.mode === 'demo';
  return h('section', { class: 'stack' },
    h('div', { class: 'section-title' }, icon('box', 18), ' Dados'),
    h('div', { class: 'card list' },
      menuItem('receipt', 'Ler talão de compras', 'Atualiza o stock e regista os preços', () => receiptFlow()),
      menuItem('download', 'Exportar cópia de segurança', 'Ficheiro JSON com tudo', exportData),
      demo && menuItem('upload', 'Importar cópia de segurança', 'Substitui os dados de demonstração', importData),
      demo && menuItem('sparkles', 'Repor dados de exemplo', '', async () => {
        if (await confirmSheet('Apagar as alterações e repor os dados de exemplo?')) { localStorage.removeItem('despensa.demo.v2'); location.reload(); }
      }),
      demo && menuItem('link', 'Ligar ao Supabase', 'Para partilhar com a família', () => { prefs.set('supabase', null); location.reload(); }),
      !demo && menuItem('logout', 'Terminar sessão', store.ctx.userEmail || '', async () => { await store.ctx.client.auth.signOut(); location.reload(); })),
    h('p', { class: 'muted small center' }, demo ? 'Modo demonstração: os dados ficam só neste browser.' : 'Dados sincronizados em tempo real com a família.'));
}

const menuItem = (ic, title, sub, onclick) => h('button', { class: 'menu-item', onclick }, h('span', { class: 'menu-icon' }, icon(ic, 18)),
  h('span', { class: 'grow' }, h('span', { class: 'block strong' }, title), sub && h('span', { class: 'block muted small' }, sub)), icon('chevronR', 18));

function exportData() {
  const dump = Object.fromEntries(['products', 'recipes', 'meal_plan', 'shopping_items', 'prices', 'events'].map((t) => [t, store.all(t)]));
  const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' })), download: `despensa-${new Date().toISOString().slice(0, 10)}.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importData() {
  const input = h('input', { type: 'file', accept: 'application/json' });
  input.onchange = async () => {
    try {
      const dump = JSON.parse(await input.files[0].text());
      const db = {};
      for (const [t, rows] of Object.entries(dump)) if (Array.isArray(rows)) db[t] = Object.fromEntries(rows.map((r) => [r.id, r]));
      localStorage.setItem('despensa.demo.v2', JSON.stringify(db));
      location.reload();
    } catch (e) {
      sheet('Erro', h('p', {}, 'Ficheiro inválido: ' + e.message));
    }
  };
  input.click();
}
