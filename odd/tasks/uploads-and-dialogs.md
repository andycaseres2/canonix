# Uploads and dialogs

Objective: replace native browser dialogs with a styled modal, and let the admin upload a cover and one file per issue/episode (the unit count comes from the files).
Branch: `feat/uploads-and-dialogs` (stacked on `feat/mock-mode-and-fixes`) · Delivery: ask-on-risk · Test runner: vitest (`pnpm test`), `pnpm check`.

## Specs

- S1: "para las alertas que queramos mostrar necesitamos un modal para eso no usar la alert()". Every native `confirm()`/`alert()` is replaced by a modal in the page's style, reusable for future alerts and confirmations.
- S2: "necesito mejores la carga de los comics porque no veo opcions para subir los episodios ni nada de eso". The admin title page lets the admin upload issue/episode files, one file per unit ("cada episodio seria un archivo por comic o anime", from the previous request), so the count comes from the uploaded files. Assumption: several files can be selected at once; the number is detected from each file name and can be edited before uploading; accepted formats are CBZ, CBR and PDF for comics and MP4, WEBM and MKV for anime.
- S3: "ni subir tampoco la porta del comic". The admin can upload a cover image for a title. Assumption: the cover is shown in the catalog (cards and title page) and in the admin.
- S4 (assumption): mock mode (`USE_MOCK = true`) supports uploads with in-memory storage, so the flow can be tried without Supabase.
- S5 (assumption): with Supabase, files go straight from the browser to Supabase Storage through signed upload URLs (Vercel functions cap request bodies at about 4.5 MB). Covers go to a public bucket and content to a private one, and only admins can write.

## Tasks

| ID | Specs | Route | Status | Commit |
|----|-------|-------|--------|--------|
| T1 | S1 | inline | pending | |
| T2 | S4, S5 | inline | pending | |
| T3 | S3 | inline | pending | |
| T4 | S2 | inline | pending | |

Route evidence: no Writer trigger (sequential units sharing src/lib/mock and the admin title page); parent writes inline.

## Log

- L1 (2026-10-13, user, verbatim): "mira para las alertas que queramos mostrar necesitamos un modal para eso no usar la alert(), 2. necesito mejores la carga de los comics porque no veo opcions para subir los episodios ni nada de eso ni subir tampoco la porta del comic necesitop ajustes eso."
- L2 (2026-10-13, user, verbatim, previous turn): "desde el admin se cargara el comic o el manga y se subirran los episodios 1 por uno para que se registren y se sepa la cantidad osea cada episodio seria un archivo por comic o anime eso toca tenerlo presente"
- L3: Verified with the supabase-js source (context7): `createSignedUploadUrl(path)` returns `{ signedUrl, token, path }`. `uploadToSignedUrl` sends a PUT to `/object/upload/sign/{bucket}/{path}?token=` with either a raw body plus `content-type`, `cache-control` and `x-upsert` headers, or FormData. Plan: the browser PUTs the raw file with XMLHttpRequest, which gives upload progress.
