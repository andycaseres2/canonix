# Canonix

Rutas de lectura de cómics, manga y anime.

App para seguir rutas de lectura de cómics (Marvel, DC…) y guías de anime, con login y progreso por usuario.

**Stack:** Astro 7 (SSR) + Supabase (Postgres, Auth, RLS) + Vercel.

## Qué incluye

- **Rutas:** listas ordenadas por secciones; cada título se despliega en sus números o episodios para marcarlos uno por uno. Arriba siempre dice qué te toca.
- **Catálogo** de cómics y animes con buscador, y su página individual.
- **Login** con correo y contraseña de Supabase. Cada persona tiene su progreso y su historial con fechas.
- **Panel de admin** (`/admin`): crear y editar títulos, agregar números o episodios por rango, armar y ordenar rutas, publicar o despublicar, y gestionar usuarios (rol, plan, bloquear, borrar).
- **Listo para cobrar después:** cada usuario tiene `plan` (free/premium) y cada ruta `requires_plan`. Una ruta premium solo la ven usuarios premium y admins.
- **Ruta Marvel esencial precargada:** 62 títulos y 1.476 números.

La app guarda el **catálogo y el progreso**, no archivos de cómics ni episodios. Cada título tiene un botón "Dónde leer/ver" hacia la plataforma oficial.

## Modo demo (sin Supabase)

Para ver la web sin configurar Supabase, deja `USE_MOCK = true` en `src/lib/config.ts` y corre:

```bash
pnpm install
pnpm dev
```

La app usa una base de datos en memoria (`src/lib/mock/`) con las mismas tablas, llaves y reglas RLS que `supabase/01_schema.sql`. Trae la ruta Marvel, una ruta de anime premium y una ruta de DC en borrador. Cuentas de prueba, todas con la contraseña `demo1234`:

| Correo | Rol | Plan |
|---|---|---|
| `admin@demo.com` | admin | premium |
| `lector@demo.com` | usuario, con progreso | free |
| `premium@demo.com` | usuario | premium |

Los cambios se pierden al reiniciar el servidor. Para usar Supabase, pon `USE_MOCK = false` y sigue la puesta en marcha.

## Tests

```bash
pnpm test    # vitest
pnpm check   # tipos de Astro
```

El CI (`.github/workflows/ci.yml`) corre ambos en cada push a `main` y en cada PR.

## Puesta en marcha

1. **Crea un proyecto en Supabase.**
2. En **SQL Editor**, ejecuta en orden:
   - `supabase/01_schema.sql` (tablas, seguridad y funciones)
   - `supabase/02_seed_marvel.sql` (la ruta Marvel)
   - `supabase/03_storage.sql` (buckets para portadas y archivos, y quién puede subir)
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
- **Rol y plan protegidos:** un usuario no puede cambiarse el rol ni el plan, porque hay un trigger en la base que lo impide.
- **`SUPABASE_SERVICE_ROLE_KEY`** solo se usa en el servidor, para bloquear o borrar usuarios desde el panel.
