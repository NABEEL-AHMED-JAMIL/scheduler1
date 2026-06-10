# Deployment Instructions

This repository is built with Webpack and served via Nginx in Docker.

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

## Verify deployment

Open the app in a browser:

```bash
http://localhost/
```

## Rebuild after code changes

If you change source code, assets, or webpack configuration, rebuild and restart:

```bash
docker-compose build --no-cache

docker-compose up -d
```

## Notes

- The build stage compiles the Angular app and copies the generated `dist/` output into the Nginx image.
- The deployed app is served from `dist/`.
- If browsers cache an old bundle, use a hard refresh or open in a private window.
