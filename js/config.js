// Ligação ao Supabase. Preenche com os valores de: Supabase → Project Settings → API.
// A "anon key" é pública por natureza: a segurança é garantida pelas regras (RLS) em supabase/schema.sql.
// Se ficar vazio, a app pede estes valores no primeiro arranque (ou permite usar o modo demonstração).
export const SUPABASE_URL = 'https://ddqkjdfoucjipjzocvmk.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkcWtqZGZvdWNqaXBqem9jdm1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUyMTI0NTYsImV4cCI6MjExMDc4ODQ1Nn0.oLrmM0zgq4z6chpBkopVk_m65fB1D5sJEASIqKKxbCc';

// Nome da Edge Function que vai buscar preços às lojas (supabase/functions/precos).
export const PRICES_FUNCTION = 'precos';
