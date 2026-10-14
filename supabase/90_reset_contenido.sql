-- =========================================================
-- Canonix: vacía todo el contenido y conserva los usuarios
-- Borra catálogo, números/episodios, rutas, etapas, progreso y rutas iniciadas.
-- NO toca auth.users ni public.profiles (las cuentas y los roles se mantienen).
-- Ejecútalo en Supabase > SQL Editor. No se puede deshacer.
--
-- Los archivos subidos (portadas y episodios) se vacían aparte, desde
-- Storage > covers y Storage > content > "Empty bucket".
-- =========================================================

begin;

truncate table
  public.progress,
  public.user_routes,
  public.route_items,
  public.route_sections,
  public.routes,
  public.media_units,
  public.units,
  public.media;

commit;

-- Comprobación: todo en 0 salvo los perfiles
select
  (select count(*) from public.media)          as titulos,
  (select count(*) from public.units)          as numeros,
  (select count(*) from public.routes)         as rutas,
  (select count(*) from public.route_sections) as etapas,
  (select count(*) from public.progress)       as progreso,
  (select count(*) from public.profiles)       as perfiles_conservados;
