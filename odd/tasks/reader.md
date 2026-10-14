# Reader

Objective: readers open a title's issue/episode files inside the app (PDF, CBZ, CBR via conversion, video), with access set per title (free or premium).
Branch: `feat/reader` (stacked on `feat/upload-only-units`) · Delivery: work-unit commits on one branch; PR slicing decided at push time (user owns push/PR) · Test runner: vitest (`pnpm exec vitest run`), `pnpm exec astro check`.

## Specs

- S1: "mejora lo de los numeros esos son los episodios yu toca implementar el visual de los arcxhivos pueden ser pdf o cbr o cbz". The public title page lists its issues/episodes in a clearer way, and each one with a file can be opened in an in-app viewer for PDF, CBR and CBZ files.
- S2 (user choice, verbatim option): "Plan en el título (Recomendado)": "Cada cómic/anime tiene 'Gratis' o 'Premium'. Gratis: cualquier usuario logueado lo lee. Premium: solo usuarios premium. Las rutas quedan como orden de lectura. Fácil de entender y de administrar."
- S3 (assumption): access is enforced by the database (a storage read policy on bucket `content` tied to the title's plan), not only by the UI; anonymous visitors are sent to log in; admins read everything. Existing titles become free.
- S4 (assumption, from the earlier conversation): CBR files are converted to CBZ in the admin's browser before upload, so storage only keeps CBZ/PDF for comics; CBZ pages may sit inside a subfolder.
- S5 (assumption): anime files (MP4/WEBM/MKV) open in a native video player in the same viewer.

## Tasks

| ID | Specs | Route | Status | Commit |
|----|-------|-------|--------|--------|
| T1 | S2, S3 | inline | pending | |
| T2 | S1, S3, S5 | inline | pending | |
| T3 | S1, S4 | inline | pending | |
| T4 | S4 | inline | pending | |
| T5 | S1 | inline | pending | |
| T6 | all | delegated verifier | pending | |

T1: `media.requires_plan` + storage read policy (`supabase/04_reader.sql`), mock mirror, admin "Acceso" field, premium badge. T2: reader page `/leer/<slug>/<n>` with signed URL, prev/next, lock/login states; video. T3: client viewer for PDF (pdfjs-dist 6.3.289) and CBZ (fflate 0.8.3). T4: CBR→CBZ in the uploader (libarchive.js 2.0.2); server stops storing .cbr. T5: title page episode list with "Leer" and progress. T6: independent verifier (security + migration + deps are high risk).
Route evidence: no Writer trigger (sequential units sharing schema, data layer and pages); parent writes inline.

## Log

- L1 (2026-10-14, user, verbatim): "mejora lo de los numeros esos son los episodios yu toca implementar el visual de los arcxhivos pueden ser pdf o cbr o cbz"
- L2 (2026-10-14): explorer map: title page `src/pages/catalogo/[slug].astro` uses shared client-rendered `Tracker.astro`; `units_read using (true)`; `content` bucket has only an admin policy; no plan on media; no createSignedUrl in app code.
- L3 (2026-10-14): the user answered the access question with "Plan en el título (Recomendado)" (S2).
