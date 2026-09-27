# syntax=docker/dockerfile:1

# Scavenger: build with Bun, run the Next.js standalone server on Node.
#
#   docker build -t scavenger --build-arg APP_NAME="Scavenger" .
#   docker run -d --init -p 127.0.0.1:3000:3000 -v scavenger-data:/data \
#     -e APP_URL=https://hunt.example.com scavenger
#
# See docs/DEPLOY.md.

ARG BUN_VERSION=1.4.2
ARG NODE_VERSION=22

# The Node.js binary for the build stage, from the same release line the app runs on.
FROM node:${NODE_VERSION}-slim AS nodejs

# ---------------------------------------------------------------------------
# Build: install dependencies with Bun and build the app.
# ---------------------------------------------------------------------------
FROM oven/bun:${BUN_VERSION} AS build
WORKDIR /app

# `next build` runs on Node, like production; Bun installs and runs the scripts.
COPY --from=nodejs /usr/local/bin/node /usr/local/bin/node

ENV NEXT_TELEMETRY_DISABLED=1
# Baked into the static offline page; every other page reads it at runtime.
ARG APP_NAME=Scavenger
ENV APP_NAME=${APP_NAME}

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
# Builds public/sw.js (service worker) and .next/standalone.
RUN bun run build

# ---------------------------------------------------------------------------
# Runtime: only the standalone server, static assets and migrations.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS runtime
WORKDIR /app

ARG APP_NAME=Scavenger
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    APP_NAME=${APP_NAME} \
    DATA_DIR=/data \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# The data folder belongs to the unprivileged user the server runs as. A new
# named volume copies this ownership.
RUN mkdir -p /data && chown node:node /data

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# SQL migrations, applied at startup from process.cwd()/drizzle (instrumentation.ts).
COPY --from=build --chown=node:node /app/drizzle ./drizzle
# Native libraries that libSQL and sharp load through computed paths, which output
# tracing can miss. Copying the whole scopes keeps the right platform build available.
COPY --from=build --chown=node:node /app/node_modules/@libsql ./node_modules/@libsql
COPY --from=build --chown=node:node /app/node_modules/@img ./node_modules/@img

USER node
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/robots.txt').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "server.js"]
