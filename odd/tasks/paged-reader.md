# Paged reader

Objective: comics open instantly and read smoothly: CBZ/CBR are stored as one image per page and the reader loads only the pages being read; PDFs load by ranges; video keeps streaming.
Branch: `feat/paged-reader` (stacked on `feat/reader`) · Delivery: work-unit commits on one branch; PR slicing decided at push time (user owns push/PR) · Test runner: vitest (`pnpm exec vitest run`), `pnpm exec astro check`.

## Specs

- S1: "Failed to fetch dynamically imported module ... salio esto al intentar ver el comic pero porque tiene que descargarlo si tenemos el archivo directo no?" The reader must not wait for the whole comic file before showing the first page.
- S2 (user approval, verbatim): "necesito que esto funcione de verdad de forma profesional porfavor tu sabes como hacerlo de forma profesional entonces dale", approving the proposed plan: CBZ/CBR uploads are split in the admin's browser into one original image per page (no recompression) inside a folder per issue; the reader signs every page in one request, shows page 1 as soon as it arrives and preloads the next ones; the storage rule covers the issue folder with the same free/premium check.
- S3 (same approval): PDFs stay as one file but pdf.js loads them by HTTP ranges instead of downloading the whole file first. Video is unchanged (native streaming).
- S4 (assumption): issues already stored as a single CBZ keep opening (old path); re-uploading the same number replaces it with pages and removes the old file. Removing a unit's file removes every page.
- S5 (assumption): limits per issue: at most 2000 pages, each page an image (jpg, jpeg, png, webp, gif, avif) of at most 50 MB.

## Tasks

| ID | Specs | Route | Status | Commit |
|----|-------|-------|--------|--------|
| T1 | S2, S4 | inline | done | 3bbf365 |
| T2 | S2, S4, S5 | inline | done | 55e16c4 |
| T3 | S2, S5 | inline | pending | |
| T4 | S1, S2, S3, S4 | inline | pending | |
| T5 | all | delegated verifier | pending | |

T1: `units.pages text[]` + `can_read_unit_file` matches the issue folder; mock mirror; PG probe. T2: `/api/admin/uploads` kind `unit-pages` (validate, sign every page) and `/api/admin/episodes` complete with pages (verify all uploaded, replace old file/folder), `remove_file` removes a folder. T3: uploader extracts CBZ/CBR pages (fflate/libarchive) and uploads them with limited concurrency and one progress bar. T4: `getReader` signs page URLs in one call; viewer paged mode (no download, preload); PDF range loading. T5: independent verifier (storage policy and data are high risk).
Route evidence: no Writer trigger (sequential units sharing schema, endpoints and viewer); parent writes inline.

## Log

- L1 (2026-10-14, user, verbatim): "Failed to fetch dynamically imported module: http://localhost:4321/node_modules/.vite/deps/fflate.js?v=b3f3c5ed salio esto al intentar ver el comic pero porque tiene que descargarlo si tenemos el archivo directo no?"
- L2 (2026-10-14): the import error was a stale Vite optimized dep (dev server started 10:28, deps installed ~12:55; URL answered 504). Fixed on feat/reader by `optimizeDeps.include` (commit "fix(dev): pre-bundle…"); the user must restart the dev server once.
- L3 (2026-10-14, user, verbatim): "aja cual seria la forma mas optima para hacer esto necesito sea optimo y que el usuario pueda ver tranquilo cada comic" → proposal: split pages + PDF ranges.
- L4 (2026-10-14, user, verbatim): "crees que es mejor que busquemos directamente los comics y animes en pdf?" → answered no (CBZ is lighter to display; anime should be MP4 H.264/AAC); copyright exposure flagged.
- L5 (2026-10-14, user, verbatim): "necesito que esto funcione de verdad de forma profesional porfavor tu sabes como hacerlo de forma profesional entonces dale"
- L6: T1 evidence: RED (2 mock tests) then GREEN; own check caught that the folder path itself matched file_path, tightened to single-file units only. PG17 (01+03 re-applied over existing data): anon none; free user reads only listed pages of the free paged unit (not extra.jpg, not the folder key); premium also reads the premium paged unit; admin everything. vitest 127/127.
- L7: T2 evidence: 12 RED endpoint tests then GREEN (sign pages into folder; reject anime, empty, >2000, non-image, path-like name, >50 MB, duplicate; register only when all pages exist; missing page → "Faltan 1 página…" with no unit created; foreign folder refused; single→pages→pages→single replacement deletes previous storage; remove_file deletes every page). Existing single-file tests unchanged and passing. vitest 140/140, astro check 0 errors.
