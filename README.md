# Scheduler — ETL Console frontend

**This repository holds two applications, not one.** A rewrite is in progress, and both trees are live at the same time.

| | `src/` | `next/` |
|---|---|---|
| Stack | Angular 8, Webpack 4, Node 14 | Angular 22, standalone components, signals, Tailwind CSS 4 |
| Tests | none | vitest, 31 spec files, 445 tests |
| Built by | `webpack.config.js` | Angular CLI (`next/angular.json`) |
| Deployed | **yes** — this is what the Docker image ships | not yet — no Dockerfile, no compose service |
| Status | superseded, reference only | **where the work is** |

`next/` is the replacement for `src/`, not a second product. Almost every recent commit touches `next/src`.

## Which one do I work in?

`next/`. Treat `src/` as read-only — it is the reference for what the rewrite still has to carry over, and the source of truth for how a feature used to behave.

The per-feature migration status lives in [`../.ai/discovery/features.md`](../.ai/discovery/features.md). Before starting on a feature, read its grooming and synthesis documents in [`../.ai/`](../.ai/).

## Running

**New app (`next/`)** — the one you want:

```bash
cd next && npm install && ng serve
```

`http://localhost:4200`. It expects the backend at `http://localhost:9098/api/v1` (see `next/src/app/core/api/api.config.ts`), so start `process/` first.

Tests:

```bash
cd next && npx ng test --watch=false
```

Note this runs **vitest**, not Karma — via the `@angular/build:unit-test` builder. Run it through `ng test`; a bare `npx vitest` skips the Angular compiler plugin and produces dozens of failures that are not real.

**Old app (`src/`)** — only if you need to compare behaviour:

```bash
docker-compose up -d
```

`http://localhost/scheduler/` — **not** `http://localhost/`. See [DEPLOYMENT.md](DEPLOYMENT.md).

## Layout of `next/`

```
next/src/app/
├── core/        auth (service, guard, interceptor), api, socket, theme
├── shared/      ui primitives, charts, test helpers
└── features/    20 feature folders — admin, jobs, tasks, queue, reports,
                 settings, tenant-request, tools, ai, profile, …
```

Routing is in `next/src/app/app.routes.ts`; each route lazy-loads a standalone component.

## Note

`package.json` declares `repository.url` as `.../scheduler`, while this checkout's actual remote is `.../scheduler1.git`. Harmless, but it misleads anyone who follows it.
