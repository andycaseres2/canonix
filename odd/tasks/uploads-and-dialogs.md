# Uploads and dialogs

Objective: replace native browser dialogs with a styled modal, and let the admin upload a cover and one file per issue/episode (the unit count comes from the files).
Branch: `feat/uploads-and-dialogs` (stacked on `feat/mock-mode-and-fixes`) · Delivery: ask-on-risk · Test runner: vitest (`pnpm test`), `pnpm check`.

## Specs

- S1: "para las alertas que queramos mostrar necesitamos un modal para eso no usar la alert()". Every native `confirm()`/`alert()` is replaced by a modal in the page's style, reusable for future alerts and confirmations.
- S2: "necesito mejores la carga de los comics porque no veo opcions para subir los episodios ni nada de eso". The admin title page lets the admin upload issue/episode files, one file per unit ("cada episodio seria un archivo por comic o anime", from the previous request), so the count comes from the uploaded files. Assumption: several files can be selected at once; the number is detected from each file name and can be edited before uploading; accepted formats are CBZ, CBR and PDF for comics and MP4, WEBM and MKV for anime.
- S3: "ni subir tampoco la porta del comic". The admin can upload a cover image for a title. Assumption: the cover is shown in the catalog (cards and title page) and in the admin.
- S4 (assumption): mock mode (`USE_MOCK = true`) supports uploads with in-memory storage, so the flow can be tried without Supabase.
- S5 (assumption): with Supabase, files go straight from the browser to Supabase Storage through signed upload URLs (Vercel functions cap request bodies at about 4.5 MB). Covers go to a public bucket and content to a private one, and only admins can write.
- S6: "si todo eso debe estar" (answer to adding a "Nombre de la serie" field to the uploader). The uploader gets a series name, prefilled with the title like "Agregar un rango", and units are labelled `<series> #N` / `<series> - Episodio N`, so uploads join the numbers that already exist.
- S7: "no veo el cargar los archivos y no es crear titulo debe ser la copion de crear el comic o anime subir portada ponerle name subir episodios todo eso". "Agregar título" is replaced by one "Nuevo cómic o anime" screen: type, name and data, cover and issue/episode files, all created and uploaded with one button. The title's edit page keeps the same cover and upload sections.

## Tasks

| ID | Specs | Route | Status | Commit |
|----|-------|-------|--------|--------|
| T1 | S1 | inline | done | a51ab08 |
| T2 | S4, S5 | inline | done | 31b682e |
| T3 | S3 | inline | done | e4a8b7b |
| T4 | S2 | inline | done | d2213c0 |
| T5 | S6 | inline | done | d37bd69 |
| T6 | S7 | inline | pending | |

Route evidence: no Writer trigger (sequential units sharing src/lib/mock and the admin title page); parent writes inline.

## Log

- L1 (2026-10-13, user, verbatim): "mira para las alertas que queramos mostrar necesitamos un modal para eso no usar la alert(), 2. necesito mejores la carga de los comics porque no veo opcions para subir los episodios ni nada de eso ni subir tampoco la porta del comic necesitop ajustes eso."
- L2 (2026-10-13, user, verbatim, previous turn): "desde el admin se cargara el comic o el manga y se subirran los episodios 1 por uno para que se registren y se sepa la cantidad osea cada episodio seria un archivo por comic o anime eso toca tenerlo presente"
- L3: Verified with the supabase-js source (context7): `createSignedUploadUrl(path)` returns `{ signedUrl, token, path }`. `uploadToSignedUrl` sends a PUT to `/object/upload/sign/{bucket}/{path}?token=` with either a raw body plus `content-type`, `cache-control` and `x-upsert` headers, or FormData. Plan: the browser PUTs the raw file with XMLHttpRequest, which gives upload progress.
- L4: Evidence. vitest 96/96, astro check 0 errors (two type errors slipped into 31b682e and e4a8b7b because check ran before the last edit; both fixed in the next commit). RED observed per task: T1 static guard (5 native confirms), T2 7+4 fails, T3 module missing, T4 module missing. Real Postgres probes: 03_storage.sql loads twice; admin can write storage.objects, free user cannot write or read. Chrome CDP end to end on the dev server: the dialog cancels and confirms; a cover upload reloads with "Portada actualizada." and shows in the admin and the catalog; a 3-file upload detected 13/14/15, the title went from 12 to 15 numbers with "3 de 15 con archivo".
- L5: Gotcha: the demo DB cached on globalThis keeps its old shape across hot reloads, so it now reseeds when SEED_VERSION changes or the MockDb class identity changes.
- L6: Not done (follow-ups): the remove_file endpoint has no UI yet. Very large videos may need resumable (TUS) uploads instead of one PUT. Reading the files (the reader) is not built yet.
- L7: Independent verifier: S4, S5 PASS; S1, S2, S3 FAIL with 4 blockers. B1: the guard test was red in a clean clone; Vite `?raw` served transformed TS locally, so it now reads files with fs, and its regex skips method signatures. B2/B3: `.btn` and `.stack` overrode `[hidden]`, which kept the alert's Cancel button and the empty upload queue visible; a global `[hidden] { display: none !important }` fixes both and also the catalog search (broken since the baseline). B4: `reloadWith` with an unchanged URL only scrolled to the hash; it now reloads. Mock object responses are `no-store`. Recheck in Chrome: alert Cancel hidden, queue hidden on load, two covers and two unit uploads in a row reload with fresh data, catalog search filters. Advisory kept for the user: uploads label units `<title> #N`, so seeded titles whose units use another series prefix (e.g. "Batman: Year One" vs "Batman #404") get new units instead of joining the existing ones.
- L8 (2026-10-13, user, verbatim): "si todo eso debe estar, otra cosa es que no veo el cargar los archivos yu no es crear titulo debe ser la copion de crear el comic o anime subir portada ponerle name subir episodios todo eso"
