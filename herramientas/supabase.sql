-- NutriStock: preparar la nube (pegar entero en Supabase → SQL Editor → Run). Se puede ejecutar más de una vez.
-- Una sola tabla con una fila por cada cosa de la app. Cada persona solo puede ver y cambiar SUS filas.
-- No hay permiso para borrar filas: en la app, borrar solo las marca como "borrado" (siempre recuperable).

create table if not exists public.registros (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  tabla text not null,
  clave text not null,
  datos jsonb,
  borrado boolean not null default false,
  actualizado timestamptz not null default now(),
  primary key (user_id, tabla, clave)
);
create index if not exists registros_actualizado on public.registros (user_id, actualizado);

alter table public.registros enable row level security;

drop policy if exists "ver mis datos" on public.registros;
drop policy if exists "crear mis datos" on public.registros;
drop policy if exists "cambiar mis datos" on public.registros;
create policy "ver mis datos" on public.registros for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "crear mis datos" on public.registros for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "cambiar mis datos" on public.registros for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.registros from anon;
grant select, insert, update on public.registros to authenticated;

-- La hora de cada cambio la pone el servidor (así no importa la hora del móvil)
create or replace function public.registros_hora() returns trigger
  language plpgsql set search_path = '' as $$
begin
  new.actualizado := now();
  return new;
end $$;
drop trigger if exists registros_hora on public.registros;
create trigger registros_hora before insert or update on public.registros
  for each row execute function public.registros_hora();
