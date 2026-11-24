// Arranque, bloqueio, navegação e gravação automática.

import { h, s, toast, debounce, confirmDialog } from './ui.js';
import { defaultState } from '../core/defaults.js';
import { todayISO } from '../core/dates.js';
import { careGaps, indicatorAnalysis } from './analysis.js';
import * as inicio from './views/inicio.js';
import * as indicadores from './views/indicadores.js';
import * as cuidados from './views/cuidados.js';
import * as preconsulta from './views/preconsulta.js';
import * as lista from './views/lista.js';
import * as tarefas from './views/tarefas.js';
import * as importar from './views/importar.js';
import * as config from './views/config.js';

const api = window.api;

const VIEWS = [
  { id: 'inicio', label: 'Início', mod: inicio, icon: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z' },
  { id: 'indicadores', label: 'Os meus indicadores', mod: indicadores, icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
  { id: 'cuidados', label: 'Cuidados em falta', mod: cuidados, icon: 'M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9' },
  { id: 'preconsulta', label: 'Pré-consulta', mod: preconsulta, icon: 'M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z' },
  { id: 'lista', label: 'Lista e UC ponderadas', mod: lista, icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8' },
  { id: 'tarefas', label: 'Tarefas não presenciais', mod: tarefas, icon: 'M22 12h-6l-2 3h-4l-2-3H2M5.5 5.1L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z' },
  { sep: true },
  { id: 'importar', label: 'Importar dados', mod: importar, icon: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3' },
  { id: 'config', label: 'Configuração', mod: config, icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z' },
];

export const app = {
  state: null,
  ui: { view: 'inicio' },
  ref: todayISO(),
  saveError: false,
  /** Marca alterações para gravar (gravação cifrada, com pequeno atraso). */
  save() {
    pendingSave();
  },
  async flush() {
    if (!this.state) return;
    try {
      await api.save(this.state);
      this.saveError = false;
    } catch (err) {
      this.saveError = true;
      toast('Erro ao gravar: ' + err.message, 'error');
    }
  },
  go(view, extra = {}) {
    Object.assign(this.ui, extra, { view });
    render();
    document.querySelector('.main')?.scrollTo(0, 0);
  },
  render() {
    render();
  },
  /** Cache simples de cálculos por render. */
  cache: {},
  analysis() {
    return (this.cache.analysis ??= indicatorAnalysis(this.state, this.ui.period));
  },
  gaps() {
    return (this.cache.gaps ??= careGaps(this.state, this.ref, this.analysis()));
  },
  async lock() {
    await this.flush();
    this.state = null;
    await api.lock();
  },
};

const pendingSave = debounce(() => app.flush(), 400);

function migrate(data) {
  const base = defaultState();
  const st = { ...base, ...data };
  st.settings = { ...base.settings, ...(data.settings || {}) };
  for (const k of ['done', 'contacts', 'indicatorData']) st[k] ??= {};
  st.agenda ??= { date: null, items: [] };
  return st;
}

function logo() {
  return s('svg', { viewBox: '0 0 32 32', 'aria-hidden': 'true' }, s('circle', { cx: 16, cy: 16, r: 14, fill: 'none', stroke: '#5cd1de', 'stroke-width': 2.5 }), s('path', { d: 'M16 5l4 11-4 11-4-11z', fill: '#5cd1de' }), s('path', { d: 'M16 16l4 0-4 11z', fill: '#fff', opacity: 0.85 }), s('circle', { cx: 16, cy: 16, r: 2, fill: '#0f2a33' }));
}

function icon(d) {
  return s('svg', { viewBox: '0 0 24 24', width: 18, height: 18, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }, s('path', { d }));
}

function render() {
  const root = document.getElementById('root');
  if (!app.state) return;
  app.cache = {};
  app.ref = todayISO();
  const view = VIEWS.find((v) => v.id === app.ui.view) || VIEWS[0];
  let content;
  try {
    content = view.mod.render(app);
  } catch (err) {
    console.error(err);
    content = h('div', { class: 'page' }, h('h1', null, 'Ocorreu um erro'), h('p', null, String(err.message || err)));
  }
  const counts = {
    cuidados: app.state.patients.length ? app.gaps().length : null,
    preconsulta: app.state.agenda?.date === app.ref ? app.state.agenda.items.length : null,
    tarefas: app.state.tasks.filter((t) => t.status === 'pendente').length || null,
  };
  const side = h(
    'nav',
    { class: 'side', 'aria-label': 'Navegação principal' },
    h('div', { class: 'brand' }, logo(), 'Bússola MGF'),
    VIEWS.map((v) =>
      v.sep
        ? h('div', { class: 'sep' })
        : h('button', { class: ['nav', v.id === view.id && 'active'], 'aria-current': v.id === view.id ? 'page' : null, onclick: () => app.go(v.id) }, icon(v.icon), v.label, counts[v.id] ? h('span', { class: 'count' }, counts[v.id]) : null),
    ),
    h(
      'div',
      { class: 'foot' },
      app.state.settings.medico ? h('div', null, app.state.settings.medico) : null,
      app.state.settings.usf ? h('div', null, app.state.settings.usf) : null,
      h('div', null, 'Dados cifrados neste computador'),
      h('button', { class: 'btn sm', onclick: () => app.lock() }, 'Bloquear agora'),
    ),
  );
  root.replaceChildren(h('div', { class: 'shell' }, side, h('main', { class: 'main' }, content)));
}

// ---- bloqueio / desbloqueio ----

function lockScreen(mode, errorMsg = '') {
  const root = document.getElementById('root');
  const err = h('p', { class: 'err', role: 'alert' }, errorMsg);
  const pw = h('input', { type: 'password', autocomplete: mode === 'create' ? 'new-password' : 'current-password', required: true, 'aria-label': 'Palavra-passe' });
  const pw2 = h('input', { type: 'password', autocomplete: 'new-password', required: true, 'aria-label': 'Repetir palavra-passe' });
  const btn = h('button', { class: 'btn primary', type: 'submit' }, mode === 'create' ? 'Criar e entrar' : 'Desbloquear');
  const form = h(
    'form',
    {
      onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
        if (mode === 'create') {
          if (pw.value.length < 8) return (err.textContent = 'A palavra-passe deve ter pelo menos 8 caracteres.');
          if (pw.value !== pw2.value) return (err.textContent = 'As palavras-passe não coincidem.');
        }
        btn.disabled = true;
        btn.textContent = 'A processar…';
        try {
          const data = mode === 'create' ? (await api.create(pw.value, defaultState()), defaultState()) : await api.unlock(pw.value);
          app.state = migrate(data);
          startIdleWatch();
          render();
          if (mode === 'create') toast('Dados criados. Comece por «Importar dados» ou experimente os dados de demonstração.');
        } catch (ex) {
          err.textContent = ex.message;
          btn.disabled = false;
          btn.textContent = mode === 'create' ? 'Criar e entrar' : 'Desbloquear';
          pw.select();
        }
      },
    },
    mode === 'create'
      ? [
          h('p', null, 'Bem-vindo(a). Defina uma palavra-passe para proteger os dados guardados neste computador.'),
          h('div', { class: 'notice' }, 'Os dados ficam cifrados com esta palavra-passe. Se a esquecer, não é possível recuperá-los.'),
          h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Palavra-passe (mín. 8 caracteres)'), pw),
          h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Repetir palavra-passe'), pw2),
        ]
      : [h('p', null, 'Os dados estão bloqueados. Introduza a palavra-passe.'), h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Palavra-passe'), pw)],
    err,
    btn,
    mode === 'unlock'
      ? h(
          'button',
          {
            type: 'button',
            class: 'btn ghost sm',
            onclick: async () => {
              if (await confirmDialog('Apagar todos os dados?', 'Esqueceu a palavra-passe? A única opção é apagar os dados cifrados deste computador e começar de novo. Esta ação não pode ser desfeita.', 'Apagar e recomeçar', true)) {
                await api.wipe();
              }
            },
          },
          'Esqueci a palavra-passe',
        )
      : null,
  );
  root.replaceChildren(h('div', { class: 'lock' }, h('div', { class: 'lock-box' }, h('div', { class: 'brand' }, logo(), 'Bússola MGF'), form)));
  pw.focus();
}

// ---- bloqueio por inatividade ----

let lastActivity = Date.now();
let idleTimer = null;
function startIdleWatch() {
  const bump = () => (lastActivity = Date.now());
  for (const ev of ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart']) window.addEventListener(ev, bump, { passive: true });
  clearInterval(idleTimer);
  idleTimer = setInterval(() => {
    const mins = +app.state?.settings.lockMinutes || 0;
    if (mins > 0 && Date.now() - lastActivity > mins * 60000) {
      clearInterval(idleTimer);
      app.lock();
    }
  }, 15000);
}

async function boot() {
  if (!api) {
    document.getElementById('root').replaceChildren(h('div', { class: 'splash' }, 'Esta página só funciona dentro da aplicação Bússola MGF.'));
    return;
  }
  const st = await api.status();
  lockScreen(st.exists ? 'unlock' : 'create');
}

window.addEventListener('beforeunload', () => {
  if (app.state) api.save(app.state);
});

boot();
