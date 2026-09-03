# ETL Console — frontend (Angular 22)

The rewrite of `../src` (Angular 8). Same backend, new application. Feature parity is being reached **one feature at a time** — see [`../../.ai/discovery/features.md`](../../.ai/discovery/features.md) for what has made the crossing and what has not.

## Running

```bash
npm install
ng serve
```

`http://localhost:4200`. The backend must be running: the app calls `http://<hostname>:9098/api/v1`, set in `src/app/core/api/api.config.ts`. Start it from `../../process` with `docker-compose up -d`.

## Tests

```bash
npx ng test --watch=false
```

31 spec files, 445 tests.

**Run them through `ng test`, not `npx vitest`.** The `test` target uses the `@angular/build:unit-test` builder, which is what applies the Angular compiler plugin. Running vitest directly leaves components uncompiled and produces a screenful of `Cannot read properties of null (reading 'ngModule')` failures that have nothing to do with your change.

There is no e2e builder configured. End-to-end coverage currently lives in the backend's suite (`../../process/run-e2e.sh`), which drives the real HTTP API through the real security chain.

## Build

```bash
ng build
```

Output goes to `dist/next/`.

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
│   ├── charts/    bar chart and friends (ECharts)
│   └── testing/   test helpers, e.g. memory storage for vitest's partial localStorage
└── features/      20 folders: admin (users, tenants, storage, settings),
                   jobs, queue, tasks, forms, settings (kafka, task-types,
                   lookup, dynamic-forms), ai (agents, models), tools
                   (converter, transcript, cleaner, query), reports, profile,
                   notifications, tenant-request, bulk, objects, dashboard,
                   shell, login, landing, docs, unauthorized
```

Routing is in `src/app/app.routes.ts`; every route lazy-loads a standalone component, and authenticated routes sit behind the guard in `src/app/core/auth`.

## Conventions

- **Standalone components** with `imports: [...]` — no NgModules.
- **Signals** for component state; `@if` / `@for` control flow, not `*ngIf` / `*ngFor`.
- **Tailwind 4** with design tokens. Both dark and light mode are supported and both must be checked before a feature is called done.
- **Authorization in this app is presentation, not enforcement.** A hidden button is a convenience; the rule that matters is on the server. Never treat a guard here as a security control.

## Working on a feature

Read [`../../.ai/README.md`](../../.ai/README.md) first. The short version: a feature has a grooming document and a synthesis document before anyone writes code, and acceptance criteria that can be checked by someone who did not write them.
