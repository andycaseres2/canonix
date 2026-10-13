-- =========================================================
-- Rutas de lectura: esquema, seguridad (RLS) y funciones
-- Ejecútalo completo en Supabase > SQL Editor
-- =========================================================

create extension if not exists pgcrypto;

-- ---------- Perfiles (uno por usuario de Auth) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  role text not null default 'user' check (role in ('user','admin')),
  plan text not null default 'free' check (plan in ('free','premium')),
  created_at timestamptz not null default now()
);

-- Crea el perfil automáticamente al registrarse
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)));
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ¿El usuario actual es admin?
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Un usuario normal no puede cambiarse el rol ni el plan
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() and auth.uid() is not null then
    if new.role is distinct from old.role or new.plan is distinct from old.plan or new.email is distinct from old.email then
      raise exception 'No autorizado para cambiar rol, plan o correo';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists guard_profile on public.profiles;
create trigger guard_profile before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------- Catálogo ----------
-- Un título del catálogo: un cómic (serie o arco) o un anime
create table if not exists public.media (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  kind text not null check (kind in ('comic','anime')),
  universe text,                 -- marvel, dc, anime...
  title text not null,
  credits text,                  -- autores, estudio, notas cortas
  year_label text,               -- "2000" o "2000–2009"
  year_start int,
  description text,
  search_hint text,              -- cómo buscarlo en la plataforma
  cover_url text,                -- portada (link externo, opcional)
  where_label text,              -- Marvel Unlimited, Crunchyroll...
  where_url text,
  created_at timestamptz not null default now()
);

-- Unidad de lectura/visionado: un número de cómic o un episodio.
-- La etiqueta es única para que el mismo número cuente en todos los títulos que lo incluyen.
create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  label text unique not null
);

create table if not exists public.media_units (
  media_id uuid not null references public.media(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  group_name text,               -- "Ultimate Spider-Man #1–21", "Temporada 1"...
  short text not null,           -- lo que se ve en el botón: "5", "E12"...
  position int not null,
  primary key (media_id, unit_id)
);
create index if not exists media_units_pos on public.media_units(media_id, position);

-- ---------- Rutas ----------
create table if not exists public.routes (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  universe text not null,        -- marvel, dc, anime
  kind text not null default 'comic' check (kind in ('comic','anime','mixed')),
  description text,
  published boolean not null default false,
  requires_plan text not null default 'free' check (requires_plan in ('free','premium')),
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.route_items (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes(id) on delete cascade,
  media_id uuid not null references public.media(id) on delete cascade,
  section text,                  -- "Años 60", "Extra: Spider-Man"...
  note text,
  position int not null,
  unique (route_id, media_id)
);
create index if not exists route_items_pos on public.route_items(route_id, position);

-- ---------- Progreso por usuario ----------
create table if not exists public.progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, unit_id)
);
create index if not exists progress_user_date on public.progress(user_id, completed_at desc);

-- ---------- Seguridad (RLS) ----------
alter table public.profiles enable row level security;
alter table public.media enable row level security;
alter table public.units enable row level security;
alter table public.media_units enable row level security;
alter table public.routes enable row level security;
alter table public.route_items enable row level security;
alter table public.progress enable row level security;

-- Perfiles: cada quien ve y edita el suyo; el admin ve y edita todos
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update using (id = auth.uid() or public.is_admin());

-- Catálogo: lectura pública, escritura solo admin
do $$
declare t text;
begin
  foreach t in array array['media','units','media_units','route_items'] loop
    execute format('drop policy if exists %1$s_read on public.%1$s', t);
    execute format('create policy %1$s_read on public.%1$s for select using (true)', t);
    execute format('drop policy if exists %1$s_admin on public.%1$s', t);
    execute format('create policy %1$s_admin on public.%1$s for all using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- Rutas: se ven las publicadas; el admin ve todas
drop policy if exists routes_read on public.routes;
create policy routes_read on public.routes for select using (published or public.is_admin());
drop policy if exists routes_admin on public.routes;
create policy routes_admin on public.routes for all using (public.is_admin()) with check (public.is_admin());

-- Progreso: cada quien el suyo; el admin puede leer todo (para estadísticas)
drop policy if exists progress_select on public.progress;
create policy progress_select on public.progress for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists progress_insert on public.progress;
create policy progress_insert on public.progress for insert with check (user_id = auth.uid());
drop policy if exists progress_delete on public.progress;
create policy progress_delete on public.progress for delete using (user_id = auth.uid());

-- ---------- Resumen de rutas publicadas ----------
-- Títulos e ids de números por ruta en una sola llamada (evita una consulta por ruta).
-- Es security definer para dar el conteo de las rutas premium sin exponer sus ítems.
create or replace function public.route_unit_map()
returns table (route_id uuid, item_count bigint, unit_ids uuid[])
language sql stable security definer set search_path = public as $$
  select r.id,
    (select count(*) from public.route_items ri where ri.route_id = r.id),
    coalesce((
      select array_agg(distinct mu.unit_id)
      from public.route_items ri join public.media_units mu on mu.media_id = ri.media_id
      where ri.route_id = r.id
    ), '{}')
  from public.routes r
  where r.published;
$$;

-- ---------- Vista de estadísticas para el admin ----------
create or replace function public.admin_user_stats()
returns table (user_id uuid, units_done bigint, last_activity timestamptz)
language sql stable security definer set search_path = public as $$
  select p.user_id, count(*), max(p.completed_at)
  from public.progress p
  where public.is_admin()
  group by p.user_id;
$$;
