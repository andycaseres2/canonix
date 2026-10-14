-- =========================================================
-- Rutas de lectura: Storage (portadas y archivos de cada número/episodio)
-- Ejecútalo después de 01_schema.sql, en Supabase > SQL Editor (se puede volver a correr)
-- =========================================================

-- covers: público, solo imágenes de hasta 5 MB
-- content: privado; se lee con URLs firmadas. El tamaño máximo por archivo lo pone tu plan de Supabase.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('covers', 'covers', true, 5242880, array['image/*']),
  ('content', 'content', false, null, null)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Solo los admins suben, cambian o borran archivos en estos buckets.
-- Las portadas se ven por su URL pública; el contenido, por URLs firmadas de corta duración.
drop policy if exists rutas_storage_admin on storage.objects;
create policy rutas_storage_admin on storage.objects for all to authenticated
  using (bucket_id in ('covers', 'content') and public.is_admin())
  with check (bucket_id in ('covers', 'content') and public.is_admin());

-- Lectores: pueden firmar (leer) un archivo de content si su plan alcanza para el título.
drop policy if exists rutas_content_read on storage.objects;
create policy rutas_content_read on storage.objects for select to authenticated
  using (bucket_id = 'content' and public.can_read_unit_file(name));
