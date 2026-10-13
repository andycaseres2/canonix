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
| T1 | S1, S2 | inline | pending | |
| T2 | S3 | inline | pending | |
| T3 | S4, S6 | inline | pending | |
| T4 | S5 | inline | pending | |
| T5 | S7 | inline | pending | |
| T6 | S8 | inline | pending | |

Route evidence: no Writer trigger (no parallel units, context well under backstop); parent writes inline.

## Log

- L1 (2026-10-13, user, verbatim): "primero algo el proyecto esta dando error de keys porque no hemos integrado supabase entonces necesito datos demos por ahora para ver como se ve la web visualmente has un database dentro del proyecto el cual se active con una constante en true o false si es true usa el mock si es false usa las key luego uisara solo supabase pero por ahora necesito ver el proyecto y luego si arregla todos los problemas encontrados"
- L2: Baseline committed as `f877d33` on `main` (repo had no git). Decision: mock implemented as a fake Supabase client exposing the query-builder subset the pages use, so no page changes are needed; seed data generated from `supabase/02_seed_marvel.sql`.
