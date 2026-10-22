# ─────────────────────────────────────────────
# Stage 1: Build
# Angular 22 — the esbuild-based `@angular/build:application` builder, which needs Node
# ^22.22.3 || ^24.15.0 || >=26.0.0 (node_modules/@angular/cli/package.json engines). 22-alpine
# is the LTS branch inside that range; nothing here needs a native compiler (no node-sass,
# sharp, canvas or the like), so alpine's smaller image is not a build risk.
# ─────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Dependencies before source, so this layer only re-runs when package*.json actually changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Production config is the project default (angular.json: "defaultConfiguration": "production"),
# stated explicitly here so the image does not silently change behaviour if that default moves.
RUN npx ng build --configuration production

# MIG-323 S6: the Content-Security-Policy for this very build (its inline scripts by hash). CSP_MODE: enforce, or report
# to send it as Content-Security-Policy-Report-Only.
ARG CSP_MODE=report
RUN node scripts/csp.mjs dist/next/browser/index.html "$CSP_MODE" > dist/csp.conf

# ─────────────────────────────────────────────
# Stage 2: Serve with Nginx
#
# The build has no server.ts and an empty prerendered-routes.json -- this is a plain static SPA,
# not an SSR build, so a plain file server is the whole runtime. The `@angular/build:application`
# builder writes to dist/next/browser/, not dist/next/ itself; copying the wrong one serves an
# empty directory that 403s on every request, which is the single easiest mistake to make here.
#
# nginx 1.30, the current stable line (vulnerabilities review 2026-10-13, group B): 1.27 was a mainline branch and is
# end of life, with no more fixes. nginx.conf needs nothing new for it (gzip, the SPA fallback, the cache headers and
# the embed's auth_request are all in the official image's build).
# ─────────────────────────────────────────────
FROM nginx:1.30-alpine AS production

RUN rm -rf /usr/share/nginx/html/*
COPY --from=builder /app/dist/next/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist/csp.conf /etc/nginx/csp.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
