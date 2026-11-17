// OtoDita — Web Worker de transcrição com Whisper a correr localmente no navegador (transformers.js)
// O áudio nunca sai do computador. O modelo é descarregado uma única vez e fica em cache.
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2';

env.allowLocalModels = false;
env.useBrowserCache = true;

let asr = null;
let loadedKey = null;

const post = (type, data = {}) => self.postMessage({ type, ...data });

async function load(model, pref) {
  const wantGpu = pref === 'webgpu' || (pref === 'auto' && !!self.navigator?.gpu);
  const opts = (device) => ({
    device,
    dtype: device === 'webgpu' ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8',
    progress_callback: (p) => post('progress', { data: p }),
  });
  if (wantGpu) {
    try {
      const p = await pipeline('automatic-speech-recognition', model, opts('webgpu'));
      return { p, device: 'webgpu' };
    } catch (e) {
      post('status', { message: 'WebGPU indisponível — a usar CPU (WASM)…' });
    }
  }
  const p = await pipeline('automatic-speech-recognition', model, opts('wasm'));
  return { p, device: 'wasm' };
}

self.onmessage = async (e) => {
  const { type, id } = e.data;
  if (type !== 'transcribe') return;
  const { audio, model, device, language } = e.data;
  try {
    const key = `${model}|${device}`;
    if (!asr || loadedKey !== key) {
      post('status', { id, message: 'A carregar modelo Whisper (só demora na primeira vez)…' });
      asr = null;
      const r = await load(model, device);
      asr = r.p;
      loadedKey = key;
      post('status', { id, message: `Modelo pronto (${r.device === 'webgpu' ? 'GPU' : 'CPU'}).` });
    }
    post('status', { id, message: 'A transcrever…' });
    const out = await asr(audio, {
      language,
      task: 'transcribe',
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: false,
    });
    const text = Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text;
    post('result', { id, text: (text || '').trim() });
  } catch (err) {
    post('error', { id, message: String(err?.message || err) });
  }
};
