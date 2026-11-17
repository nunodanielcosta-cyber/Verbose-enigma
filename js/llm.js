// OtoDita — organização com IA local (Ollama ou servidor compatível OpenAI, ex.: LM Studio / llama.cpp)
import { SECTIONS, applyCorrections } from './orl.js';
import { emptyNote } from './organizer.js';

const SOURCE = {
  ditado: 'um ditado feito pelo médico otorrinolaringologista durante ou após a consulta (pode conter erros de reconhecimento de voz)',
  consulta: 'a transcrição automática de uma consulta de ORL, com diálogo entre médico, doente e eventualmente acompanhante. Não há identificação de quem fala e pode haver erros de reconhecimento de voz. Deduz pelo contexto o que são queixas do doente e o que são achados, decisões e explicações do médico',
};

export function buildMessages(text, mode = 'ditado') {
  const keys = SECTIONS.map((s) => `  "${s.id}": ${s.llm}`).join('\n');
  const system = `És um assistente de documentação clínica para Otorrinolaringologia (ORL) num hospital português.
Recebes ${SOURCE[mode] || SOURCE.ditado}.
A tua tarefa é extrair e organizar a informação clínica para o registo da consulta no SClinico.

Regras:
- Escreve em português europeu (pt-PT, Acordo Ortográfico de 1990), com terminologia médica de ORL e estilo de registo clínico: frases curtas, objetivas, sem primeira pessoa.
- NÃO inventes informação. Não acrescentes sintomas, achados, diagnósticos, doses ou tratamentos que não tenham sido referidos. Campo não abordado = "".
- Converte linguagem leiga em termos técnicos quando inequívoco (ex.: zumbido → acufeno; ouvir mal → hipoacusia; dor de ouvido → otalgia; nariz entupido → obstrução nasal; pingo no nariz → rinorreia; sangue do nariz → epistaxe; rouquidão → disfonia; dor a engolir → odinofagia; tonturas a rodar → vertigem rotatória; ressonar → roncopatia; cera → cerúmen).
- Preserva sempre a lateralidade (direito/esquerdo/bilateral), duração e evolução, graus, doses, posologia, durações de tratamento e valores numéricos (dB, Hz, IAH).
- Corrige erros evidentes de reconhecimento de voz em termos médicos (ex.: "rine" → Rinne; "veber" → Weber; "dix hallpike" → Dix-Hallpike).
- No exame objetivo inclui apenas achados explicitamente descritos. Se o médico disser apenas "normal", escreve "Sem alterações.".
- Distingue resultados de exames já realizados (campo "complementares") de exames a pedir (campo "plano").
- Ignora conversa social, explicações genéricas e dados administrativos. Não incluas nomes, números de utente ou outros identificadores.
- Se houver vários diagnósticos ou itens do plano, separa-os com "; " ou em linhas distintas.

Responde APENAS com um objeto JSON válido, sem texto adicional, com exatamente estas chaves (todos os valores são strings):
{
${keys}
}`;
  const user = `Texto a organizar:\n"""\n${text.trim()}\n"""`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/** Extrai o primeiro objeto JSON de uma resposta (tolera blocos ```json ... ``` ou texto à volta). */
export function parseJsonLoose(s) {
  const clean = (s || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```(?:json)?/g, '');
  try { return JSON.parse(clean); } catch { /* continua */ }
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(clean.slice(start, end + 1));
  throw new Error('A resposta da IA não contém JSON válido.');
}

export function toNote(obj) {
  const note = emptyNote();
  for (const id of Object.keys(note)) {
    let v = obj?.[id];
    if (Array.isArray(v)) v = v.filter(Boolean).join('\n');
    else if (v && typeof v === 'object') v = Object.entries(v).map(([k, x]) => `${k}: ${x}`).join('\n');
    v = v == null ? '' : String(v).trim();
    if (/^(n\/?a|nao referido|não referido|sem informacao|sem informação|-|—|null|nenhum)\.?$/i.test(v)) v = '';
    note[id] = applyCorrections(v);
  }
  return note;
}

function base(url) {
  return (url || '').replace(/\/+$/, '');
}

function networkError(settings, err) {
  if (err?.name === 'AbortError') return err;
  const where = base(settings.llmUrl);
  const extra = settings.llmProvider === 'ollama'
    ? `Confirme que o Ollama está a correr e que permite pedidos deste endereço (variável OLLAMA_ORIGINS, ex.: OLLAMA_ORIGINS="${location.origin}").`
    : 'Confirme que o servidor local está a correr e que tem CORS ativo.';
  return new Error(`Não foi possível contactar a IA local em ${where}. ${extra}`);
}

/**
 * Organiza texto com o modelo local.
 * @returns {Promise<object>} nota com as chaves das secções
 */
export async function organizeWithLLM(text, mode, settings, { signal, onProgress } = {}) {
  if (!text || !text.trim()) throw new Error('Não há texto para analisar.');
  const messages = buildMessages(text, mode);
  let content = '';

  try {
    if (settings.llmProvider === 'openai') {
      const headers = { 'Content-Type': 'application/json' };
      if (settings.llmApiKey) headers.Authorization = `Bearer ${settings.llmApiKey}`;
      const res = await fetch(`${base(settings.llmUrl)}/chat/completions`, {
        method: 'POST', headers, signal,
        body: JSON.stringify({ model: settings.llmModel, messages, temperature: 0.1, stream: false }),
      });
      if (!res.ok) throw new Error(`Servidor IA respondeu ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      content = data.choices?.[0]?.message?.content || '';
    } else {
      const res = await fetch(`${base(settings.llmUrl)}/api/chat`, {
        method: 'POST', signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: settings.llmModel,
          messages,
          stream: true,
          format: 'json',
          options: { temperature: 0.1, num_ctx: Number(settings.llmContext) || 8192 },
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        if (res.status === 502) throw new Error('O Ollama não está a correr neste computador. Abra a aplicação Ollama e tente de novo.');
        if (res.status === 404) throw new Error(`Modelo "${settings.llmModel}" não encontrado no Ollama. Instale com: ollama pull ${settings.llmModel}`);
        throw new Error(`Ollama respondeu ${res.status}: ${body.slice(0, 300)}`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line) continue;
          const msg = JSON.parse(line);
          if (msg.error) throw new Error(msg.error);
          content += msg.message?.content || '';
          onProgress?.(content.length);
        }
      }
    }
  } catch (err) {
    if (err instanceof TypeError) throw networkError(settings, err);
    throw err;
  }
  return toNote(parseJsonLoose(content));
}

/** Verifica a ligação e devolve a lista de modelos disponíveis. */
export async function listModels(settings, timeoutMs = 4000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    if (settings.llmProvider === 'openai') {
      const headers = settings.llmApiKey ? { Authorization: `Bearer ${settings.llmApiKey}` } : {};
      const res = await fetch(`${base(settings.llmUrl)}/models`, { headers, signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return (data.data || []).map((m) => m.id);
    }
    const res = await fetch(`${base(settings.llmUrl)}/api/tags`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data.models || []).map((m) => m.name);
  } catch (err) {
    if (err instanceof TypeError || err?.name === 'AbortError') throw networkError(settings, err);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
