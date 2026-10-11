# syntax=docker/dockerfile:1
# Build context is the REPO ROOT (Railway: RAILWAY_DOCKERFILE_PATH=dashboard/Dockerfile).
# The dashboard imports the bridge's settings schemas from ../src, so the root deps are installed at build time only.

FROM node:22-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY dashboard/package.json dashboard/package-lock.json ./dashboard/
RUN cd dashboard && npm ci
COPY tsconfig.json ./
COPY src ./src
COPY dashboard ./dashboard
RUN cd dashboard && npm run build

FROM node:22-slim
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3100
WORKDIR /app
COPY --from=build --chown=node:node /app/dashboard/.next/standalone ./
COPY --from=build --chown=node:node /app/dashboard/.next/static ./dashboard/.next/static
COPY --from=build --chown=node:node /app/dashboard/public ./dashboard/public
USER node
EXPOSE 3100
CMD ["node", "dashboard/server.js"]
