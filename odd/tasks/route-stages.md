# Route stages

Objective: a route is built as route (name and description) → stages (title and description) → comics/animes. Everything else is derived or kept to a minimum.
Branch: `feat/route-stages` (stacked on `feat/uploads-and-dialogs`) · Delivery: ask-on-risk · Test runner: vitest (`pnpm test`), `pnpm check`.

## Specs

- S1: "en la rutas al crear la ruta internamente solo seria agregar los comis o animes de las rutas no tantas cosas y el titulo y descripcion de la etapa asi como aca [Años 60 heading] el titulo y se suman los comis o animes pero no necesitamos mas informacion para la ruta". Creating a route asks only for its name and description.
- S2: Stages are their own entity with a title and a description, ordered inside the route. Comics/animes are added to a stage by searching for them, ordered inside it, and removed. The public route page shows each stage's title (as in the screenshot) and its description.
- S3 (user choice, verbatim option): "Ruta → etapas → títulos (Recomendado)": "La ruta solo pide nombre y descripción. Adentro creás etapas (título + descripción) y a cada etapa le sumás cómics o animes buscándolos. Universo y tipo se calculan solos a partir de los títulos. Se mantiene un interruptor Publicada y Gratis/Premium."
- S4 (assumption): existing data (route_items.section text) migrates to stages without losing order; RLS for stages matches route items (premium/draft lock); the route's slug is set at creation and stays stable when renamed; the bulk text add and per-row section inputs are removed.

## Tasks

| ID | Specs | Route | Status | Commit |
|----|-------|-------|--------|--------|
| T1 | S2, S4 | inline | pending | |
| T2 | S1, S3 | inline | pending | |
| T3 | S2 | inline | pending | |

T1: schema + migration + mock + data layer + public page. T2: route endpoints (create/update with derived universe/kind). T3: admin route editor (stages and items).
Route evidence: no Writer trigger (sequential units sharing schema and endpoints); parent writes inline.

## Log

- L1 (2026-10-13, user, verbatim): "en la rutas al crear la ruta internamente solo seria agregar los comis  o animes de las rutas no tantas cosas y el titulo y descripcion de la etapa asi como aca [Image #1] el titulo y se suman los comis o animes pero no necesitamos mas informacion para la ruta"
- L2 (2026-10-13): the user answered the structure question with "Ruta → etapas → títulos (Recomendado)" (S3).
