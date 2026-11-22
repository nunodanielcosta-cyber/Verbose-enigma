// Junta a Edge Function "precos" (lib.js + stores.js + index.ts) num único ficheiro,
// para colar no editor do painel do Supabase (Edge Functions → Deploy a new function → Via Editor).
// Uso: npm run bundle   →   cria supabase/precos-um-ficheiro.ts
import { readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('../supabase/functions/precos/', import.meta.url);
const read = (f) => readFileSync(new URL(f, dir), 'utf8');
const strip = (src) => src
  .split('\n')
  .filter((l) => !/^import .* from '\.\/.*';$/.test(l))   // imports locais já não são precisos
  .map((l) => l.replace(/^export (?=(async )?function|const|class|let)/, ''))
  .join('\n');

const out = [
  '// ============================================================================',
  '// Edge Function "precos" — FICHEIRO ÚNICO GERADO (npm run bundle). Não editar aqui:',
  '// edita supabase/functions/precos/*.js e volta a gerar.',
  '// Colar no painel do Supabase: Edge Functions → Deploy a new function → Via Editor,',
  '// nome da função: precos',
  '// ============================================================================',
  '',
  "import { parseHTML } from 'npm:linkedom@0.18.14';",
  '',
  '// ---------- lib.js ----------',
  strip(read('lib.js')),
  '// ---------- stores.js ----------',
  strip(read('stores.js')),
  '// ---------- index.ts ----------',
  strip(read('index.ts')).replace("import { parseHTML } from 'npm:linkedom@0.18.14';\n", ''),
].join('\n');

writeFileSync(new URL('../supabase/precos-um-ficheiro.ts', import.meta.url), out);
console.log('Criado supabase/precos-um-ficheiro.ts (' + out.split('\n').length + ' linhas)');
