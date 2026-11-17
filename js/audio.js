// OtoDita — gravação de áudio e transcrição local
import { applyCorrections, tidy } from './orl.js';

/** Gravador simples com pausa, cronómetro e nível de sinal. */
export class Recorder {
  constructor({ onLevel, onTick } = {}) {
    this.onLevel = onLevel;
    this.onTick = onTick;
    this.chunks = [];
    this.state = 'idle';
    this.elapsed = 0;
  }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador não permite gravar áudio (use Chrome/Edge em http://localhost ou https).');
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find((m) => window.MediaRecorder?.isTypeSupported?.(m));
    this.mr = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
    this.chunks = [];
    this.mr.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.mr.start(1000);
    this.state = 'recording';
    this.elapsed = 0;
    this._last = performance.now();
    this._meter();
    try { this.wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* opcional */ }
  }

  pause() {
    if (this.state !== 'recording') return;
    this.mr.pause();
    this.state = 'paused';
  }

  resume() {
    if (this.state !== 'paused') return;
    this.mr.resume();
    this._last = performance.now();
    this.state = 'recording';
  }

  stop() {
    return new Promise((resolve) => {
      if (!this.mr || this.state === 'idle') return resolve(null);
      this.mr.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.mr.mimeType || 'audio/webm' });
        this._cleanup();
        resolve(blob);
      };
      this.state = 'stopping';
      this.mr.stop();
    });
  }

  _cleanup() {
    this.stream?.getTracks().forEach((t) => t.stop());
    cancelAnimationFrame(this._raf);
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.wakeLock?.release?.().catch(() => {});
    this.state = 'idle';
    this.onLevel?.(0);
  }

  _meter() {
    try {
      this.ctx = new AudioContext();
      const src = this.ctx.createMediaStreamSource(this.stream);
      const an = this.ctx.createAnalyser();
      an.fftSize = 1024;
      src.connect(an);
      const buf = new Float32Array(an.fftSize);
      const loop = () => {
        an.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += v * v;
        const rms = Math.sqrt(sum / buf.length);
        const now = performance.now();
        if (this.state === 'recording') this.elapsed += now - this._last;
        this._last = now;
        this.onLevel?.(this.state === 'recording' ? Math.min(1, rms * 6) : 0);
        this.onTick?.(this.elapsed);
        this._raf = requestAnimationFrame(loop);
      };
      loop();
    } catch { /* medidor é opcional */ }
  }
}

/** Converte qualquer áudio (Blob/File) em Float32Array mono a 16 kHz, como o Whisper espera. */
export async function decodeTo16kMono(blob) {
  const ab = await blob.arrayBuffer();
  const ctx = new AudioContext({ sampleRate: 16000 });
  try {
    const buf = await ctx.decodeAudioData(ab);
    if (buf.numberOfChannels === 1) return buf.getChannelData(0).slice();
    const out = new Float32Array(buf.length);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) out[i] += d[i] / buf.numberOfChannels;
    }
    return out;
  } finally {
    ctx.close().catch(() => {});
  }
}

let worker = null;
let seq = 0;
const pending = new Map();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./whisper-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const msg = e.data;
    // as mensagens de progresso de download não trazem id: entregam-se a todos os pedidos ativos
    for (const [id, p] of pending) {
      if (msg.id !== undefined && msg.id !== id) continue;
      if (msg.type === 'progress') p.onProgress?.(msg.data);
      else if (msg.type === 'status') p.onStatus?.(msg.message);
      else if (msg.type === 'result') { pending.delete(id); p.resolve(msg.text); }
      else if (msg.type === 'error') { pending.delete(id); p.reject(new Error(msg.message)); }
    }
  };
  worker.onerror = (e) => {
    for (const [id, p] of pending) { pending.delete(id); p.reject(new Error(e.message || 'Erro no motor de transcrição.')); }
    worker = null;
  };
  return worker;
}

/** Cancela transcrições em curso (termina o worker). */
export function cancelTranscription() {
  if (!worker) return;
  worker.terminate();
  worker = null;
  for (const [id, p] of pending) { pending.delete(id); p.reject(Object.assign(new Error('Transcrição cancelada.'), { name: 'AbortError' })); }
}

/**
 * Transcreve áudio localmente.
 * settings.asrEngine: 'browser' (Whisper no navegador) | 'server' (servidor Whisper local compatível OpenAI)
 */
export async function transcribe(blob, settings, { onStatus, onProgress, signal } = {}) {
  let text;
  if (settings.asrEngine === 'server') {
    onStatus?.('A enviar para o servidor Whisper local…');
    const fd = new FormData();
    const ext = (blob.type.split('/')[1] || 'webm').split(';')[0];
    fd.append('file', blob, blob.name || `consulta.${ext}`);
    fd.append('model', settings.asrServerModel || 'whisper-1');
    fd.append('language', (settings.lang || 'pt-PT').slice(0, 2));
    fd.append('response_format', 'json');
    let res;
    try {
      res = await fetch(settings.asrServerUrl, { method: 'POST', body: fd, signal });
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      throw new Error(`Não foi possível contactar o servidor Whisper em ${settings.asrServerUrl}.`);
    }
    if (!res.ok) throw new Error(`Servidor Whisper respondeu ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const ct = res.headers.get('content-type') || '';
    text = ct.includes('json') ? (await res.json()).text : await res.text();
  } else {
    onStatus?.('A preparar o áudio…');
    const audio = await decodeTo16kMono(blob);
    if (audio.length < 16000 * 0.3) return '';
    const w = getWorker();
    const id = ++seq;
    text = await new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, onStatus, onProgress });
      signal?.addEventListener('abort', () => cancelTranscription(), { once: true });
      w.postMessage({ type: 'transcribe', id, audio, model: settings.whisperModel, device: settings.whisperDevice, language: 'portuguese' }, [audio.buffer]);
    });
  }
  return tidy(applyCorrections(text || ''));
}
