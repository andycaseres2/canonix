# Canonix

Rutas de lectura de cómics y mangas.

App para seguir rutas de lectura de cómics (Marvel, DC…) y mangas, con login y progreso por usuario.

**Stack:** Astro 7 (SSR) + Supabase (Postgres, Auth, RLS) + Vercel.

## Qué incluye

- **Títulos por episodios o por tomos:** cada cómic o manga dice si viene en episodios (`"Batman #404"`) o en tomos (`"Berserk - Tomo 3"`). Si cambias un título de uno a otro, sus entregas se renombran al nuevo formato para que lo que subas después se sume a las que ya están.
- **Rutas:** listas ordenadas por secciones; cada título se despliega en sus episodios o tomos para marcarlos uno por uno. Arriba siempre dice qué te toca.
- **Catálogo** de cómics y mangas con buscador, y su página individual con la lista de episodios o tomos.
- **Lector** (`/leer/<título>/<número>`): abre cómics y mangas página por página, con teclado, toques, zoom, ajuste al ancho y pantalla completa. Recuerda la página en la que quedaste y, al pasar al siguiente, marca el actual como leído.
- **Login** con correo y contraseña de Supabase. Cada persona tiene su progreso y su historial con fechas.
- **Panel de admin** (`/admin`): crear, editar y borrar títulos, subir sus episodios o tomos (CBZ, CBR o PDF, un archivo por entrega), armar y ordenar rutas, publicar o despublicar, y gestionar usuarios (rol, plan, bloquear, borrar).
- **Listo para cobrar después:** cada usuario tiene `plan` (free/premium). Cada título tiene **Acceso** gratis o premium: sus archivos los abre cualquier usuario con cuenta o solo los premium. Cada ruta también tiene `requires_plan` y una ruta premium solo la ven usuarios premium y admins.
- **Ruta Marvel esencial precargada:** 62 títulos y 1.476 números.

### Subidas por páginas

Los archivos se guardan en el bucket privado `content` de Supabase Storage. El navegador del admin abre cada archivo y lo sube como **una imagen por página**: los CBZ y CBR sin recomprimir, y los PDF convertidos a JPEG. Así el lector muestra la primera página al instante y solo baja lo que se lee. Si una subida falla a la mitad, las páginas que alcanzaron a subir se borran.

El lector recibe los links firmados (de 3 horas) de a tandas de 20 páginas y pide la siguiente tanda antes de llegar a ella, así un tomo de 2000 páginas no carga todos sus links de una vez. Si un link vence con la pestaña abierta, pide uno nuevo y sigue sin recargar. Las entregas subidas antes como un único CBZ o PDF se siguen abriendo (el PDF por partes, con rangos HTTP); si las vuelves a subir, pasan a páginas.

## Tests

```bash
pnpm test    # vitest (usa una base en memoria en src/test/mock, no necesita Supabase)
pnpm check   # tipos de Astro
```

El CI (`.github/workflows/ci.yml`) corre ambos en cada push a `main` y en cada PR.

## Puesta en marcha

1. **Crea un proyecto en Supabase.**
2. En **SQL Editor** (*SQL Editor → New query*, pega el archivo y pulsa *Run*), ejecuta en orden:
   - `supabase/01_schema.sql` (tablas, seguridad y funciones)
   - `supabase/02_seed_marvel.sql` (la ruta Marvel)
   - `supabase/03_storage.sql` (buckets para portadas y archivos, quién puede subir y quién puede leer)

   Los scripts `01` y `03` se pueden volver a correr: si actualizas la app, ejecútalos de nuevo **antes** de desplegar el código nuevo para aplicar los cambios (por ejemplo, los mangas y los tomos). No vuelvas a correr `02` si ya tienes tus propios datos.
3. **Variables de entorno:** copia `.env.example` a `.env` y llena los datos desde *Project Settings → API*.
4. **Corre el proyecto:**
   ```bash
   pnpm install
   pnpm dev
   ```
   Abre http://localhost:4321
5. **Regístrate** en `/registro` y vuélvete admin en el SQL Editor:
   ```sql
   update public.profiles set role = 'admin' where email = 'tu@correo.com';
   ```
6. En **Authentication → URL Configuration**, pon tu dominio como *Site URL*. Para probar más rápido puedes desactivar *Confirm email* en *Authentication → Providers → Email*.

## Empezar de cero

Para vaciar el contenido (catálogo, episodios o tomos, rutas, etapas y progreso) conservando las cuentas y los roles, ejecuta `supabase/90_reset_contenido.sql` en el SQL Editor. No se puede deshacer. Los archivos subidos se vacían aparte, en Storage → `covers` y `content` → *Empty bucket*. No vuelvas a correr `02_seed_marvel.sql` si quieres la base vacía.

## Desplegar en Vercel

```bash
pnpm dlx vercel
```
Agrega las tres variables de `.env` en el proyecto de Vercel y actualiza la *Site URL* de Supabase con el dominio final.

## Estructura

```
supabase/              SQL del esquema y la ruta Marvel
src/middleware.ts      Sesión, perfil, protección de /admin y /perfil, y origen de los pedidos a /api
src/lib/               Cliente Supabase, consultas y utilidades
src/features/          Componentes por pantalla (rutas, catálogo, lector, admin…)
src/components/        Piezas compartidas de la interfaz
src/pages/             Páginas públicas, /admin y /api
src/test/mock/         Supabase en memoria para los tests
```

## Cómo agregar una ruta nueva (DC, manga…)

1. **Admin → Catálogo → Nuevo título**: tipo (cómic o manga), si viene en episodios o tomos, nombre y datos, portada y sus archivos (un archivo por episodio o tomo), todo en una pantalla.
2. **Admin → Rutas → Crear ruta** con nombre y descripción.
3. En la ruta, **crea sus etapas** (título y descripción, por ejemplo "Años 60") y **agrega a cada etapa** sus cómics o mangas buscándolos. Ordénalos con ↑ ↓.
4. Marca la ruta como **Publicada** (y **Premium** si es del plan pago). El universo y el tipo de la ruta se calculan solos.

Si un mismo episodio aparece en dos títulos (por ejemplo un arco dentro de una serie larga), es la misma unidad, así que marcarlo en uno lo marca en el otro.

## Seguridad

- **RLS activado** en todas las tablas: el catálogo es de lectura pública y solo los admins escriben. Cada usuario solo ve y modifica su propio progreso.
- **Candado premium en la base:** los ítems de una ruta premium o en borrador solo se pueden leer si eres premium o admin (`can_read_route`), así que no se filtran por la API pública de Supabase. Los conteos de las tarjetas salen de la función `route_unit_map()`.
- **Archivos según el plan, en la base:** la política `rutas_content_read` de Storage solo deja firmar un archivo de `content` (o una de las páginas listadas de un cómic) a usuarios con cuenta cuyo plan alcanza para el título (`can_read_unit_file`), o a admins. La página del lector chequea lo mismo, pero la base tiene la última palabra.
- **Pedidos de otros sitios:** el middleware rechaza con 403 cualquier escritura a `/api` cuyo `Origin` no sea el del sitio, y los JSON sin `Origin`. Después del login solo se redirige a rutas del mismo sitio.
- **Rol y plan protegidos:** un usuario no puede cambiarse el rol ni el plan, porque hay un trigger en la base que lo impide.
- **`SUPABASE_SERVICE_ROLE_KEY`** solo se usa en el servidor, para bloquear o borrar usuarios desde el panel.
