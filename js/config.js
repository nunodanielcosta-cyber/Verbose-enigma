// Ligação ao Supabase. Preenche com os valores de: Supabase → Project Settings → API.
// A "anon key" é pública por natureza: a segurança é garantida pelas regras (RLS) em supabase/schema.sql.
// Se ficar vazio, a app pede estes valores no primeiro arranque (ou permite usar o modo demonstração).
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';

// Nome da Edge Function que vai buscar preços às lojas (supabase/functions/precos).
export const PRICES_FUNCTION = 'precos';
