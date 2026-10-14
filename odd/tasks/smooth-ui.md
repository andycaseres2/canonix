# Smooth UI

Objective: animated page changes with View Transitions, and admin changes that update in place without the page flashing.
Branch: `feat/smooth-ui` (stacked on `feat/route-stages`) · Delivery: ask-on-risk · Test runner: vitest (`pnpm test`), `pnpm check`; behaviour checked in Chrome via CDP.

## Specs

- S1: "agregale animaciones a los cambios de paginas con viewtransition". Navigating between pages animates with View Transitions; the site header stays put; reduced-motion users get no animation.
- S2: "cada que hago un cambio por ejemplo cambiar de lugar los comics de una etapa la web titila feo eso no puede pasar". Admin changes such as moving titles inside a stage update in place: no full reload, no white flash, scroll stays where it was, and moved items animate to their new place. The result message still shows.
- S3 (assumption): it applies to the route editor (route data, stages, titles, picker), the title page's numbers list, the users table and the public "Iniciar ruta" button. Browsers without View Transitions still work, just without animation.

## Tasks

| ID | Specs | Route | Status | Commit |
|----|-------|-------|--------|--------|
| T1 | S1 | inline | pending | |
| T2 | S2, S3 | inline | pending | |

Route evidence: no Writer trigger; parent writes inline.

## Log

- L1 (2026-10-13, user, verbatim): "algo que no me gusta para nada 1 aghregale animaciones a los cambios de paginas con viewtransition 2 cada que hago un cambio por ejemplo cambiar de lugar los comics de una etapa la web titila feo eso no puede pasar"
- L2: Decision: native cross-document View Transitions (`@view-transition { navigation: auto }`) for page changes, instead of Astro's ClientRouter. ClientRouter would require rewriting every page script for its page-load lifecycle. In-place admin updates use one generic `data-swap` form enhancement: fetch, parse, replace only the named regions inside `document.startViewTransition`.
