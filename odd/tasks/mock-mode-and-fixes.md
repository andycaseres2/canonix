# Mock mode and platform fixes

Objective: run the site locally without Supabase keys using an in-project mock database toggled by a constant, then fix the issues found in the platform analysis.
Branch: `feat/mock-mode-and-fixes` · Delivery: ask-on-risk · Test runner: vitest (added in T6; none existed before).

## Specs

- S1: "has un database dentro del proyecto el cual se active con una constante en true o false si es true usa el mock si es false usa las key". The mock must let the user see the web visually with demo data ("necesito datos demos por ahora para ver como se ve la web visualmente"). Assumption: the mock covers every page (public, profile, admin) and login with demo accounts; data lives in memory and resets on server restart.
- S2: "luego usara solo supabase": with the constant set to false, behavior is the real Supabase client exactly as before.
- S3 (finding 1): premium routes must not be readable through the public Supabase REST API by non-premium users (route_items RLS).
- S4 (finding 2): `getRouteUnitMap` must not run per-route queries (N+1).
- S5 (finding 3): middleware must not call Supabase Auth on requests without a session cookie.
- S6 (finding 4): a locked premium route page must not fetch its items.
- S7 (finding 5): admin `add_one` must reject generic labels (purely numeric or too short) that would share progress across unrelated titles.
- S8 (finding 6): project under git, with automated tests and a CI check.

## Tasks

| ID | Specs | Route | Status | Commit |
|----|-------|-------|--------|--------|
| T1 | S1, S2 | inline | done | 36ab2ea |
| T2 | S3 | inline | done | ea80151 |
| T3 | S4, S6 | inline | done | 1c0da4a |
| T4 | S5 | inline | done | df6d54c |
| T5 | S7 | inline | done | ae246fb |
| T6 | S8 | inline | done | 2ded249 |

Route evidence: no Writer trigger (no parallel units, context well under backstop); parent writes inline.

## Log

- L1 (2026-10-13, user, verbatim): "primero algo el proyecto esta dando error de keys porque no hemos integrado supabase entonces necesito datos demos por ahora para ver como se ve la web visualmente has un database dentro del proyecto el cual se active con una constante en true o false si es true usa el mock si es false usa las key luego uisara solo supabase pero por ahora necesito ver el proyecto y luego si arregla todos los problemas encontrados"
- L2: Baseline committed as `f877d33` on `main` (repo had no git). Decision: mock implemented as a fake Supabase client exposing the query-builder subset the pages use, so no page changes are needed; seed data generated from `supabase/02_seed_marvel.sql`.
- L3: Order changed to T1, T3, T2, T4, T5, T6: S3 (closing route_items) would have shown premium routes as 0 titles on listings, so the route_unit_map() security-definer RPC (S4) landed first.
- L4: Evidence. vitest 32/32 green, astro check 0 errors. RED observed before each fix (T1 missing module, T3 3 fails, T2 2 fails, T4 missing module, T5 5 fails). Real Postgres 17 probe of 01+02 SQL: anon/free see 0 premium items, premium/admin 1, draft admin-only, marvel public 62, route_unit_map 62 items/1476 units. Dev server smoke as anon/lector/premium/admin: all pages 200/302/404 as expected; register, login, logout, progress POST, admin add_range and create OK.
- L5: Extra fixes found along the way: draft route items were also publicly readable (covered by can_read_route). pnpm-workspace esbuild build approved for frozen CI installs. Open note: both package-lock.json and pnpm-lock.yaml exist; package-lock.json is stale (no vitest).
- L6: Delivery: branch is ~1360 changed lines (incl. 111KB generated seed JSON); no remote configured, so no PR slicing applies yet. RDD on; assess over f877d33..HEAD = high (review_due). Next: independent verifier, then native review.
- L7 (2026-10-13): Independent verifier: S1, S2, S4, S5, S6, S8 PASS; S3 PARTIAL (blocker: route_unit_map leaked premium unit ids, titles rebuildable via public media_units); S7 PARTIAL (number-only >= 6 chars and "Vol 1"/"Ep. 12" accepted). One correction batch in 0485186: unit ids gated by can_read_route, new unit_count for listing totals, broader generic-label rule. Recheck on real Postgres: anon/free rebuild nothing, premium sees titles, schema re-runs twice cleanly. Open decision for the user: /catalogo/[slug] "Está en" no longer lists premium routes for anon/free (restoring it would re-leak premium membership title by title). Advisories not fixed: JSON POST /api/progress not covered by checkOrigin (pre-existing, text/plain CSRF); mock modules bundled when USE_MOCK=false.
- L8 (2026-10-13, user, verbatim): "1. mejora los selects las opciones deben ser acorde a los estilos de la pagina, 2. mejora las opciciones de abaj odel admin de la creacion o edicion de cada elemento porfavor mejor la posicion de los botones, 3. el contenido que subire es descargado por mi y subido al repo de supabase eso hare yo manualmente entonces por eso nose si seran oformato cbr o cbz o simplemente pdf" — Done in 90b59d1 (selects with custom chevron + base-select styled picker, .form-actions band, .danger-zone, section-head links, .split min-width fix for phone overflow). Verified by Chrome headless screenshots light/dark/390px and form submit smoke.
