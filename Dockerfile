# syntax=docker/dockerfile:1
# Two stages: compile TypeScript with dev deps, then ship only production deps.
# No VOLUME instruction: Railway rejects it. Mount a volume (Compose) or a Railway Volume at /app/data instead.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json index.ts ./
COPY src ./src
RUN npm run build

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
# @napi-rs/canvas (image mode) is a regular dependency with prebuilt glibc binaries: no system cairo needed.
RUN npm ci --omit=dev && npm cache clean --force
# Heap cap for the bridge at runtime; set after npm ci so the install itself is not capped.
ENV NODE_OPTIONS=--max-old-space-size=256
COPY --from=build /app/dist ./dist
COPY assets ./assets
RUN mkdir -p /app/data && chown node:node /app/data
USER node
CMD ["node", "dist/index.js"]
