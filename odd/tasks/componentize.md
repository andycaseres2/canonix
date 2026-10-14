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
| T1 | S1–S3 | delegated (foundation: ui/, shell/, AdminNav, Layout, styles split) | done | 75a100d |
| T2 | S1–S3 | delegated, parallel (admin-routes) | done | 4e461c6 |
| T3 | S1–S3 | delegated, parallel (admin-titles) | done | c897b44 (shared with T4: a failed pathspec folded T3 into that commit) |
| T4 | S1–S3 | delegated, parallel (public pages, progress, auth, admin home, users) | done | c897b44 |

Route evidence: Writer trigger (a) parallel units T2–T4 with disjoint edit surfaces after the shared foundation T1, and (b) the long-session context backstop. The parent owns git, the pixel diff and the end-to-end checks.

## Log

- L1 (2026-10-13, user, verbatim): "componetiza cada elemento bien y bien ordenado porfavoer"
- L2: Baseline: 28 screenshots captured from the user's dev server (4321) as the demo admin. A second capture with no code change differed by 0 pixels on every page.
- L3: Seam check by the parent after T2–T4: every writer stayed inside its surface; vitest 122/122; astro check 0 errors, 0 warnings (145 files); the 28 screenshots differ from the baseline by 0 pixels. Chrome end to end after the refactor: route editor in place (stage create/update/delete with the dialog, picker adds 2 in order, item move, delete route navigates), title chip remove, users plan change, Iniciar ruta, cover upload twice, unit upload twice, hidden queue, alert without Cancel, catalog search, and the full new-title flow ("Anime creado con todo subido.", 2 of 2 with file, cover). Page sizes went down, e.g. admin/rutas/[id] 216→45 lines, admin/media/nuevo 208→12, admin/media/[id] 204→55.
- L4: Promotion candidates noted by the writers (not done, no duplication harm yet): KindBadge to ui/, a shared "filter list by data-s" script for catalog and users, CreateStep, a Field hint slot to avoid quote escaping.
- L5 (2026-10-13, user, verbatim): "haz las 4 mejoras pendientes". Done on branch refactor/ui-promotions: (1) KindBadge moved to components/ui (admin titles table keeps its raw kind badge to avoid a visible text change); (2) one delegated list filter, components/shell/ListFilter + list-filter.ts (unit tested), driven by `input[data-filter]`, replaces three copies (catalog, users, admin titles) and now survives in-place updates; (3) CreateStep promoted to components/ui/NumberedStep with its CSS in ui.css; (4) ui/Field has a `hint` slot, used by the two hand-written labels with quotes. Evidence: vitest 125/125, astro check 0/0, 28 screenshots 0 px vs a fresh baseline, Chrome filters 68→1 (catalog), 68→2 (admin titles), 3→1 (users, also after an in-place update).
