# ─────────────────────────────────────────────
# Stage 1: Build
# Angular 8 + Webpack 4 — Node 14 Bullseye
# ─────────────────────────────────────────────
FROM node:14-bullseye-slim AS builder

WORKDIR /app

# Required for native module compilation
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./

# Install deps + copy-webpack-plugin v5 (compatible with Webpack 4)
RUN npm install --legacy-peer-deps && \
    npm install --legacy-peer-deps copy-webpack-plugin@5

COPY . .

# Remove any dist files copied from the host workspace to avoid stale bundles.
RUN rm -rf dist

# Patch sockjs-client broken unicode regex (if present)
RUN node patch.js || true

# Build
RUN ./node_modules/.bin/webpack --mode production

# Post-build: fix regex character classes in emitted bundles to avoid
# 'Range out of order in character class' due to literal Unicode characters
RUN node patch_dist.js || true

# ─────────────────────────────────────────────
# Stage 2: Serve with Nginx
# ─────────────────────────────────────────────
FROM nginx:1.27-alpine AS production

RUN rm -rf /usr/share/nginx/html/*

COPY --from=builder /app/dist /usr/share/nginx/html/scheduler

COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
