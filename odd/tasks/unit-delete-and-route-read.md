# Unit delete and route read

Objective: removing an issue/episode in the admin deletes it with its stored files (no orphans), and route pages link each title to the reader.
Branch: `feat/unit-delete-and-route-read` (from `main` ed58bf6) · Delivery: work-unit commits; push/PR are the user's call · Test runner: vitest (`pnpm exec vitest run`), `pnpm exec astro check`.

## Specs

- S1: "La ✕ de cada número en el admin deja archivos huérfanos: desvincula el número, pero el archivo o las páginas quedan en Storage ocupando espacio. Debería borrarlos, con confirmación." (proposal accepted with "si dale arranca con esos dos").
- S2: "Las páginas de rutas no tienen "Leer": siguen con los chips viejos. El lector solo se abre desde la página del título." (same acceptance).
- S3 (assumption): a unit still linked to another title is only unlinked from this one and keeps its files; a unit left with no title is deleted with its file or pages (its progress rows go with it by `on delete cascade`). The confirm dialog says which will happen.
- S4 (assumption): on a route, each title with files shows "Leer #N" ("Ver ep. N" for anime) pointing to the first unit with a file the user has not marked, or the first one when all are read; a premium title shows "Premium" instead for viewers without premium. No storage path reaches the page.

## Tasks

| ID | Specs | Route | Status | Commit |
|----|-------|-------|--------|--------|
| T1 | S1, S3 | inline | done | c8183a4 |
| T2 | S2, S4 | inline | done | e31721e |
| T3 | all | delegated verifier | done | 79bfa3e (fix) |

Route evidence: no Writer trigger (two small sequential units); parent writes inline. T1 deletes stored data (high risk item 1) → T3 independent verifier.

## Log

- L1 (2026-10-14, user, verbatim): "si dale arranca con esos dos" — answering "¿Arranco con esos dos?" after the list where S1 and S2 were items 1 and 2 of "Huecos del producto".
- L2: T1 evidence: 4 RED tests then GREEN (single file deleted with unit; paged unit deletes every page; shared unit only unlinked with file kept; unit not in title → "Ese número no está en este título." and nothing deleted). The old test "remove keeps the unit row" was replaced because S1/S3 change that behavior on purpose. DB row is deleted before storage files. vitest 148/148, astro check 0 errors.
- L3: T2 evidence: RED data test then GREEN (units carry `file` booleans, items carry `premium`, serialized items contain no storage path). Harness render of a sample route (free viewer): FF row and "Te toca" card link to /leer/ff/2 (first unread with file; #3 has none), X-Men shows "Premium", Avengers (no files) shows no link; premium viewer gets /leer/xm/1. vitest 149/149, astro check 0 errors.
- L4: T3 independent verifier (fresh PG17): S1–S4 PASS, no blockers. Probes: non-admin deletes of media_units/units/storage.objects affect 0 rows; shared unit unlink keeps unit, file and progress; deleting an unshared paged unit returns its folder and pages and cascades its progress (also other users'); only media_units and progress reference units. vitest 149/149, astro check 0 errors. Advisories fixed in 79bfa3e: a failed link count no longer falls through to deleting the unit (which would cascade other titles' links); unit delete and storage errors are surfaced; empty unit id → "Número inválido."; malformed id → "Ese número no está en este título." with nothing touched (2 tests); removeStored now throws on storage errors and its other callers (upload replacement, remove_file) catch and log so uploads do not fail. vitest 151/151. Left as is: anonymous viewers see "Premium" on routes but not on the title page; the "Dónde leer" link moved into the new read row.
