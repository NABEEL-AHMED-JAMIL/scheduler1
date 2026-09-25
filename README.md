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
