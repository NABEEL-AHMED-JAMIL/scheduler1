# Deployment Instructions

The console is `next/` (Angular 22). On the platform it is deployed by etl-platform (`scripts/deploy.sh next-app`); the steps below are the standalone equivalent.

```bash
cd next
docker compose build --no-cache
docker compose up -d
```

The `next-app` service builds `next/Dockerfile` target `production` and publishes `4400:80`.

## Verify deployment

```
http://localhost:4400/
```

Serves at the document root. Port 4400 is not arbitrary: the backend's `WEBSOCKET_ALLOWED_ORIGINS` and `app.console.url` defaults both already assume the console lives here — outgoing email links depend on it.

The API is not proxied. `src/app/core/api/api.config.ts` derives `API_BASE` from `window.location.hostname` at runtime and fixes the port to `9098` (the API gateway), so the bundle works unmodified wherever it's served, as long as the gateway is reachable at the same hostname on `9098`. Nothing in the frontend build needs to know where the backend is.

```bash
curl http://localhost:4400/health          # → 200 OK
```

## Rebuild after code changes

```bash
cd next
docker compose build --no-cache
docker compose up -d
```

## Notes

- The build stage is `node:22-alpine` running `ng build --configuration production`; the runtime stage is `nginx:1.27-alpine`.
- **The build output is `dist/next/browser/`, not `dist/next/`.** The `@angular/build:application` builder (Angular 17+) nests the deployable output one level deeper than the older webpack-based builder did — copying `dist/next/` serves an empty directory that 403s on every request. `next/Dockerfile` copies the right path; if you ever hand-roll a build, check this first.
- Routing is path-based (`provideRouter` with no `withHashLocation()`), so `next/nginx.conf` falls back every unmatched path to `index.html` — a deep link or a browser refresh on `/admin/users` has to reach the router, not 404 at nginx.
- `--no-cache` is deliberate: without it, a rebuild can silently reuse a layer holding the previous bundle, and you deploy code you did not build. After a deploy, check the container's `Created` time.
- The older webpack console (`scheduler1-app`, `http://localhost/scheduler/`) was retired on 2026-09-24 and removed from this repository (MIG-260); nothing deploys it any more.
