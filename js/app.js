// OtoDita — aplicação principal
import { SECTIONS, GROUPS, SECTION_BY_ID, applyVoiceCommands, applyCorrections, normalize, capitalizeFirst } from './orl.js';
import { organize, emptyNote, splitSentences } from './organizer.js';
import { organizeWithLLM, listModels } from './llm.js';
import { Dictation, webSpeechAvailable } from './dictation.js';
import { Recorder, transcribe, cancelTranscription } from './audio.js';
import { buildBlocks, blocksToText, copyText } from './sclinico.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ------------------------------------------------------------------ */
/* Definições                                                          */
/* ------------------------------------------------------------------ */
const DEFAULTS = {
  dictEngine: 'webspeech',
  lang: 'pt-PT',
  onDevice: false,
  autoPunct: true,
  expandNormal: true,
  asrEngine: 'browser',
  whisperModel: 'onnx-community/whisper-small',
  whisperDevice: 'auto',
  asrServerUrl: 'http://localhost:8000/v1/audio/transcriptions',
  asrServerModel: 'whisper-1',
  llmProvider: 'ollama',
  llmUrl: 'http://localhost:11434',
  llmModel: 'qwen2.5:7b',
  llmApiKey: '',
  llmContext: 8192,
  format: 'soap',
  upperHeadings: true,
  includeEmpty: false,
  keepDraft: true,
  version: 2,
};
const SETTINGS_KEY = 'otodita-settings';
const DRAFT_KEY = 'otodita-draft';

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    // v2: SOAP passa a ser o formato predefinido (aplica-se uma vez a definições antigas)
    if ((saved.version || 1) < 2) { delete saved.format; saved.version = 2; }
    return { ...DEFAULTS, ...saved };
  } catch { return { ...DEFAULTS }; }
}
const settings = loadSettings();
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* sem armazenamento */ }
}

/* ------------------------------------------------------------------ */
/* Utilitários de interface                                            */
/* ------------------------------------------------------------------ */
let toastTimer;
function toast(msg, type = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, type === 'error' ? 7000 : 2600);
}
const toastError = (err) => { if (err?.name !== 'AbortError') toast(err?.message || String(err), 'error'); };

function autosize(ta) {
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 2 + 'px';
}

async function busy(btn, fn) {
  btn.classList.add('busy');
  btn.disabled = true;
  try { return await fn(); } finally { btn.classList.remove('busy'); btn.disabled = false; }
}

const ICON_COPY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 16H8V7h11v14Z"/></svg>';
const ICON_CLEAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4Z"/></svg>';
const ICON_DOC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm4 18H6V4h7v5h5v11ZM8 12h8v2H8v-2Zm0 4h8v2H8v-2Z"/></svg>';

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ------------------------------------------------------------------ */
/* Editor de registo (campos + saída SClinico)                         */
/* ------------------------------------------------------------------ */
const editors = [];

class NoteEditor {
  constructor({ fieldsEl, outputEl, onEdit, onMacro }) {
    Object.assign(this, { fieldsEl, outputEl, onEdit, onMacro });
    this.inputs = {};
    this.renderFields();
    this.renderOutputShell();
    this.renderOutput();
    editors.push(this);
  }

  renderFields() {
    const html = GROUPS.map((g) => {
      const secs = SECTIONS.filter((s) => s.group === g.id);
      return `<div class="group-title"><b>${g.id}</b>${esc(g.label)}</div>` + secs.map((s) => `
        <div class="f" data-id="${s.id}">
          <div class="f-head">
            <label for="${this.fieldsEl.id}-${s.id}">${esc(s.label)}</label>
            ${s.macro ? `<button class="chip" data-macro="${s.id}" title="Inserir texto-padrão de exame normal">Normal</button>` : ''}
            <button class="icon-btn" data-copy="${s.id}" title="Copiar esta secção">${ICON_COPY}</button>
            <button class="icon-btn" data-clear="${s.id}" title="Limpar">${ICON_CLEAR}</button>
          </div>
          <textarea id="${this.fieldsEl.id}-${s.id}" rows="1" spellcheck="true" lang="pt-PT"></textarea>
        </div>`).join('');
    }).join('');
    this.fieldsEl.innerHTML = html;
    for (const s of SECTIONS) {
      const ta = $(`#${this.fieldsEl.id}-${s.id}`);
      this.inputs[s.id] = ta;
      ta.addEventListener('input', () => {
        autosize(ta);
        ta.closest('.f').classList.toggle('filled', !!ta.value.trim());
        this.renderOutput();
        this.onEdit?.(s.id);
      });
    }
    this.fieldsEl.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.macro) {
        const id = b.dataset.macro;
        if (this.onMacro) this.onMacro(id);
        else this.appendTo(id, SECTION_BY_ID[id].macro);
      } else if (b.dataset.copy) {
        const v = this.inputs[b.dataset.copy].value.trim();
        if (!v) return toast('Secção vazia.');
        copyText(v).then(() => toast(`«${SECTION_BY_ID[b.dataset.copy].label}» copiado.`));
      } else if (b.dataset.clear) {
        this.inputs[b.dataset.clear].value = '';
        this.inputs[b.dataset.clear].dispatchEvent(new Event('input'));
      }
    });
  }

  appendTo(id, text) {
    const ta = this.inputs[id];
    ta.value = ta.value.trim() ? ta.value.trim() + ' ' + text : text;
    ta.dispatchEvent(new Event('input'));
    this.flash([id]);
  }

  setData(note, { flash = false } = {}) {
    const changed = [];
    for (const s of SECTIONS) {
      const ta = this.inputs[s.id];
      const v = note[s.id] || '';
      if (ta.value !== v) { ta.value = v; changed.push(s.id); }
      ta.closest('.f').classList.toggle('filled', !!v.trim());
    }
    requestAnimationFrame(() => Object.values(this.inputs).forEach(autosize));
    if (flash) this.flash(changed);
    this.renderOutput();
  }

  flash(ids) {
    for (const id of ids) {
      const f = this.inputs[id].closest('.f');
      f.classList.remove('flash');
      void f.offsetWidth;
      f.classList.add('flash');
    }
  }

  getData() {
    return Object.fromEntries(SECTIONS.map((s) => [s.id, this.inputs[s.id].value]));
  }

  clear() { this.setData(emptyNote()); }

  renderOutputShell() {
    this.outputEl.innerHTML = `
      <div class="out-head">
        <h2>${ICON_DOC}Texto para o SClinico</h2>
        <select class="fmt" aria-label="Formato">
          <option value="soap">SOAP (S/O/A/P)</option>
          <option value="orl">ORL detalhado</option>
        </select>
        <span class="spacer"></span>
        <button class="btn primary copy-all">${ICON_COPY}Copiar tudo</button>
      </div>
      <div class="blocks"></div>`;
    this.fmtSel = $('.fmt', this.outputEl);
    this.fmtSel.value = settings.format;
    this.fmtSel.addEventListener('change', () => {
      settings.format = this.fmtSel.value;
      saveSettings();
      syncSettingsForm();
      editors.forEach((e) => e.renderOutput());
    });
    $('.copy-all', this.outputEl).addEventListener('click', () => this.copyAll());
    $('.blocks', this.outputEl).addEventListener('click', (e) => {
      const b = e.target.closest('[data-block]');
      if (!b) return;
      const block = this.blocks[Number(b.dataset.block)];
      copyText(block.text).then(() => toast(`${block.title} copiado — cole no campo correspondente do SClinico.`));
    });
  }

  renderOutput() {
    this.fmtSel.value = settings.format;
    this.blocks = buildBlocks(this.getData(), settings);
    const el = $('.blocks', this.outputEl);
    if (!this.blocks.length || this.blocks.every((b) => !b.text.replace(/—/g, '').trim())) {
      el.innerHTML = '<div class="empty">O texto organizado para o SClinico aparece aqui. Pode copiar tudo de uma vez ou bloco a bloco.</div>';
      el.style.display = 'block';
      return;
    }
    el.style.display = '';
    el.innerHTML = this.blocks.map((b, i) => `
      <div class="block">
        <div class="block-head"><strong>${esc(b.title)}</strong>
          <button class="icon-btn" data-block="${i}" title="Copiar bloco">${ICON_COPY}</button></div>
        <pre>${esc(b.text)}</pre>
      </div>`).join('');
  }

  async copyAll() {
    const blocks = buildBlocks(this.getData(), settings);
    if (!blocks.length) return toast('Ainda não há nada para copiar.');
    await copyText(blocksToText(blocks));
    toast('Registo copiado. Cole no SClinico (Ctrl+V).');
  }
}

/* ------------------------------------------------------------------ */
/* Separadores                                                         */
/* ------------------------------------------------------------------ */
let currentTab = 'ditado';
function showTab(name) {
  currentTab = name;
  $$('.tab').forEach((t) => {
    const on = t.dataset.tab === name;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', on);
  });
  $$('.panel').forEach((p) => {
    const on = p.id === 'tab-' + name;
    p.classList.toggle('active', on);
    p.hidden = !on;
  });
  if (name !== 'definicoes') requestAnimationFrame(() => $$(`#tab-${name} textarea`).forEach((t) => t.closest('.f') && autosize(t)));
}
$$('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

/* ------------------------------------------------------------------ */
/* Ditado                                                              */
/* ------------------------------------------------------------------ */
const dictRaw = $('#dictRaw');
const dictAuto = $('#dictAuto');
const dictMic = $('#dictMic');

const dictEditor = new NoteEditor({
  fieldsEl: $('#dictFields'),
  outputEl: $('#dictOutputCard'),
  onEdit: () => {
    if (dictAuto.checked) {
      dictAuto.checked = false;
      toast('Organização automática pausada porque editou um campo. Pode reativá-la a qualquer momento.');
    }
    saveDraft();
  },
  onMacro: (id) => {
    const s = SECTION_BY_ID[id];
    if (dictAuto.checked) {
      appendRaw(`${s.short}: ${s.macro}`, { newLine: true });
    } else {
      dictEditor.appendTo(id, s.macro);
    }
  },
});

function organizeDictation({ flash = false } = {}) {
  dictEditor.setData(organize(dictRaw.value, settings), { flash });
  saveDraft();
}

function appendRaw(text, { newLine = false } = {}) {
  let cur = dictRaw.value.replace(/[ \t]+$/, '');
  let t = text.trim();
  if (!t) return;
  if (!cur) cur = '';
  else if (newLine) {
    if (!/[.!?:;]$/.test(cur) && !cur.endsWith('\n')) cur += '.';
    cur += cur.endsWith('\n') ? '' : '\n';
  } else if (cur.endsWith('\n')) {
    // nada
  } else if (/^[.,;:!?)]/.test(t)) {
    // a frase começa com pontuação ditada: cola diretamente
  } else if (settings.autoPunct && !/[.!?:;,(\/-]$/.test(cur)) {
    cur += '. ';
  } else {
    cur += ' ';
  }
  if (!cur || /[.!?]\s*$|\n$/.test(cur)) t = capitalizeFirst(t);
  dictRaw.value = cur + t;
  dictRaw.scrollTop = dictRaw.scrollHeight;
  if (dictAuto.checked) organizeDictation({ flash: true });
  else saveDraft();
}

function deleteLastSentence() {
  const parts = splitSentences(dictRaw.value);
  if (!parts.length) return;
  const last = parts[parts.length - 1];
  const idx = dictRaw.value.lastIndexOf(last);
  dictRaw.value = dictRaw.value.slice(0, idx).replace(/\s+$/, '');
  if (dictAuto.checked) organizeDictation();
  toast('Última frase apagada.');
}

function handleFinal(text) {
  const n = normalize(text).replace(/[.!?,]/g, '').trim();
  if (/^(apagar|apaga|eliminar)( a)? (ultima frase|isso|ultima linha)$/.test(n) || n === 'apagar') return deleteLastSentence();
  const processed = applyCorrections(applyVoiceCommands(text));
  appendRaw(processed);
}

const dictation = new Dictation({
  getSettings: () => settings,
  onInterim: (t) => { $('#dictInterim').textContent = t; },
  onFinal: handleFinal,
  onLevel: (v) => { $('#dictLevel').style.width = Math.round(v * 100) + '%'; },
  onState: (st) => {
    dictMic.classList.toggle('on', st === 'listening' || st === 'recording');
    dictMic.classList.toggle('processing', st === 'processing');
    dictMic.setAttribute('aria-label', st === 'idle' ? 'Iniciar ditado' : 'Parar ditado');
    $('#dictState').textContent = {
      idle: 'Pronto a ditar',
      listening: 'A ouvir… fale naturalmente',
      recording: 'A gravar (Whisper local)…',
      processing: 'A transcrever localmente…',
    }[st] || st;
    if (st === 'idle') $('#dictLevel').style.width = '0';
  },
  onError: toastError,
});
dictMic.addEventListener('click', () => dictation.toggle());

dictRaw.addEventListener('input', () => {
  clearTimeout(dictRaw._t);
  dictRaw._t = setTimeout(() => { if (dictAuto.checked) organizeDictation(); else saveDraft(); }, 400);
});
dictAuto.addEventListener('change', () => { if (dictAuto.checked) organizeDictation({ flash: true }); });
$('#dictOrganize').addEventListener('click', () => {
  if (!dictRaw.value.trim()) return toast('Dite ou escreva primeiro o texto.');
  organizeDictation({ flash: true });
  toast('Ditado organizado.');
});

let dictAbort;
$('#dictAI').addEventListener('click', (e) => {
  if (!dictRaw.value.trim()) return toast('Dite ou escreva primeiro o texto.');
  const btn = e.currentTarget;
  dictAbort = new AbortController();
  busy(btn, async () => {
    try {
      const note = await organizeWithLLM(dictRaw.value, 'ditado', settings, {
        signal: dictAbort.signal,
        onProgress: (n) => { $('#dictInterim').textContent = `IA local a organizar… (${n} caracteres)`; },
      });
      dictAuto.checked = false;
      dictEditor.setData(note, { flash: true });
      saveDraft();
      toast('Organizado pela IA local. Reveja antes de copiar.');
      setAiStatus(true);
    } catch (err) {
      toastError(err);
    } finally {
      $('#dictInterim').textContent = '';
    }
  });
});

$('#dictNew').addEventListener('click', () => {
  if ((dictRaw.value.trim() || Object.values(dictEditor.getData()).some((v) => v.trim())) && !confirm('Apagar o ditado e o registo atuais e começar uma nova consulta?')) return;
  dictation.stop();
  dictRaw.value = '';
  dictEditor.clear();
  dictAuto.checked = true;
  saveDraft();
  dictRaw.focus();
});

/* ------------------------------------------------------------------ */
/* Gravação de consulta                                                */
/* ------------------------------------------------------------------ */
const consEditor = new NoteEditor({ fieldsEl: $('#consFields'), outputEl: $('#consOutputCard'), onEdit: () => saveDraft() });
const consTranscript = $('#consTranscript');
const recStart = $('#recStart');
const recPause = $('#recPause');
const recStop = $('#recStop');
const recAudio = $('#recAudio');
let audioBlob = null;
let audioUrl = null;

const fmtTime = (ms) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

const recorder = new Recorder({
  onLevel: (v) => { $('#recLevel').style.width = Math.round(v * 100) + '%'; },
  onTick: (ms) => { $('#recTime').textContent = fmtTime(ms); },
});

function updateRecButtons() {
  const st = recorder.state;
  const consent = $('#consConsent').checked;
  recStart.disabled = !consent || st === 'stopping';
  recStart.classList.toggle('on', st === 'recording' || st === 'paused');
  $('.rec-label', recStart).textContent = st === 'recording' ? 'A gravar…' : st === 'paused' ? 'Em pausa' : 'Gravar';
  recPause.disabled = !(st === 'recording' || st === 'paused');
  recPause.textContent = st === 'paused' ? 'Retomar' : 'Pausa';
  recStop.disabled = !(st === 'recording' || st === 'paused');
  $('#consTranscribe').disabled = !audioBlob || st !== 'idle';
}

function setAudio(blob) {
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioBlob = blob;
  audioUrl = blob ? URL.createObjectURL(blob) : null;
  recAudio.hidden = !blob;
  $('#recDelete').hidden = !blob;
  if (blob) recAudio.src = audioUrl; else recAudio.removeAttribute('src');
  updateRecButtons();
}

$('#consConsent').addEventListener('change', updateRecButtons);
recStart.addEventListener('click', async () => {
  if (recorder.state !== 'idle') return;
  if (audioBlob && !confirm('Já existe uma gravação. Substituí-la por uma nova?')) return;
  try {
    setAudio(null);
    await recorder.start();
    toast('Gravação iniciada. O áudio fica apenas neste computador.');
  } catch (err) {
    toastError(err.name === 'NotAllowedError' ? new Error('Acesso ao microfone negado.') : err);
  }
  updateRecButtons();
});
recPause.addEventListener('click', () => {
  if (recorder.state === 'recording') recorder.pause(); else recorder.resume();
  updateRecButtons();
});
recStop.addEventListener('click', async () => {
  const p = recorder.stop();
  updateRecButtons();
  const blob = await p;
  setAudio(blob);
  if (blob) toast('Gravação terminada. Clique em «Transcrever áudio».');
});
$('#recFile').addEventListener('change', (e) => {
  const f = e.target.files?.[0];
  if (f) { setAudio(f); toast(`Ficheiro «${f.name}» carregado.`); }
  e.target.value = '';
});
$('#recDelete').addEventListener('click', () => {
  if (!confirm('Eliminar a gravação áudio desta consulta?')) return;
  setAudio(null);
  $('#recTime').textContent = '00:00';
  toast('Gravação eliminada.');
});

// progresso de download/transcrição
const prog = $('#consProgress');
const fileProg = new Map();
function setProgress(text, pct) {
  prog.hidden = false;
  $('span', prog).textContent = text;
  prog.classList.toggle('indet', pct == null);
  $('.bar > div', prog).style.width = pct == null ? '' : Math.round(pct) + '%';
}
function onModelProgress(p) {
  if (p.status === 'progress' && p.total) {
    fileProg.set(p.file, { loaded: p.loaded, total: p.total });
    let l = 0; let t = 0;
    for (const v of fileProg.values()) { l += v.loaded; t += v.total; }
    setProgress(`A descarregar o modelo Whisper (só na primeira vez)… ${(l / 1e6).toFixed(0)} / ${(t / 1e6).toFixed(0)} MB`, (l / t) * 100);
  }
}

let consAbort;
$('#consTranscribe').addEventListener('click', async (e) => {
  if (!audioBlob) return;
  const btn = e.currentTarget;
  consAbort = new AbortController();
  $('#consCancel').hidden = false;
  fileProg.clear();
  setProgress('A preparar…', null);
  await busy(btn, async () => {
    try {
      const t0 = performance.now();
      const text = await transcribe(audioBlob, settings, {
        signal: consAbort.signal,
        onStatus: (m) => setProgress(m, null),
        onProgress: onModelProgress,
      });
      if (!text) throw new Error('Não foi reconhecida fala na gravação.');
      consTranscript.value = consTranscript.value.trim() ? consTranscript.value.trim() + '\n\n' + text : text;
      saveDraft();
      toast(`Transcrição concluída em ${Math.round((performance.now() - t0) / 1000)} s. Reveja e clique em «Analisar com IA local».`);
    } catch (err) {
      toastError(err);
    } finally {
      prog.hidden = true;
      $('#consCancel').hidden = true;
    }
  });
  updateRecButtons();
});
$('#consCancel').addEventListener('click', () => { consAbort?.abort(); cancelTranscription(); });

$('#consAnalyze').addEventListener('click', (e) => {
  if (!consTranscript.value.trim()) return toast('Não há transcrição para analisar.');
  const btn = e.currentTarget;
  consAbort = new AbortController();
  busy(btn, async () => {
    setProgress('A IA local está a analisar a consulta…', null);
    $('#consCancel').hidden = false;
    try {
      const note = await organizeWithLLM(consTranscript.value, 'consulta', settings, {
        signal: consAbort.signal,
        onProgress: (n) => setProgress(`A IA local está a organizar o registo… (${n} caracteres gerados)`, null),
      });
      consEditor.setData(note, { flash: true });
      saveDraft();
      setAiStatus(true);
      toast('Registo organizado pela IA local. Reveja antes de copiar para o SClinico.');
    } catch (err) {
      toastError(err);
    } finally {
      prog.hidden = true;
      $('#consCancel').hidden = true;
    }
  });
});
$('#consRules').addEventListener('click', () => {
  if (!consTranscript.value.trim()) return toast('Não há transcrição para organizar.');
  consEditor.setData(organize(consTranscript.value, settings), { flash: true });
  saveDraft();
  toast('Organizado por regras. Para conversas, a IA local dá melhores resultados.');
});
consTranscript.addEventListener('input', () => { clearTimeout(consTranscript._t); consTranscript._t = setTimeout(saveDraft, 500); });
$('#consNew').addEventListener('click', () => {
  if (!confirm('Apagar a gravação, a transcrição e o registo desta consulta?')) return;
  setAudio(null);
  $('#recTime').textContent = '00:00';
  consTranscript.value = '';
  consEditor.clear();
  saveDraft();
});

window.addEventListener('beforeunload', (e) => {
  if (recorder.state === 'recording' || recorder.state === 'paused' || dictation.active) {
    e.preventDefault();
    e.returnValue = '';
  }
});

/* ------------------------------------------------------------------ */
/* Rascunho (sessionStorage — apagado ao fechar o separador)           */
/* ------------------------------------------------------------------ */
function saveDraft() {
  try {
    if (!settings.keepDraft) return sessionStorage.removeItem(DRAFT_KEY);
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
      dictRaw: dictRaw.value,
      dictAuto: dictAuto.checked,
      dictNote: dictEditor.getData(),
      consTranscript: consTranscript.value,
      consNote: consEditor.getData(),
    }));
  } catch { /* opcional */ }
}
function loadDraft() {
  try {
    const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null');
    if (!d || !settings.keepDraft) return;
    dictRaw.value = d.dictRaw || '';
    dictAuto.checked = d.dictAuto !== false;
    dictEditor.setData({ ...emptyNote(), ...d.dictNote });
    consTranscript.value = d.consTranscript || '';
    consEditor.setData({ ...emptyNote(), ...d.consNote });
  } catch { /* ignora */ }
}

/* ------------------------------------------------------------------ */
/* Formulário de definições                                            */
/* ------------------------------------------------------------------ */
function syncSettingsForm() {
  $$('[data-setting]').forEach((el) => {
    const k = el.dataset.setting;
    if (el.type === 'checkbox') el.checked = !!settings[k];
    else el.value = settings[k] ?? '';
  });
  updateEngineLabel();
}
function updateEngineLabel() {
  const whisper = settings.dictEngine === 'whisper' || !webSpeechAvailable;
  $('#dictEngineLabel').textContent = whisper
    ? 'Whisper local: clique para gravar, clique de novo para transcrever · F2'
    : 'F2 inicia/para · diga o nome da secção antes do conteúdo';
}
$$('[data-setting]').forEach((el) => {
  el.addEventListener('change', () => {
    const k = el.dataset.setting;
    settings[k] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value.trim();
    saveSettings();
    updateEngineLabel();
    editors.forEach((e) => e.renderOutput());
    if (k.startsWith('llm')) checkAi();
    if (k === 'keepDraft') saveDraft();
    if (k === 'expandNormal' && dictAuto.checked) organizeDictation();
  });
});
$('#resetSettings').addEventListener('click', () => {
  if (!confirm('Repor todas as definições?')) return;
  Object.assign(settings, DEFAULTS);
  saveSettings();
  syncSettingsForm();
  editors.forEach((e) => e.renderOutput());
  checkAi();
});
$('#llmTest').addEventListener('click', (e) => busy(e.currentTarget, async () => {
  const out = $('#llmTestResult');
  out.textContent = '';
  try {
    const models = await listModels(settings);
    $('#modelList').innerHTML = models.map((m) => `<option value="${esc(m)}">`).join('');
    const has = models.some((m) => m === settings.llmModel || m.split(':')[0] === settings.llmModel);
    out.textContent = `Ligado ✓ · ${models.length} modelo(s)` + (has ? '' : ` · «${settings.llmModel}» não encontrado`);
    setAiStatus(true, has ? '' : 'modelo em falta');
  } catch (err) {
    out.textContent = '';
    setAiStatus(false);
    toastError(err);
  }
}));

/* ------------------------------------------------------------------ */
/* Estado da IA local                                                  */
/* ------------------------------------------------------------------ */
function setAiStatus(ok, extra = '') {
  const el = $('#aiStatus');
  el.classList.toggle('ok', ok);
  el.classList.toggle('off', !ok);
  $('.label', el).textContent = ok ? `IA local: ${settings.llmModel}${extra ? ' (' + extra + ')' : ''}` : 'IA local: desligada';
  el.title = ok ? 'IA local disponível' : 'IA local não encontrada — o organizador por regras continua a funcionar. Clique para voltar a verificar.';
}
async function checkAi() {
  try {
    const models = await listModels(settings, 2500);
    $('#modelList').innerHTML = models.map((m) => `<option value="${esc(m)}">`).join('');
    const has = models.some((m) => m === settings.llmModel || m.split(':')[0] === settings.llmModel);
    setAiStatus(true, has ? '' : 'modelo em falta');
  } catch {
    setAiStatus(false);
  }
}
$('#aiStatus').addEventListener('click', () => {
  checkAi().then(() => {
    if ($('#aiStatus').classList.contains('off')) toast('IA local não encontrada. Veja as Definições → IA local. O organizador por regras funciona sem IA.', 'error');
  });
});

/* ------------------------------------------------------------------ */
/* Atalhos                                                             */
/* ------------------------------------------------------------------ */
document.addEventListener('keydown', (e) => {
  if (e.key === 'F2') {
    e.preventDefault();
    if (currentTab !== 'ditado') showTab('ditado');
    dictation.toggle();
  } else if (e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
    e.preventDefault();
    (currentTab === 'consulta' ? consEditor : dictEditor).copyAll();
  }
});

/* ------------------------------------------------------------------ */
/* Arranque                                                            */
/* ------------------------------------------------------------------ */
syncSettingsForm();
loadDraft();
updateRecButtons();
checkAi();
if (!webSpeechAvailable) {
  $('select[data-setting="dictEngine"] option[value="webspeech"]').disabled = true;
}
if (location.protocol === 'file:') {
  toast('Abra o OtoDita através do script «iniciar» (http://localhost) para o microfone funcionar.', 'error');
}
