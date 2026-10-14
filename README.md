# Canonix

Rutas de lectura de cómics, manga y anime.

App para seguir rutas de lectura de cómics (Marvel, DC…) y guías de anime, con login y progreso por usuario.

**Stack:** Astro 7 (SSR) + Supabase (Postgres, Auth, RLS) + Vercel.

## Qué incluye

- **Rutas:** listas ordenadas por secciones; cada título se despliega en sus números o episodios para marcarlos uno por uno. Arriba siempre dice qué te toca.
- **Catálogo** de cómics y animes con buscador, y su página individual con la lista de números o episodios.
- **Lector** (`/leer/<título>/<número>`): abre los cómics (CBZ o PDF) página por página, con teclado, toques, ajuste al ancho y pantalla completa, y los episodios en un reproductor de video. Recuerda la página en la que quedaste.
- **Login** con correo y contraseña de Supabase. Cada persona tiene su progreso y su historial con fechas.
- **Panel de admin** (`/admin`): crear y editar títulos, subir sus números (CBZ, CBR o PDF) o episodios (MP4, WEBM o MKV), armar y ordenar rutas, publicar o despublicar, y gestionar usuarios (rol, plan, bloquear, borrar).
- **Listo para cobrar después:** cada usuario tiene `plan` (free/premium). Cada título tiene **Acceso** gratis o premium: sus archivos los abre cualquier usuario con cuenta o solo los premium. Cada ruta también tiene `requires_plan` y una ruta premium solo la ven usuarios premium y admins.
- **Ruta Marvel esencial precargada:** 62 títulos y 1.476 números.

Los archivos se guardan en el bucket privado `content` de Supabase Storage y se abren con links firmados de 3 horas. Los cómics CBZ o CBR se abren en el navegador del admin y se suben como **una imagen por página** (sin recomprimir), así el lector muestra la primera página al instante y solo baja lo que se lee. Los PDF se leen por partes (rangos HTTP) y los videos en streaming. Los números subidos antes como un único CBZ se siguen abriendo; si los vuelves a subir, pasan a páginas.

## Tests

```bash
pnpm test    # vitest (usa una base en memoria en src/test/mock, no necesita Supabase)
pnpm check   # tipos de Astro
```

El CI (`.github/workflows/ci.yml`) corre ambos en cada push a `main` y en cada PR.

## Puesta en marcha

1. **Crea un proyecto en Supabase.**
2. En **SQL Editor**, ejecuta en orden:
   - `supabase/01_schema.sql` (tablas, seguridad y funciones)
   - `supabase/02_seed_marvel.sql` (la ruta Marvel)
   - `supabase/03_storage.sql` (buckets para portadas y archivos, quién puede subir y quién puede leer)

   Los scripts `01` y `03` se pueden volver a correr: si actualizas la app, ejecútalos de nuevo para aplicar los cambios (por ejemplo, el acceso por título del lector). No vuelvas a correr `02` si ya tienes tus propios datos.
3. **Variables de entorno:** copia `.env.example` a `.env` y llena los datos desde *Project Settings → API*.
4. **Corre el proyecto:**
   ```bash
   npm install
   npm run dev
   ```
   Abre http://localhost:4321
5. **Regístrate** en `/registro` y vuélvete admin en el SQL Editor:
   ```sql
   update public.profiles set role = 'admin' where email = 'tu@correo.com';
   ```
6. En **Authentication → URL Configuration**, pon tu dominio como *Site URL*. Para probar más rápido puedes desactivar *Confirm email* en *Authentication → Providers → Email*.

## Empezar de cero

Para vaciar el contenido (catálogo, números o episodios, rutas, etapas y progreso) conservando las cuentas y los roles, ejecuta `supabase/90_reset_contenido.sql` en el SQL Editor. No se puede deshacer. Los archivos subidos se vacían aparte, en Storage → `covers` y `content` → *Empty bucket*. No vuelvas a correr `02_seed_marvel.sql` si quieres la base vacía.

## Desplegar en Vercel

```bash
npx vercel
```
Agrega las tres variables de `.env` en el proyecto de Vercel y actualiza la *Site URL* de Supabase con el dominio final.

## Estructura

```
supabase/              SQL del esquema y la ruta Marvel
src/middleware.ts      Sesión, perfil y protección de /admin y /perfil
src/lib/               Cliente Supabase, consultas y utilidades
src/components/        Tracker (marcar números) y menú admin
src/pages/             Páginas públicas, /admin y /api
```

## Cómo agregar una ruta nueva (DC, anime…)

1. **Admin → Catálogo → Nuevo cómic o anime**: tipo, nombre y datos, portada y sus archivos (un archivo por número o episodio), todo en una pantalla.
2. **Admin → Rutas → Crear ruta** con nombre y descripción.
3. En la ruta, **crea sus etapas** (título y descripción, por ejemplo "Años 60") y **agrega a cada etapa** sus cómics o animes buscándolos. Ordénalos con ↑ ↓.
4. Marca la ruta como **Publicada** (y **Premium** si es del plan pago). El universo y el tipo de la ruta se calculan solos.

Si un mismo número aparece en dos títulos (por ejemplo un arco dentro de una serie larga), es la misma unidad, así que marcarlo en uno lo marca en el otro.

## Seguridad

- **RLS activado** en todas las tablas: el catálogo es de lectura pública y solo los admins escriben. Cada usuario solo ve y modifica su propio progreso.
- **Candado premium en la base:** los ítems de una ruta premium o en borrador solo se pueden leer si eres premium o admin (`can_read_route`), así que no se filtran por la API pública de Supabase. Los conteos de las tarjetas salen de la función `route_unit_map()`.
- **Archivos según el plan, en la base:** la política `rutas_content_read` de Storage solo deja firmar un archivo de `content` (o una de las páginas listadas de un cómic) a usuarios con cuenta cuyo plan alcanza para el título (`can_read_unit_file`), o a admins. La página del lector chequea lo mismo, pero la base tiene la última palabra.
- **Rol y plan protegidos:** un usuario no puede cambiarse el rol ni el plan, porque hay un trigger en la base que lo impide.
- **`SUPABASE_SERVICE_ROLE_KEY`** solo se usa en el servidor, para bloquear o borrar usuarios desde el panel.
