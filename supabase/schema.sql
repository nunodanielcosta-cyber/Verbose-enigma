-- =====================================================================
-- Despensa — esquema da base de dados (Supabase)
-- Como usar: Supabase → SQL Editor → New query → colar tudo → Run.
-- Pode correr-se mais do que uma vez sem estragar dados.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Casas (agregados familiares) e membros ----------
create table if not exists public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'A nossa casa',
  invite_code text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  created_at  timestamptz not null default now()
);

create table if not exists public.members (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now(),
  unique (household_id, user_id)
);

-- O utilizador autenticado pertence a esta casa?
create or replace function public.is_member(h uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where household_id = h and user_id = auth.uid());
$$;

create or replace function public.create_household(p_name text, p_display_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  if auth.uid() is null then raise exception 'Sessão inválida'; end if;
  insert into public.households(name) values (coalesce(nullif(trim(p_name), ''), 'A nossa casa')) returning id into h;
  insert into public.members(household_id, user_id, display_name) values (h, auth.uid(), p_display_name);
  return h;
end $$;

create or replace function public.join_household(p_code text, p_display_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  if auth.uid() is null then raise exception 'Sessão inválida'; end if;
  select id into h from public.households where invite_code = upper(trim(p_code));
  if h is null then raise exception 'Código de convite inválido'; end if;
  insert into public.members(household_id, user_id, display_name) values (h, auth.uid(), p_display_name)
    on conflict (household_id, user_id) do update set display_name = excluded.display_name;
  return h;
end $$;

-- ---------- Dados da casa ----------
create table if not exists public.products (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null,
  brand        text,
  barcode      text,
  image_url    text,
  grp          text not null default 'alimentar',   -- alimentar, limpeza, higiene, casa, animais, bebe, outros
  category     text,                                 -- ex.: Laticínios (serve também para agrupar por corredor)
  location     text,                                 -- ex.: Despensa, Frigorífico
  unit         text not null default 'un',
  package_size numeric,                              -- ex.: 1 (L) por embalagem — usado no preço por kg/L
  package_unit text,
  compare_as   text,                                 -- ex.: "leite meio-gordo" — para procurar o mais barato
  qty          numeric not null default 0,
  min          numeric not null default 0,
  max          numeric not null default 0,
  expiry       date,
  opened_at    date,
  open_days    int,                                  -- dura X dias depois de aberto
  shelf_days   int,                                  -- dura X dias depois de comprado (fruta, legumes…)
  unit_kg      numeric,                              -- peso médio de 1 unidade (converte o peso do talão em unidades)
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid default auth.uid()
);
-- colunas acrescentadas depois da primeira versão (para bases de dados já criadas)
alter table public.products add column if not exists shelf_days int;
alter table public.products add column if not exists unit_kg numeric;
create index if not exists products_household_barcode on public.products(household_id, barcode);

create table if not exists public.shopping_items (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  product_id   uuid references public.products(id) on delete cascade,
  name         text not null,
  qty          numeric not null default 1,
  unit         text,
  note         text,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);

create table if not exists public.recipes (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null,
  servings     int not null default 2,
  tags         text[] not null default '{}',
  ingredients  jsonb not null default '[]',          -- [{product_id, name, qty, unit}]
  instructions text,
  image_url    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.meal_plan (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  day          date not null,
  meal         text not null default 'jantar',
  recipe_id    uuid references public.recipes(id) on delete cascade,
  servings     int,
  cooked       boolean not null default false,
  note         text
);

create table if not exists public.prices (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  product_id   uuid references public.products(id) on delete cascade,
  item_name    text,
  store        text not null,
  kind         text not null check (kind in ('same', 'cheapest', 'manual', 'receipt')),
  name         text,
  price        numeric not null,
  unit_price   numeric,
  unit_label   text,
  url          text,
  image_url    text,
  fetched_at   timestamptz not null default now()
);
create index if not exists prices_product on public.prices(household_id, product_id, fetched_at desc);

create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  product_id   uuid references public.products(id) on delete set null,
  product_name text,
  type         text not null,                        -- add, consume, buy, waste, open, cook, adjust
  delta        numeric,
  price        numeric,
  store        text,
  grp          text,
  user_id      uuid default auth.uid(),
  user_name    text,
  at           timestamptz not null default now()
);
create index if not exists events_household_at on public.events(household_id, at desc);

-- ---------- Autorizações base ----------
-- Só utilizadores com sessão iniciada (authenticated) podem usar as tabelas; as regras abaixo (RLS)
-- limitam depois cada pessoa aos dados da sua casa. Visitantes sem sessão (anon) não têm acesso.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;
grant execute on function public.is_member(uuid), public.create_household(text, text), public.join_household(text, text) to authenticated;
revoke execute on function public.create_household(text, text), public.join_household(text, text) from anon, public;

-- ---------- Segurança: cada casa só vê os seus dados ----------
alter table public.households enable row level security;
alter table public.members    enable row level security;

drop policy if exists "ver a minha casa" on public.households;
create policy "ver a minha casa" on public.households for select using (public.is_member(id));
drop policy if exists "editar a minha casa" on public.households;
create policy "editar a minha casa" on public.households for update using (public.is_member(id));

drop policy if exists "ver membros" on public.members;
create policy "ver membros" on public.members for select using (public.is_member(household_id));
drop policy if exists "editar o meu perfil" on public.members;
create policy "editar o meu perfil" on public.members for update using (user_id = auth.uid());
drop policy if exists "sair da casa" on public.members;
create policy "sair da casa" on public.members for delete using (user_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['products', 'shopping_items', 'recipes', 'meal_plan', 'prices', 'events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "membros da casa" on public.%I', t);
    execute format('create policy "membros da casa" on public.%I for all
                      using (public.is_member(household_id)) with check (public.is_member(household_id))', t);
  end loop;
end $$;

-- ---------- Tempo real: todos na casa veem as alterações na hora ----------
do $$
declare t text;
begin
  foreach t in array array['products', 'shopping_items', 'recipes', 'meal_plan', 'prices', 'events', 'members'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
