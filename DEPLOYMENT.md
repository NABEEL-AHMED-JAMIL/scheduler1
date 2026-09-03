# Deployment Instructions

> **Scope: the legacy `src/` application only** — Angular 8, built by Webpack 4 and served by nginx. This is what the Docker image in this repository ships.
>
> The `next/` application (Angular 22) has **no deployment path yet**: no Dockerfile, no compose service, no entry here. Adding one is outstanding work.

## Prerequisites

- Docker installed
- Docker Compose installed
- Access to the repository root directory

## Build and deploy

From the project root:

```bash
# Build the image from the current source and force a clean rebuild
docker-compose build --no-cache

# Start the container in detached mode
docker-compose up -d
```

The `angular-app` service builds `Dockerfile` target `production` and publishes `80:80`.

## Verify deployment

Open the app in a browser:

```
http://localhost/scheduler/
```

**Not `http://localhost/`.** The Dockerfile clears `/usr/share/nginx/html/` and copies the build into `/usr/share/nginx/html/scheduler`, and `nginx.conf` serves the app from `location /scheduler/`. Nothing is left at the document root, so `/` has no `index.html` to fall back to and returns a 404. There is a `location = /scheduler` redirect in front of the trailing-slash form, so `http://localhost/scheduler` also works.

### Health check

```bash
curl http://localhost/health          # → 200 OK
curl http://localhost/scheduler/health
```

Both are served by nginx and return `200 OK` without touching the app. The container's own `HEALTHCHECK` uses the first (`wget -qO- http://127.0.0.1/health`), as does the compose healthcheck, so a container reporting unhealthy means nginx did not start — it says nothing about whether the Angular bundle is good.

## Rebuild after code changes

If you change source code, assets, or webpack configuration, rebuild and restart:

```bash
docker-compose build --no-cache

docker-compose up -d
```

## Notes

- The build stage runs `./node_modules/.bin/webpack --mode production` on Node 14, then stage 2 copies the output into `nginx:1.27-alpine`.
- The deployed app is served from `dist/`, published under `/scheduler/`.
- If browsers cache an old bundle, use a hard refresh or open in a private window.
- `--no-cache` is deliberate. Without it Docker will happily reuse a layer containing the previous bundle, and you will deploy code you did not build — verify what shipped rather than trusting the build output.
