# Security fixes, upload cleanup, on-demand reader links, unit type switch, repo cleanup

Objective: close the two security gaps and the pending improvements listed to the user on 2026-10-14 (items 5–10).
Branch: `feat/improvements` (continues after 8bc680b). Delivery: single-pr. Runner: `pnpm vitest run` + `pnpm astro check`.

## Specs

- **S1 — Open redirect in login.** Pending item: "El login puede redirigir a otro sitio con un link armado tipo `/\evil.com`."
  - `safeNext` (src/pages/api/auth/login.ts and any other user of it) accepts only same-site paths.
  - It rejects `//host`, `/\host`, any backslash, schemes and control characters (tab, CR, LF), whether raw or percent-encoded. Anything rejected falls back to the current default.
- **S2 — CSRF on JSON endpoints.** Pending item: "`/api/progress` no revisa desde qué sitio viene el pedido (CSRF)."
  - Astro `security.checkOrigin: true` only covers form content types, so JSON POSTs are not covered.
  - Every non-GET/HEAD request to `/api/*` whose `Origin` header is present and differs from the site's own origin is refused with 403. This applies to all content types and is done in the middleware.
  - Assumption: a request with no `Origin` header is refused too for `application/json` bodies, since browsers always send Origin on cross-site and same-site fetch POSTs. Form posts keep Astro's own check.
- **S3 — Orphan pages after a failed upload.** Pending item: "Si una subida falla a la mitad, las páginas que alcanzaron a subir quedan huérfanas en el storage."
  - When a page upload fails after signing, the uploader asks the server to discard that folder.
  - The server deletes the folder's objects only when it is the title's own upload prefix (the same regex `episodes.ts` uses) and no unit references it.
  - Assumption: no background sweep of older orphans; best effort at failure time only.
- **S4 — Reader links expire after 3 h.** Pending item: "Los links de lectura vencen a las 3 horas y hay que recargar."
  - When a page, PDF or video link has expired, the reader gets fresh signed links from the server and retries, without a reload. The same access checks as `getReader` apply (login, premium, storage RLS).
- **S5 — Big volumes inline every signed link.** Pending item: "Un tomo de 2000 páginas mete todos los links firmados en la página; conviene pedirlos de a tandas."
  - The reader page ships the page count, not every signed URL.
  - The viewer asks a JSON endpoint for signed URLs in batches around the current page (for example 20 at a time, ahead of the reader), and S4 reuses the same endpoint.
  - The endpoint checks access exactly like `getReader` and never signs a page of a title the viewer cannot read.
- **S6 — Switching a title between episodes and volumes.** Pending item: "Si pasás un título de episodios a tomos, lo nuevo que subas queda separado de lo viejo ("Tomo N" al lado de "#N")."
  - When `unit_type` changes on edit, the title's units whose labels follow the old format are relabelled to the new one (`"X #N"` ↔ `"X - Tomo N"`), so later uploads find them.
  - Labels are unique: a unit whose new label already exists is skipped, and the success message says how many were skipped.
- **S7 — Repo cleanup.** Pending item: "el README todavía habla de anime; hay un `package-lock.json` viejo que sobra; nunca revisamos si el CI de GitHub pasa."
  - The README describes comics and mangas, episodes or volumes, the paged uploads (CBZ/CBR/PDF), and how to run the SQL.
  - `package-lock.json` is removed (the project uses pnpm).
  - The commands in `.github/workflows/ci.yml` run locally and pass, or the workflow is fixed so they do.

## Tasks

- [x] T1 — S1 + S2 security. Route: delegated writer (context backstop). Commit: `fix(security): same-site login redirects and an origin guard for API writes` eeeeb2d. RED: `src/lib/request-guards.test.ts` (module missing) and 2 of 5 in `src/middleware.test.ts` (cross-origin and no-Origin JSON POST got 200); GREEN: 219/219, astro check 0 errors.
- [x] T2 — S3 orphan cleanup. Route: delegated, same writer. Commit: `fix(uploads): discard the pages of a page upload that failed halfway` d3e63e8. RED: 5 of 6 `discard_folder` tests in `src/lib/episodes.test.ts` failed ('Acción desconocida.'); GREEN: 225/225, astro check 0 errors.
- [x] T3 — S4 + S5 reader signed URLs on demand. Route: delegated, same writer. Commit: `feat(reader): sign pages in batches and refresh expired links` 9a6fb79. RED: `src/lib/reader-endpoint.test.ts` (endpoint missing) and 2 `getReader (paged comics)` tests (no `pageCount`, every page signed); GREEN: 237/237, astro check 0 errors. No browser check (it would need the remote Supabase).
- [x] T4 — S6 relabel on unit_type change. Route: delegated, same writer. Commit: `feat(admin): relabel a title's units when it switches between episodes and volumes` fef258e. RED: 4 tests in `src/lib/titles.test.ts` (3 new relabel tests plus the updated 'Guardado. 2 tomos renombrados.' expectation) failed; GREEN: 242/242, astro check 0 errors.
- [x] T5 — S7 README, lockfile, CI. Route: delegated, same writer. Commit: `docs: describe comics and mangas, drop the npm lockfile` 69e5f84. No RED (docs and lockfile only). CI commands on a clean `git archive` copy: `pnpm install --frozen-lockfile --offline` OK, `pnpm check` 0 errors, `pnpm test` 242/242; `ci.yml` unchanged.
- [ ] T6 — Independent verification (high risk: auth redirect, CSRF guard, storage deletes, reader access). Route: delegated verifier.

## Log

- L1 (2026-10-14, user): "aregla todas las mejoras pendientes y el punto 5 de seguridad". This refers to the list given to the user: 5 (security), 6 (orphan pages), 7 (3 h links), 8 (2000-page signing), 9 (episodes→tomos switch), 10 (README, package-lock, CI).
- L2: `astro.config.mjs:8` already has `security: { checkOrigin: true }`, which does not cover JSON bodies. CI lives in `.github/workflows/ci.yml`.
- L3 (T1): `safeNext` and `isForeignWrite` live in `src/lib/request-guards.ts`. `safeNext` decodes up to 5 times and rejects `//`, backslashes, control characters, non-`/` starts and malformed encodings, then checks the URL resolves to the same origin; the only caller is `src/pages/api/auth/login.ts`. The middleware refuses with 403 any non-GET/HEAD `/api/*` request with a foreign Origin, or a JSON body with no Origin, before creating the Supabase client. `src/middleware.test.ts` mocks `astro:middleware` and `./lib/supabase` to run the real middleware.
- L4 (T2): `POST /api/admin/episodes` gained `action: 'discard_folder'` (`media_id`, `number`, `folder`). The folder must match `ownPrefix(media, number)` plus `/` ('Carpeta no válida.', 400); a unit whose `file_path` equals it gives 409 'Esa carpeta está en uso.'; otherwise every listed object is removed and the reply is `{ ok: true, removed: n }`. The uploader stops starting pages after a failure, waits for the in-flight ones, then posts `discard_folder` (also when `complete` fails) and still shows the original error.
- L5 (T3): `src/lib/reader.ts` now splits `getReaderAccess` (access decision, no signing), `signPages`, `signFile` and `readerViewer`; `getReader` ships `pageCount` and only the first `PAGE_BATCH` (20) signed pages. `GET /api/reader/[slug]/[n]` (`src/pages/api/reader/[slug]/[n].ts`) reuses the access decision: 401 'Inicia sesión.', 403 'Este título es premium.', 404 'No encontrado.', 400 'Página fuera de rango.', 502 'No se pudieron preparar los enlaces.'; `?from=&count=` (count capped at 50) for paged units, `{ url }` for single files; every reply sends `Cache-Control: private, no-store`. The viewer fetches batch-aligned links, prefetches the next batch from mid-batch, re-signs a failing page's batch once and retries; PDFs reopen with a fresh link when a page fails (and on open); the old single CBZ download retries once with a fresh link; the video swaps `src` on `error` and restores `currentTime` (at most once a minute).
- L6 (T4): `parseUnitLabel` in `src/lib/uploads.ts` reads back `"X #N"` / `"X - Tomo N"` and now also feeds the admin page's `seriesGuess`. The `update` action of `src/pages/api/admin/media.ts` reads the old `unit_type`; when it changes, `relabelUnits` renames the title's units in the old format with `unitLabel`. It skips units whose new label exists and, as an assumption, units another title also links (renaming them would change that title's labels too). Message: `Guardado. 2 tomos renombrados. 1 no se renombró porque ya existe una entrega con ese nombre. 1 se dejó igual porque también está en otro título.` (each part only when non-zero). No SQL needed.
- L7 (T5): The README now covers comics and mangas, episodes or volumes and the relabel, the page-by-page uploads (CBZ/CBR as-is, PDF to JPEG), batched reader links, how to run the SQL (before deploying), pnpm commands and the origin guard. `package-lock.json` was removed. The CI steps pass locally with pnpm 12.3.4 and Node 22, so the workflow was left as is. Whether GitHub Actions itself passes was not checked (no GitHub API).
