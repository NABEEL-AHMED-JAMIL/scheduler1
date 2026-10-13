# Scheduler — ETL Console frontend

**Running the platform:** every service, its settings and its secrets are started from [etl-platform](https://github.com/NABEEL-AHMED-JAMIL/etl-platform) (`../etl-platform`): `scripts/up.sh`, `scripts/deploy.sh <service>`, `scripts/verify.sh`. The console runs there as `next-app`; `next/docker-compose.yml` still works for standalone development, but it does not configure the running container -- change `etl-platform/config/` instead.

The console is the Angular 22 application in [`next/`](next/): standalone components, signals, Tailwind CSS 4, vitest.

The older console (Angular 8, Webpack 4, served at `http://localhost/scheduler/` by the `scheduler1-app` container) was retired by the owner on 2026-09-24 and its source was removed from this repository (MIG-260). It is still in the git history: the last commit that has it is `e786935`, and `git show e786935:src/app/...` reads any file of it.

## Running

```bash
cd next && npm install && ng serve
```

`http://localhost:4200`. It expects the backend at `http://localhost:9098/api/v1` (the API gateway; see `next/src/app/core/api/api.config.ts`).

To run it in Docker instead — the way it deploys — see [DEPLOYMENT.md](DEPLOYMENT.md). Briefly: `cd next && docker compose up -d --build`, then `http://localhost:4400/`. 4400, not 4200 — that port is what the backend's `app.console.url` default and `WEBSOCKET_ALLOWED_ORIGINS` already assume.

Tests:

```bash
cd next && npx ng test --watch=false
```

Note this runs **vitest**, not Karma — via the `@angular/build:unit-test` builder. Run it through `ng test`; a bare `npx vitest` skips the Angular compiler plugin and produces dozens of failures that are not real.

## Layout of `next/`

```
next/src/app/
├── core/        auth (service, guard, interceptor), api, socket, theme
├── shared/      ui primitives, charts, test helpers
└── features/    feature folders — admin, jobs, tasks, queue, reports,
                 settings, tenant-request, tools, ai, profile, …
```

Routing is in `next/src/app/app.routes.ts`; each route lazy-loads a standalone component.

The per-feature notes live in [`../.ai/discovery/features.md`](../.ai/discovery/features.md). Before starting on a feature, read its grooming and synthesis documents in [`../.ai/`](../.ai/).

## Menu, tab hubs and shared page pieces (2026-10-12)

The tables (hubs and their tabs, what each role sees) are in
[`../etl-platform/docs/reviews/ux-grouping-review-2026-10-12.md`](../etl-platform/docs/reviews/ux-grouping-review-2026-10-12.md), "Tab hubs".

- **One menu tree.** `next/src/app/core/nav/nav-tree.ts` is the one source for the menu's groups, its entries, every hub,
  its tabs, their page keys and least roles, and the breadcrumbs (group › hub › tab). The menu went from 52 entries to 18.
  Home, AI Assistant, Approval workflows, Review inbox, Document review and Dashboards stay entries of their own.
- **Tab hubs.** `next/src/app/shared/ui/tab-hub.ts` draws a hub's tab strip under the page header. Each tab is its own
  route with its own address, page key, guard and lazy chunk; `app.routes.spec.ts` holds every tab's guard to what the
  tab asks. A reader sees the tabs they may open: one tab is that page alone, with no strip; none takes the hub off the
  menu, and its address answers the 403 page. `next/src/app/core/nav/nav-access.ts` answers who sees what, the same way for the
  menu, the strip and a hub's address (`toFirstTab`).
- **Old addresses redirect** (`moved(...)` in `app.routes.ts`) straight to the new tab, so bookmarks and links keep
  working and a hidden tab's old address still lands on its guard.
- **Page header.** `next/src/app/shared/ui/page-header.ts` is every page's header: a breadcrumb row from the menu tree (it
  replaces "Back to ..." links), the title (the object's name on a detail page), pills, and the actions in a fixed order
  (Refresh, secondary, the ⋮ overflow, the one primary button rightmost).
- **Side panels open on the right.** `sidePanelConfig(data, width, 'right')` (`next/src/app/shared/ui/side-panel.ts`)
  opens a row's detail full height on the right, over a scrim; Escape closes it. Pickers and forms stay centred.
- **Flow drawing.** `next/src/app/shared/flow-graph/` is one dependency-free SVG renderer (`flow-graph.ts`, layout in
  `flow-graph.model.ts`) for the Pipeline and Workflow designers, the AI Assistant's designed flow and a run's map.
  `flow-adapters.ts` turns each source into the same nodes and edges.
- **Developer portal content.** `node next/scripts/sync-developer-docs.mjs` copies the customer API's contract from
  `../etl-platform/docs/api` into the console (`src/app/features/developer/content/developer-docs.generated.json`, and
  the OpenAPI and Postman files under `public/developer/`). Run it by hand when the contract changes;
  `developer-docs.spec.ts` fails until you do.
