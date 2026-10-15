# Manga instead of anime, episodes vs volumes per title, delete a title

Objective: the "anime" kind becomes "manga" (same formats and paged reader as comics; video stays dormant for later), each title says whether it comes in episodes or volumes (tomos), and an admin can delete a whole title.
Branch: `feat/improvements` (from main 8606165). Delivery: single-pr. Runner: `pnpm vitest run` + `pnpm astro check`.

## Specs

- **S1 — Manga replaces anime.** User: "cuando hablamos de anime en realidad es manga podrias ajustar que reciba los mismo formatos y funcine igual que el comic el anime lo implementaremos mas adelante".
  - Kind values become `comic` | `manga` everywhere: DB check constraints (media and routes), types, forms, filters, badges, counters, catalog tabs, route kind derivation and copy.
  - Manga accepts exactly the comic formats (CBZ, CBR, PDF), is uploaded page by page like comics, and opens in the paged reader.
  - Existing rows: `media.kind = 'anime'` → `'manga'`; `routes.kind = 'anime'` → `'manga'`.
  - The video reader code (mp4/webm/mkv by file format) stays in place, unused, for a future anime kind. No UI offers anime.
  - Assumption: the SQL migration lives in `supabase/01_schema.sql`, re-runnable. The user runs it in the Supabase SQL Editor; the agent never runs SQL remotely.
- **S2 — Episodes or volumes per title.** User: "aveces los comics o animes vienen en tomos entonces no serian episodios sino necesitamos poder diferenciar entre episodios y tomos"; chosen option 1: "Por título".
  - New title field `unit_type`, either `episodio` (default) or `tomo`. It is set on create ("Viene en: Episodios / Tomos") and on edit (Datos).
  - Every per-title wording follows it: admin edit page heading, list and uploader ("Agregar tomos", "Tomos (12)", "un archivo por tomo"), new-title flow, public title page list, catalog card count, route tracker rows ("Ver tomos", read link), reader texts, and unit labels for new uploads.
  - Global counters that mix titles (profile stats, admin stats, home hero, history table) keep a neutral wording.
  - Assumption: labels are `"<Serie> #N"` for episodes (comic and manga alike) and `"<Serie> - Tomo N"` for volumes. Existing anime labels `"<Serie> - Episodio N"` are rewritten to `"<Serie> #N"` by the migration so later uploads find the same unit.
- **S3 — Delete a title.** User: "implementa la eliminacion de un comic o manga en este caso lo llamamos titulo pero no tenemos como eliminar actualmente".
  - The title edit page gets a delete action (danger zone with confirmation) labelled with the word "título".
  - Deleting a title removes it from every route, deletes the units that no other title links (with their progress and stored files or pages), keeps units still linked elsewhere, deletes its cover file, and recomputes the kind/universe of the routes it was in.
  - Errors are reported, never silently swallowed: a database failure leaves the title in place with an error message; a storage cleanup failure after the database delete reports success with a warning, as the unit removal already does.

## Tasks

- [x] T1 — S1 kind rename (SQL migration, lib, API, UI, tests). Route: delegated (context backstop: long parent session). Commit: d3afbe6. RED: 10 tests (episodes manga formats/pages, titles manga kind, route manga kind) failed; GREEN: 156/156, astro check 0 errors.
- [x] T2 — S2 unit_type per title (SQL column, forms, wording, labels, tests). Route: delegated, same writer after T1. Commit: 7645e2c. RED: 10 tests (titles unit_type create/update/message, unitLabel tomo, tomo uploads, episodes/units messages, detectNumber tomo/vol) failed; GREEN: 166/166, astro check 0 errors.
- [x] T3 — S3 title delete (endpoint cleanup, route recompute, danger zone UI, tests). Route: delegated, same writer after T2. Commit: `feat(admin): delete a title with its own units and files` (hash recorded by the parent). RED: 7 of 9 tests in `src/lib/title-delete.test.ts` failed; GREEN: 175/175, astro check 0 errors.
- [ ] T4 — Independent verification (high risk: migration, deletion of stored data). Route: delegated verifier. Commit: —

## Log

- L1 (2026-10-14, user): "oye cuando hablamos de anime en realidad es manga podrias ajustar que reciba los mismo formatos y funcine igual que el comic el anime lo  implementaremos mas adelante por otro lado aveces los comics o animes vienen en tomos entonces no serian episodios sino necesitamos poder diferenciar entre episodios y tomos"
- L2 (2026-10-14, user, answering per-title vs per-file): "opcion 1 esta ok al terminar de una implementa la eliminacion de un comic o manga en este caso lo llamamos titulo pero no tenemos como eliminar actualmente"
- L3: Map from a read-only explorer. The existing `delete` action in `src/pages/api/admin/media.ts:31-37` only deletes the media row and its cover. Units, their progress and files are left orphaned, and route kinds are not recomputed. The DeleteTitleZone UI was removed in 101b32a.
- L4 (T1): kind is now `comic` | `manga` (helper `src/lib/kinds.ts`). Both kinds share one format list (`UNIT_FORMATS`, `UNIT_PICK_EXTENSIONS`, `UNIT_FORMAT_LIST`) and page uploads; unit labels are always `<Serie> #N`. Reader video code untouched. SQL: `01_schema.sql` drops/re-adds `media_kind_check` and `routes_kind_check` around `update ... set kind = 'manga' where kind = 'anime'`.
- L5 (T2): `media.unit_type` (`episodio` | `tomo`, default `episodio`) with helpers `toUnitType`, `unitWords`, `unitCount` in `src/lib/kinds.ts`. Labels: `<Serie> #N` (episodio) and `<Serie> - Tomo N` (tomo). Counters that mix titles use the neutral word "entregas". SQL adds the column and rewrites `"<X> - Episodio N"` labels of manga titles to `"<X> #N"` unless that label already exists. T1 commit: d3afbe6.
- L6 (T3): `delete` in `src/pages/api/admin/media.ts` now collects unit and route ids, deletes the media row (`.select('id')`, so an RLS-blocked delete reports 'No se pudo borrar el título.'), deletes only units with 0 remaining links (count error keeps the unit with a warning), removes their files/pages and the cover (failures add 'Algunos archivos no se pudieron borrar del almacenamiento.'), and refreshes route meta. DeleteTitleZone restored on the title page. Mock gained `db.failDeletes` and `storage.failRemove`. T2 commit: 7645e2c.
