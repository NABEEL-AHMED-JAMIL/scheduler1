# ETL Console — frontend (Angular 22)

The ETL Console. It replaced the Angular 8 console that lived in `../src`, which was retired and removed in 2026-09 (MIG-260); this is the only frontend.

What it holds as of 2026-10-07 is summarised under [What the console has](#what-the-console-has-as-of-2026-10-07).

## Running

```bash
npm install
ng serve
```

`http://localhost:4200`. The backend must be running: the app calls `http://<hostname>:9098/api/v1` (the API gateway), set in `src/app/core/api/api.config.ts`. Every service is started from etl-platform (`../../etl-platform`: `scripts/up.sh`, `scripts/deploy.sh <service>`), where the console itself runs as `next-app`.

### In Docker

```bash
docker compose up -d --build
```

`http://localhost:4400/` — 4400, not 4200: it's the port the backend's `app.console.url` default and `WEBSOCKET_ALLOWED_ORIGINS` already assume (email links, websocket CORS), see `docker-compose.yml`. `API_BASE` is derived from `window.location.hostname` at build-independent runtime, so the container needs no environment variable or build arg to find the backend — it only has to be reachable at the same hostname on `:9098`.

```bash
curl http://localhost:4400/health   # → 200 OK
```

Full detail, including the two build gotchas specific to the newer Angular builder (`dist/next/browser/`, not `dist/next/`; SPA fallback for path-based routing), is in [`../DEPLOYMENT.md`](../DEPLOYMENT.md).

## Tests

```bash
npx ng test --watch=false
```

355 spec files (2026-10-07).

**Run them through `ng test`, not `npx vitest`.** The `test` target uses the `@angular/build:unit-test` builder, which is what applies the Angular compiler plugin. Running vitest directly leaves components uncompiled and produces a screenful of `Cannot read properties of null (reading 'ngModule')` failures that have nothing to do with your change.

### End-to-end (Playwright)

`e2e/` holds the Playwright suite (36 specs, Chromium), run against a running console and backend:

```bash
npx playwright install chromium   # once
E2E_MINT=1 npx playwright test    # or: npx playwright test e2e/inbox.spec.ts
```

- **Who it signs in as.** No password is ever in the repository. `E2E_PASSWORD` (with `E2E_USERNAME`) signs in through the API; without it, `E2E_TENANT_ADMIN_TOKEN` or `E2E_MINT=1` uses a minted test token (etl-platform's `scripts/mint-test-token.sh`, development stacks only) for the rebuilt workspace's administrator. With none of them the specs skip and say why.
- **Fixtures.** Workspaces, people, pipelines, schedules and dashboards come from the platform rebuild's state file, `etl-platform/.state/demo/rebuild.json` (`e2e/support/fixtures.ts`; another file with `E2E_FIXTURES`). Specs name a role, never an id, and only read the rebuilt rows; what a spec makes for itself is named "E2E ..." . Without the file, the specs that need it skip, naming it.
- **Where.** `E2E_BASE_URL` (default `http://localhost:4400`) and `E2E_API_URL` (default `http://localhost:9098/api/v1`). The sales demo's paths are opt-in with `E2E_DEMO=1`.

The backend's own end-to-end suites drive the HTTP API through the real security chain.

## Build

```bash
ng build
```

Output goes to `dist/next/`.

The initial bundle is 537.63 kB against the 500 kB warning budget in `angular.json` (etl-platform `docs/reviews/code-review-2026-10-07.md`; a board card covers getting it under 500 kB). The Analytics route chunk is 186.54 kB: CodeMirror is its own chunk (about 450 kB), fetched only when a SQL box draws, and ECharts loads in its own lazy chunk when a chart first draws.

## Layout

```
src/app/
├── core/
│   ├── api/       API base URL and HTTP plumbing
│   ├── auth/      auth service, route guard, HTTP interceptor (each with specs)
│   ├── socket/    job-events websocket (@stomp/stompjs)
│   └── theme.service.ts
├── shared/
│   ├── ui/        avatar, status pill, view toggle, markdown, topic, dictation…
│   ├── charts/    the SVG chart kinds, the chart type scale (chart-type.ts) and echart/ (the ECharts host, themes)
│   └── testing/   test helpers, e.g. memory storage for vitest's partial localStorage
└── features/      admin, ai, analytics, ask-data, billing, bulk, catalog,
                   dashboard, developer, docs, documents, embed, forms,
                   integration, jobs, queue, reports, settings, tasks,
                   workflows, tools, profile, notifications, objects,
                   tenant-request, shell, login, landing, …
```

Routing is in `src/app/app.routes.ts`; every route lazy-loads a standalone component, and authenticated routes sit behind the guard in `src/app/core/auth`.

## What the console has (as of 2026-10-07)

- **Charts.** 51 chart kinds for dashboards and Analytics Studio: 19 drawn as SVG and 32 with ECharts (`src/app/features/analytics/widget-kinds.ts`: `KINDS`, `ECHART_KIND_IDS`). Each kind declares what it needs and has a fit rule (`charts/chart-fit.ts`); a kind that cannot draw a result stays listed, dimmed, with the reason. Chart settings and themes: the console's own theme (from the design tokens, following light/dark) and nine named palettes from ECharts' theme files; a board has a theme (analytics-service's `dashboard_config`) and a widget may override it. A tile's **Show as** menu is a grid of chart glyphs with a search and "Suggested for this data" (`charts/kind-menu.ts`). Every chart's text uses one type scale, 11, 12 and 14 px, figures aside (`shared/charts/chart-type.ts`). A click on a mark narrows the board.
- **Task inbox** (`/workflows/inbox`): a mail-client layout -- tabs with totals (Waiting for me, My groups, Done, My requests), a searchable list beside the open task, each pane scrolling on its own; the lists page by cursor, 100 at a time, with Load more, and Search all asks the service.
- **Workflow designer** (`/workflows/designer`): the inbox's two-pane layout -- a searchable list grouped under Built in and This workspace, then the workflow's tabs with canvas and properties side by side.
- **Reliability** (Administration › Reliability): a status card per objective (pipeline runs, billing) with the error budget left, one plain alert line per objective, full-width charts, meters with problems first, the burn-rate table behind For engineers.
- **Customer API** (Integration): API Clients (scopes, secrets shown once, rate limits, the frame allow-list, sandbox test keys), webhooks with their delivery log and Send again, event routes, and API limits and the month's calls against the quota (platform bounds per tenant in Administration › Tenants). The **developer portal** at `/integration/developer` (API reference, guides, event and problem types, changelog, OpenAPI and Postman downloads), bundled at build time by `scripts/sync-developer-docs.mjs` from etl-platform's `docs/api/`. The **embedded run view** at `/embed/runs/:token`, outside the shell, for a customer's portal to frame.
- **API editor**: paging modes `NEXT_URL` ("Next URL in the answer") and `OFFSET`, besides PAGE, CURSOR and LINK, checked before saving.
- **Billing.** Pay now on an issued, unpaid invoice goes to Stripe's hosted Checkout page (no card data passes through the console); card payment chips and "Paid by card on"; the platform's payments on Billing analytics. Cost & usage and the invoice count days in the workspace's billing time zone ("days in America/Chicago"; the invoice period states its zone), set by a platform administrator in Administration › Tenants › Billing time zone. Lines priced from the default card say so; API lines show each client's share.
- **Data Catalog** (`/data/catalog`, platform files hidden unless an administrator shows them), **Connector Hub** (`/integration/connectors`) and **Forms** (builder, fill, Submissions, share by link at `/f/:token`).
- **Tablets.** Below 1024 px, list/detail pages (Task inbox, Model connections, Invoices, Kafka) show one pane: the list at full width, the item opened over it with Back to list (`shared/ui/one-pane`). Table toolbars fit beside the heading or wrap as one group.

## Conventions

- **Standalone components** with `imports: [...]` — no NgModules.
- **Signals** for component state; `@if` / `@for` control flow, not `*ngIf` / `*ngFor`.
- **Tailwind 4** with design tokens. Both dark and light mode are supported and both must be checked before a feature is called done.
- **Authorization in this app is presentation, not enforcement.** A hidden button is a convenience; the rule that matters is on the server. Never treat a guard here as a security control.

## Working on a feature

Read [`../../.ai/README.md`](../../.ai/README.md) first. The short version: a feature has a grooming document and a synthesis document before anyone writes code, and acceptance criteria that can be checked by someone who did not write them.
