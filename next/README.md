# ETL Console — frontend (Angular 22)

The ETL Console. It replaced the Angular 8 console that lived in `../src`, which was retired and removed in 2026-09 (MIG-260); this is the only frontend.

What it holds as of 2026-10-13 is summarised under [What the console has](#what-the-console-has-as-of-2026-10-13).

## Running

The running console is etl-platform's `next-app` container, at `http://localhost:4400/`. Every service, the console
included, is started and deployed from etl-platform (`../../etl-platform`): `scripts/up.sh` brings the platform up, and
after a change is pushed

```bash
cd ../../etl-platform && scripts/deploy.sh next-app
```

builds the console from this repository's pulled main checkout and replaces the container (check its health,
RestartCount and Created time afterwards). Its settings live in `etl-platform/config/`, not here.

For development against that platform:

```bash
npm install
ng serve
```

`http://localhost:4200`. The app calls `http://<hostname>:9098/api/v1` (the API gateway), set in
`src/app/core/api/api.config.ts`; `API_BASE` follows `window.location.hostname`, so neither the dev server nor the
container needs an environment variable to find the backend.

```bash
curl http://localhost:4400/health   # → 200 OK
```

`docker-compose.yml` here still builds the image on its own for standalone work, but it does not configure the running
container. The build's two gotchas (`dist/next/browser/`, not `dist/next/`; SPA fallback for path-based routing) are in
[`../DEPLOYMENT.md`](../DEPLOYMENT.md). 4400, not 4200, is the port the backend's `app.console.url` default and
`WEBSOCKET_ALLOWED_ORIGINS` assume (email links, websocket CORS).

## Tests

```bash
npx ng test --watch=false
```

413 spec files (2026-10-13).

**Run them through `ng test`, not `npx vitest`.** The `test` target uses the `@angular/build:unit-test` builder, which is what applies the Angular compiler plugin. Running vitest directly leaves components uncompiled and produces a screenful of `Cannot read properties of null (reading 'ngModule')` failures that have nothing to do with your change.

### End-to-end (Playwright)

`e2e/` holds the Playwright suite (40 specs, Chromium), run against a running console and backend:

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

## What the console has (as of 2026-10-13)

The menu follows the user's job (UX review 2026-10-12): **Home · Get data in · Build · Run & review · See results ·
Administration & billing**, and **Platform** for platform administrators. `src/app/core/nav/nav-tree.ts` holds every
group, hub and tab; the paths below are today's (old addresses redirect).

- **Get data in.** Connections (`/connections`: Connectors, Storage, Databases, API collections, Sources, Data
  contracts), Documents (`/documents`: Documents in, Document types, Datasets, Email-in, File drop) and Forms (builder,
  Submissions, share by link at `/f/:token`). A new connection is a stepper in a side panel: Connector, Credentials,
  Tables, Sync, Schedule. An API collection's page keeps its versions under a History tab.
- **Build.** Pipelines (`/pipelines/list`, Schedules & triggers, Prompts), the AI Assistant (`/ai/assistant`: a
  pipeline described in words is drawn step by step, then Create pipeline; a MANAGED workspace sees the managed banner
  and no Create pipeline) and Approval workflows (`/workflows/designer`). A schedule's assistant
  (`/pipelines/schedules/:id/assistant`) uses the same chat composer as the AI Assistant and Ask your data.
- **Run & review.** Runs (`/runs`: Latest, By date, Analytics), the Review inbox (`/workflows/inbox`, a mail-client
  layout with Waiting for me, My groups, Done, My requests, and an administrator's runs waiting for review) and Document
  review (`/documents/review`, a document beside its fields and line items).
- **See results.** Dashboards (`/data/analytics/dashboards`: 51 chart kinds, 19 SVG and 32 ECharts, each with a fit
  rule; favourites first, grouped by the pipeline that feeds them), Ask your data (`/data/ask`: answers with sources or
  the query they ran, a chart answer pinned to a dashboard; the viewer's recent questions and pinned answers are kept in
  their browser), Analytics Studio, the Data Catalog, Generated reports (`/data/reports`), Files (`/data/files`) and
  the tools: Document Converter (`/tools/converter`; its "PDF from a dataset" is Generated reports' button of the same
  name) and Audio Transcript.
- **Administration & billing.** Users, Page access, Sign-in security, Data policies, Activity; Billing (Cost & usage by
  day, pipeline and run, in the workspace's billing time zone; Invoices with Pay now on Stripe's hosted page and the
  payments side panel; Billing documents; Analytics -- cost by month, service and pipeline, a workspace administrator's own and
  the platform's every workspace with its revenue; Settings -- the rate cards, platform only); Settings (Model connections, Tool Registry, Task Registry, Kafka & Topics,
  Configuration values, Home pages, Task groups); Developers (API Clients with scopes, webhooks, event routes and API
  limits, and the Developer portal at `/developers/portal`, bundled by `scripts/sync-developer-docs.mjs` from
  etl-platform's `docs/api/`). The embedded run view at `/embed/runs/:token` sits outside the shell for a customer's
  portal to frame.
- **Platform.** Workspaces (`/platform/workspaces`: tiles and a table of each workspace's users, pipelines, runs this
  month, storage, cost this month, alerts open and plan, with every action in the row's ⋮ -- "Work in this workspace" first,
  API limits, Billing time zone), Requests, Managed service, Staff activity, Service health (status, version, restarts,
  error rate, planned deploys, alerts, then the objectives), Engine settings (the allow-listed limits: ranges, defaults,
  reset, history, a workspace's own values). Owner #20-#24 (2026-10-19) removed Work in a workspace, Reliability, Billing
  analytics and Rate cards as Platform pages; their addresses redirect (`removed-pages.spec.ts` holds that nothing else
  names them).
- **The workspace selector.** One component for a platform administrator, `app-workspace-select`
  (`shared/ui/workspace-select.ts` over `core/workspaces/workspace-directory.ts`): first in the page header's actions on every
  screen that picks a workspace, "All workspaces" only where the page can show them all, the recent ones first, the choice
  kept for the session, and "Work in this workspace" beside it. A workspace's own people never see it.
- **Shared page pieces.** `app-page-header` (breadcrumb, title, pills, actions in a fixed order with the primary
  rightmost), `app-section`, the field grid, `app-actions-bar`, `app-table-shell` (heading, then the filters, Columns at
  the right; numbers right-aligned), `app-stat-strip`, `app-empty-state` and `app-side-panel` (a row's detail on the
  right). Light and dark; 1920/2560 and 1187/1024/768 wide. Below 1024 px a list/detail page shows one pane at a time.

## Conventions

- **Standalone components** with `imports: [...]` — no NgModules.
- **Signals** for component state; `@if` / `@for` control flow, not `*ngIf` / `*ngFor`.
- **Tailwind 4** with design tokens. Both dark and light mode are supported and both must be checked before a feature is called done.
- **Authorization in this app is presentation, not enforcement.** A hidden button is a convenience; the rule that matters is on the server. Never treat a guard here as a security control.

## Working on a feature

Read [`../../.ai/README.md`](../../.ai/README.md) first. The short version: a feature has a grooming document and a synthesis document before anyone writes code, and acceptance criteria that can be checked by someone who did not write them.
