# Componentize

Objective: every UI element is a well-named component in a clear, feature-first folder structure, and pages only load data and compose. No visual or behavioural change.
Branch: `refactor/components` (stacked on `feat/smooth-ui`) · Delivery: ask-on-risk · Checks: `pnpm test`, `pnpm check`, pixel diff of 28 baseline screenshots (14 pages × 1280/390 px, noise measured at 0), Chrome end-to-end flows.

## Specs

- S1: "componetiza cada elemento bien y bien ordenado porfavoer". Split pages into components and order the code clearly.
- S2 (assumption, structure decision): feature-first ("screaming") folders + atomic UI + container/presentational:
  ```
  src/
    pages/                      containers: read params/session, load data, compose components. No large markup or inline logic.
    layouts/Layout.astro        page shell, composed from shell components
    components/
      ui/                       presentational building blocks, props + slots only, no data access
      shell/                    site-wide: SiteHeader, DemoBanner, FlashMessages, AppDialog, FormSwap
    features/
      catalog/components/       public catalog: cards, grid with search, filters, title hero
      routes/components/        public routes: route cards, Tracker, start/leave button
      progress/components/      Mi progreso: stats, my routes, history, account form
      auth/components/          login and register forms
      admin/components/         admin home and AdminNav
      admin-titles/components/  catalog admin: titles table, cover editor, unit uploader, units list, unit forms, title data form, new-title screen parts
      admin-titles/scripts/     browser helpers for uploads (was src/scripts/admin-upload.ts)
      admin-routes/components/  routes admin: routes table, create form, route form, stage card, stage items, new stage form, stage picker
      admin-users/components/   users table
    lib/                        unchanged: data access, domain helpers, mock
    styles/
      global.css                only @imports, in layer order
      tokens.css, base.css, ui.css, shell.css + one partial per feature
  ```
- S3 (constraints): rendered output stays the same: identical CSS class names and DOM order, no new or removed text, same scripts' behaviour. Components receive data through props; only pages (and API routes) call Supabase or lib data functions. A component's browser script lives in that component. Identifiers and comments in English; UI copy unchanged.

## Tasks

| ID | Specs | Route | Status | Commit |
|----|-------|-------|--------|--------|
| T1 | S1–S3 | delegated (foundation: ui/, shell/, AdminNav, Layout, styles split) | pending | |
| T2 | S1–S3 | delegated, parallel (admin-routes) | pending | |
| T3 | S1–S3 | delegated, parallel (admin-titles) | pending | |
| T4 | S1–S3 | delegated, parallel (public pages, progress, auth, admin home, users) | pending | |

Route evidence: Writer trigger (a) parallel units T2–T4 with disjoint edit surfaces after the shared foundation T1, and (b) the long-session context backstop. The parent owns git, the pixel diff and the end-to-end checks.

## Log

- L1 (2026-10-13, user, verbatim): "componetiza cada elemento bien y bien ordenado porfavoer"
- L2: Baseline: 28 screenshots captured from the user's dev server (4321) as the demo admin. A second capture with no code change differed by 0 pixels on every page.
