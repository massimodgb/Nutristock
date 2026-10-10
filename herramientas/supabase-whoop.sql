-- NutriStock · Whoop: dónde guarda la nube tus llaves de Whoop (pegar en SQL Editor → Run).
-- Solo la función "whoop" del servidor puede leerlas: la app y cualquier otra persona, no.
create table if not exists public.whoop_tokens (
  user_id uuid primary key references auth.users on delete cascade,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz not null,
  scope text,
  actualizado timestamptz not null default now()
);
create table if not exists public.whoop_estados (
  state text primary key,
  user_id uuid not null references auth.users on delete cascade,
  creado timestamptz not null default now()
);
alter table public.whoop_tokens enable row level security;
alter table public.whoop_estados enable row level security;
revoke all on public.whoop_tokens from anon, authenticated;
revoke all on public.whoop_estados from anon, authenticated;
