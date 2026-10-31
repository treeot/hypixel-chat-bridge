# syntax=docker/dockerfile:1
# One image, two apps: the bridge always runs; the dashboard runs only when DASHBOARD_ENABLED=true.
# scripts/start-combined.mjs supervises both. The dashboard build is always included, so enabling it
# later needs only an env var, no new service. Prefer the two-service split? Use dashboard/Dockerfile.
# No VOLUME instruction: Railway rejects it. Mount a Railway Volume at /app/data instead.

FROM node:22-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY dashboard/package.json dashboard/package-lock.json ./dashboard/
RUN cd dashboard && npm ci
COPY tsconfig.json index.ts ./
COPY src ./src
RUN npm run build
COPY dashboard ./dashboard
RUN cd dashboard && npm run build

FROM node:22-slim
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3100
WORKDIR /app
COPY package.json package-lock.json ./
# @napi-rs/canvas (image mode) is a regular dependency with prebuilt glibc binaries: no system cairo needed.
RUN npm ci --omit=dev && npm cache clean --force
# Heap cap for the bridge at runtime; set after npm ci so the install itself is not capped.
# The supervisor raises it for the dashboard child, which needs more than the bridge.
ENV NODE_OPTIONS=--max-old-space-size=256
COPY --from=build /app/dist ./dist
COPY assets ./assets
# The dashboard's Next.js standalone bundle is self-contained; keep it under /dash so its node_modules
# never collide with the bridge's at /app.
COPY --from=build --chown=node:node /app/dashboard/.next/standalone /dash
COPY --from=build --chown=node:node /app/dashboard/.next/static /dash/dashboard/.next/static
COPY --from=build --chown=node:node /app/dashboard/public /dash/dashboard/public
COPY scripts/start-combined.mjs ./scripts/start-combined.mjs
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3100
CMD ["node", "scripts/start-combined.mjs"]
