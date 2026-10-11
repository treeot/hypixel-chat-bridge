#!/usr/bin/env bash
# Starts the dashboard image with dummy env and checks /login renders.
set -euo pipefail
image="$1"
id=$(docker run -d -p 3100:3100 -e BRIDGE_URL=http://127.0.0.1:9 -e BRIDGE_TOKEN=x -e AUTH_SECRET=smoke-secret-smoke-secret-smoke -e AUTH_DISCORD_ID=1 -e AUTH_DISCORD_SECRET=x -e AUTH_TRUST_HOST=true "$image")
trap 'docker rm -f "$id" >/dev/null' EXIT
for _ in $(seq 1 30); do
  # Capture first: under pipefail, grep -q closing the pipe early would fail curl.
  body=$(curl -fsS http://127.0.0.1:3100/login || true)
  if grep -q 'Log in with Discord' <<<"$body"; then echo "dashboard smoke ok"; exit 0; fi
  sleep 1
done
docker logs "$id"
exit 1
