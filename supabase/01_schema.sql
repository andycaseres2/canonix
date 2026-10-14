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
-- Quién puede leer los archivos del título: 'free' cualquier usuario con cuenta, 'premium' solo premium
alter table public.media add column if not exists requires_plan text not null default 'free' check (requires_plan in ('free','premium'));

-- Unidad de lectura/visionado: un número de cómic o un episodio.
-- La etiqueta es única para que el mismo número cuente en todos los títulos que lo incluyen.
create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  label text unique not null
);
-- Archivo del número o episodio en Storage (bucket "content"), si ya se subió
alter table public.units add column if not exists file_path text;
alter table public.units add column if not exists file_format text;
alter table public.units add column if not exists file_size bigint;
create index if not exists units_file_path_idx on public.units (file_path);

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

-- Etapas de una ruta ("Años 60", "Extra: Spider-Man"...), con título y descripción
create table if not exists public.route_sections (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes(id) on delete cascade,
  title text not null,
  description text,
  position int not null
);
create index if not exists route_sections_pos on public.route_sections(route_id, position);

create table if not exists public.route_items (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes(id) on delete cascade,
  section_id uuid references public.route_sections(id) on delete cascade,
  media_id uuid not null references public.media(id) on delete cascade,
  note text,
  position int not null,       -- orden dentro de la ruta; se lee por etapa y luego por posición
  unique (route_id, media_id)
);
create index if not exists route_items_pos on public.route_items(route_id, position);

-- Migración: antes la etapa era un texto en cada ítem (columna "section").
-- Crea una etapa por cada tramo seguido con el mismo texto (así el orden de lectura no cambia
-- aunque un texto se repita más adelante) y luego quita la columna.
alter table public.route_items add column if not exists section_id uuid references public.route_sections(id) on delete cascade;
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'route_items' and column_name = 'section') then
    with runs as (
      select id, route_id, coalesce(section, 'General') as title, position,
        row_number() over (partition by route_id order by position)
          - row_number() over (partition by route_id, coalesce(section, 'General') order by position) as run
      from public.route_items
    ), stages as (
      select route_id, title, run, row_number() over (partition by route_id order by min(position)) as stage_pos
      from runs group by route_id, title, run
    ), created as (
      insert into public.route_sections (route_id, title, position)
      select route_id, title, stage_pos from stages
      returning id, route_id, position
    )
    update public.route_items ri set section_id = c.id
      from runs r
      join stages s on s.route_id = r.route_id and s.title = r.title and s.run = r.run
      join created c on c.route_id = s.route_id and c.position = s.stage_pos
      where ri.id = r.id;
    alter table public.route_items drop column section;
  end if;
end $$;
alter table public.route_items alter column section_id set not null;
create index if not exists route_items_section on public.route_items(section_id, position);

-- ---------- Progreso por usuario ----------
create table if not exists public.progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, unit_id)
);
create index if not exists progress_user_date on public.progress(user_id, completed_at desc);

-- Rutas que cada usuario inició (aparecen en "Mi progreso")
create table if not exists public.user_routes (
  user_id uuid not null references auth.users(id) on delete cascade,
  route_id uuid not null references public.routes(id) on delete cascade,
  started_at timestamptz not null default now(),
  primary key (user_id, route_id)
);

-- ---------- Seguridad (RLS) ----------
alter table public.profiles enable row level security;
alter table public.media enable row level security;
alter table public.units enable row level security;
alter table public.media_units enable row level security;
alter table public.routes enable row level security;
alter table public.route_sections enable row level security;
alter table public.route_items enable row level security;
alter table public.progress enable row level security;
alter table public.user_routes enable row level security;

-- Perfiles: cada quien ve y edita el suyo; el admin ve y edita todos
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update using (id = auth.uid() or public.is_admin());

-- Catálogo: lectura pública, escritura solo admin
do $$
declare t text;
begin
  foreach t in array array['media','units','media_units'] loop
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

-- ¿Puede el usuario actual ver el contenido de la ruta? Publicada y dentro de su plan, o admin.
create or replace function public.can_read_route(rid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.routes r
    where r.id = rid and r.published
      and (r.requires_plan = 'free'
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.plan = 'premium'))
  );
$$;

-- ¿Puede el usuario actual leer este archivo del bucket content? Con cuenta y dentro del plan
-- de algún título que incluya el número, o admin. Lo usa la política de lectura de Storage.
create or replace function public.can_read_unit_file(path text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or (auth.uid() is not null and exists (
    select 1 from public.units u
    join public.media_units mu on mu.unit_id = u.id
    join public.media m on m.id = mu.media_id
    where u.file_path = path
      and (m.requires_plan = 'free'
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.plan = 'premium'))
  ));
$$;
-- Solo la usa la política de Storage para usuarios con sesión
revoke execute on function public.can_read_unit_file(text) from public, anon;
grant execute on function public.can_read_unit_file(text) to authenticated;

-- Ítems de ruta: el candado premium vive aquí, no solo en la página
drop policy if exists route_items_read on public.route_items;
create policy route_items_read on public.route_items for select using (public.can_read_route(route_id));
drop policy if exists route_items_admin on public.route_items;
create policy route_items_admin on public.route_items for all using (public.is_admin()) with check (public.is_admin());

-- Etapas: mismo candado que los ítems
drop policy if exists route_sections_read on public.route_sections;
create policy route_sections_read on public.route_sections for select using (public.can_read_route(route_id));
drop policy if exists route_sections_admin on public.route_sections;
create policy route_sections_admin on public.route_sections for all using (public.is_admin()) with check (public.is_admin());

-- Progreso: cada quien el suyo; el admin puede leer todo (para estadísticas)
drop policy if exists progress_select on public.progress;
create policy progress_select on public.progress for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists progress_insert on public.progress;
create policy progress_insert on public.progress for insert with check (user_id = auth.uid());
drop policy if exists progress_delete on public.progress;
create policy progress_delete on public.progress for delete using (user_id = auth.uid());

-- Rutas iniciadas: cada quien las suyas; solo puede iniciar rutas que puede leer
drop policy if exists user_routes_select on public.user_routes;
create policy user_routes_select on public.user_routes for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists user_routes_insert on public.user_routes;
create policy user_routes_insert on public.user_routes for insert with check (user_id = auth.uid() and public.can_read_route(route_id));
drop policy if exists user_routes_delete on public.user_routes;
create policy user_routes_delete on public.user_routes for delete using (user_id = auth.uid());

-- ---------- Resumen de rutas publicadas ----------
-- Títulos e ids de números por ruta en una sola llamada (evita una consulta por ruta).
-- Es security definer para dar el conteo de las rutas premium; los ids de sus números
-- solo salen si el usuario puede leer la ruta (si no, revelarían qué títulos tiene).
drop function if exists public.route_unit_map();
create function public.route_unit_map()
returns table (route_id uuid, item_count bigint, unit_count bigint, unit_ids uuid[])
language sql stable security definer set search_path = public as $$
  select r.id,
    (select count(*) from public.route_items ri where ri.route_id = r.id),
    (select count(distinct mu.unit_id)
      from public.route_items ri join public.media_units mu on mu.media_id = ri.media_id
      where ri.route_id = r.id),
    case when public.can_read_route(r.id) then coalesce((
      select array_agg(distinct mu.unit_id)
      from public.route_items ri join public.media_units mu on mu.media_id = ri.media_id
      where ri.route_id = r.id
    ), '{}') else '{}'::uuid[] end
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
