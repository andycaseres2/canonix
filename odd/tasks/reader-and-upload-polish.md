# Reader and upload polish

Objective: five reader/uploader improvements on top of today's uncommitted page turn, catalog button and image compression.
Branch: feat/page-flip (from main 9e593b3). Delivery: no commits until the user says so (L1). Test runner: `pnpm test` (vitest), `pnpm check`, `pnpm build`.

## Specs

Proposed by the assistant and accepted by the user as a whole ("ajusta todos esos que mencionas"); the quoted text is the proposal the user accepted.

- S1 — Swipe on phones: "Deslizar con el dedo en el celular. Hoy las páginas se pasan tocando los costados o con el teclado. Con la vuelta tipo libro, lo natural es arrastrar la hoja con el dedo y que siga el movimiento."
  Acceptance: dragging horizontally on the page turns it (left = next, right = previous); the sheet follows the finger while dragging and completes or springs back on release; taps, double-tap zoom, vertical scroll of tall pages and zoomed panning keep working.
- S2 — Two-page spread on desktop: "Vista de dos páginas en compu. En pantallas anchas, mostrar dos páginas una al lado de la otra como un libro abierto. Completa el efecto de la vuelta de página."
  Acceptance: on wide screens the reader shows two pages side by side (cover alone first, as in a printed book), turns them with the paper animation, and phones keep one page. Counter, resume, saved progress and "next issue" keep working.
- S3 — Legacy cleanup: "Limpiar código viejo. Como vas a borrar todo y volver a subir desde cero, todo quedará guardado página por página. El código para PDFs y CBZ de un solo archivo, y el lector de video que quedó sin uso, se pueden sacar."
  Acceptance: no reader/upload code path remains for single-file units or video; the admin uploader still accepts CBZ/CBR/PDF and splits them into pages; tests updated.
- S4 — Compression off the main thread: "Comprimir sin trabar la pantalla. Hoy la compresión corre en la misma pestaña, así que con un número de 200 páginas el admin puede sentir la pantalla lenta un rato. Pasarla a un proceso en segundo plano (un "Web Worker") lo deja fluido."
  Acceptance: page compression runs in a Web Worker where OffscreenCanvas is available, with the current main-thread path as fallback; output identical in format/naming rules.
- S5 — Page cache on re-read: "Caché de páginas al volver a leer. Sospecho, sin haberlo medido, que al reabrir un número se vuelven a descargar las páginas, porque los links firmados cambian cada vez. Si se confirma, arreglarlo ahorra datos a quien lee."
  Acceptance: first confirm the cause; if confirmed, reopening a unit serves already-downloaded pages from a local cache keyed without the signed token, bounded in size.

## Tasks

| ID | Specs | Route | Status | Evidence |
|----|-------|-------|--------|----------|
| T1 | S1 | inline (shares ReaderViewer with T2/T5) | done, uncommitted | Chrome mouse drag: forward/back turn, short drag falls back, tap still turns; emulated touch 390x844: swipe left/right turn, vertical swipe scrolls |
| T2 | S2 | inline | done, uncommitted | Chrome 1500x900: cover alone + blank, "2–3 / 9" … "8–9 / 9", next link on last spread, toggle to single keeps page ("8 / 9"), sheet lands on left half showing next page |
| T3 | S3 | delegated writer (parallel trigger: server/api/tests surface disjoint from ReaderViewer) | done, uncommitted | RED→GREEN: reupload state, endpoint 409, complete without folder 400, kind 'unit' 400; viewer branches removed by parent |
| T4 | S4 | delegated writer (parallel trigger: disjoint surface admin-titles/scripts/compress*) | done, uncommitted | RED→GREEN workerPool tests; Chrome: 3 workers, same output as fallback; build emits compress.worker-*.js |
| T5 | S5 | inline | done, uncommitted | Cause confirmed (new token per signing, no SW/cache); Cache Storage keyed by path, max 600; reload with new tokens: 0 image requests |

## Log

- L1 (2026-10-19, user, verbatim): "no no comitees aun ajusta todos esos que mencionas y luego si subimos"
- L2: Already done on this branch, uncommitted: paper page turn (ReaderViewer/reader.css), "← Catálogo" button (ReaderBar), WebP compression before upload (compress.ts). User confirmed quality: a real page went 1.2 MB → 800 KB; another is 2175×3075 at 1.04 MB. Keep PAGE_MAX_SIDE 3200 and quality 0.85.
- L3: Commits deferred by the user's explicit instruction (overrides ODD work-unit commits).
- L4: Explorer map: single-file upload branch unreachable; signed URLs re-issued per visit with fresh tokens; bucket content private; no service worker.
- L5: T4 writer: shared pure logic lives in compress.worker.ts (Vite 8 rejects circular worker imports); worker hang has no timeout (accepted, advisory).
- L6: T3 writer kept removeStored single-file fallback (old rows until the wipe) and findFile (covers.ts uses it); added 'reupload' reader state.
- L7: Parent drag fixes: sheet edge tracks the finger via acos(rel); commit after a quarter-width drag or a flick.
- L8: Seam check: pnpm test 249/249, pnpm check 0 errors, pnpm build OK. Next: independent verifier (risk: private pages cached on device; server API changes).
- L9: Independent verifier: S1–S5 PASS. Blocker B1 (mouse released outside the stage left a stale drag that turned pages on hover) fixed by releasing on a buttonless mouse move; rechecked in Chrome (no turn on hover, tap and drag still work). Advisory A3 fixed: pages are renamed only when their type changes (worker copies broke the identity check), RED→GREEN test added. Remaining advisories accepted: cache not cleared on logout (premium unused), 600-entry FIFO cap, worker hang without timeout, brief double overlay when a drag overlaps a slow show, small jump when consecutive views differ in height, resume in single mode lands on the spread's left page.
- L10: Final: pnpm test 250/250, pnpm check 0 errors, pnpm build OK. Awaiting the user's go-ahead to commit.
