# Deployment Instructions

This repository ships **two** applications, each with its own Docker setup. `next/` is where active development happens; `src/` (root) is the legacy app still in production behind it.

---

## `next/` — the new app (Angular 22)

```bash
cd next
docker compose build --no-cache
docker compose up -d
```

The `next-app` service builds `next/Dockerfile` target `production` and publishes `4400:80`.

### Verify deployment

```
http://localhost:4400/
```

Serves at the document root — unlike the legacy app, nothing is nested under a subpath. Port 4400 is not arbitrary: `process/docker-compose.yml`'s `WEBSOCKET_ALLOWED_ORIGINS` default and the backend's `app.console.url` default (`AppUserServiceImpl`, `TenantRequestServiceImpl`) both already assume the console lives here — outgoing email links depend on it.

The API is not proxied. `src/app/core/api/api.config.ts` derives `API_BASE` from `window.location.hostname` at runtime and fixes the port to `9098`, so the bundle works unmodified wherever it's served, as long as the backend is reachable at the same hostname on `9098`. Nothing in the frontend build needs to know where the backend is.

```bash
curl http://localhost:4400/health          # → 200 OK
```

### Rebuild after code changes

```bash
cd next
docker compose build --no-cache
docker compose up -d
```

### Notes

- The build stage is `node:22-alpine` running `ng build --configuration production`; the runtime stage is `nginx:1.27-alpine`.
- **The build output is `dist/next/browser/`, not `dist/next/`.** The `@angular/build:application` builder (Angular 17+) nests the deployable output one level deeper than the older webpack-based builder did — copying `dist/next/` serves an empty directory that 403s on every request. `next/Dockerfile` copies the right path; if you ever hand-roll a build, check this first.
- Routing is path-based (`provideRouter` with no `withHashLocation()`), so `next/nginx.conf` falls back every unmatched path to `index.html` — a deep link or a browser refresh on `/admin/users` has to reach the router, not 404 at nginx.
- `--no-cache` is deliberate, for the same reason as the legacy app below: without it, a rebuild can silently reuse a layer holding the previous bundle.

---

## `src/` — the legacy app (Angular 8), at the repository root

```bash
# from scheduler1/
docker-compose build --no-cache
docker-compose up -d
```

The `angular-app` service builds `Dockerfile` target `production` and publishes `80:80`.

### Verify deployment

```
http://localhost/scheduler/
```

**Not `http://localhost/`.** The Dockerfile clears `/usr/share/nginx/html/` and copies the build into `/usr/share/nginx/html/scheduler`, and `nginx.conf` serves the app from `location /scheduler/`. Nothing is left at the document root, so `/` has no `index.html` to fall back to and returns a 403. There is a `location = /scheduler` redirect in front of the trailing-slash form, so `http://localhost/scheduler` also works.

#### Health check

```bash
curl http://localhost/health          # → 200 OK
curl http://localhost/scheduler/health
```

Both are served by nginx and return `200 OK` without touching the app. The container's own `HEALTHCHECK` uses the first (`wget -qO- http://127.0.0.1/health`), as does the compose healthcheck, so a container reporting unhealthy means nginx did not start — it says nothing about whether the Angular bundle is good.

### Rebuild after code changes

If you change source code, assets, or webpack configuration, rebuild and restart:

```bash
docker-compose build --no-cache

docker-compose up -d
```

### Notes

- The build stage runs `./node_modules/.bin/webpack --mode production` on Node 14, then stage 2 copies the output into `nginx:1.27-alpine`.
- The deployed app is served from `dist/`, published under `/scheduler/`.
- If browsers cache an old bundle, use a hard refresh or open in a private window.
- `--no-cache` is deliberate. Without it Docker will happily reuse a layer containing the previous bundle, and you will deploy code you did not build — verify what shipped rather than trusting the build output.
