// OtoDita — motor de ditado em tempo real
//  - 'webspeech': reconhecimento de voz do navegador (Chrome/Edge), contínuo, com resultados provisórios
//  - 'whisper'  : grava o segmento e transcreve localmente com Whisper ao parar (100% offline)
import { Recorder, transcribe } from './audio.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

export const webSpeechAvailable = !!SR;

export class Dictation {
  constructor({ getSettings, onInterim, onFinal, onState, onError, onLevel }) {
    Object.assign(this, { getSettings, onInterim, onFinal, onState, onError, onLevel });
    this.active = false;
  }

  get engine() {
    const s = this.getSettings();
    return s.dictEngine === 'whisper' || !SR ? 'whisper' : 'webspeech';
  }

  toggle() {
    return this.active ? this.stop() : this.start();
  }

  async start() {
    if (this.active) return;
    this.active = true;
    try {
      if (this.engine === 'webspeech') this._startWebSpeech();
      else await this._startWhisper();
    } catch (err) {
      this.active = false;
      this.onState?.('idle');
      this.onError?.(err);
    }
  }

  async stop() {
    if (!this.active) return;
    this.active = false;
    if (this.rec) {
      try { this.rec.stop(); } catch { /* já parado */ }
      this.onState?.('idle');
    }
    if (this.recorder) {
      const r = this.recorder;
      this.recorder = null;
      const blob = await r.stop();
      if (!blob) return this.onState?.('idle');
      this.onState?.('processing');
      try {
        const text = await transcribe(blob, this.getSettings(), { onStatus: (m) => this.onInterim?.(m) });
        this.onInterim?.('');
        if (text) this.onFinal?.(text);
      } catch (err) {
        this.onError?.(err);
      } finally {
        this.onState?.('idle');
      }
    }
  }

  _startWebSpeech() {
    const s = this.getSettings();
    const rec = new SR();
    this.rec = rec;
    rec.lang = s.lang || 'pt-PT';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    if (s.onDevice && 'processLocally' in rec) rec.processLocally = true;

    rec.onstart = () => this.onState?.('listening');
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) this.onFinal?.(r[0].transcript.trim());
        else interim += r[0].transcript;
      }
      this.onInterim?.(interim);
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      if (e.error === 'language-not-supported' && rec.processLocally) {
        this.onError?.(new Error('O pacote de voz local para português não está instalado neste navegador — a usar o reconhecimento normal.'));
        this.getSettings().onDevice = false;
        return;
      }
      this.active = false;
      const msg = {
        'not-allowed': 'Acesso ao microfone negado. Autorize o microfone nas definições do navegador.',
        'service-not-allowed': 'O reconhecimento de voz não está disponível. Experimente o motor "Whisper local" nas Definições.',
        network: 'O reconhecimento de voz do navegador precisa de rede. Sem rede, use o motor "Whisper local" nas Definições.',
        'audio-capture': 'Não foi encontrado nenhum microfone.',
      }[e.error] || `Erro no reconhecimento de voz: ${e.error}`;
      this.onError?.(new Error(msg));
    };
    rec.onend = () => {
      this.onInterim?.('');
      // o Chrome termina a sessão após silêncio prolongado — reinicia enquanto o ditado estiver ativo
      if (this.active && this.rec === rec) {
        setTimeout(() => { if (this.active && this.rec === rec) this._startWebSpeech(); }, 150);
      } else {
        this.onState?.('idle');
      }
    };
    rec.start();
  }

  async _startWhisper() {
    this.recorder = new Recorder({ onLevel: this.onLevel });
    await this.recorder.start();
    this.onState?.('recording');
    this.onInterim?.('A gravar… clique de novo para parar e transcrever (Whisper local).');
  }
}
