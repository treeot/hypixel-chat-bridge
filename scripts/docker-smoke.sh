#!/usr/bin/env bash
# Checks a built image. Usage: scripts/docker-smoke.sh <image>
set -euo pipefail
IMAGE="${1:?usage: scripts/docker-smoke.sh <image>}"
REQ=(-e DISCORD_TOKEN=invalid -e OWNER_ID=123456789012345678 -e GUILD_CHANNEL_ID=223456789012345678)
fail() { echo "docker-smoke FAIL: $*" >&2; exit 1; }

if ! docker info >/dev/null 2>&1; then
  if [ "${CI:-}" = "true" ]; then
    fail "Docker daemon not available in CI"
  fi
  echo "docker-smoke SKIP: Docker daemon not available" >&2
  exit 0
fi

uid=$(docker run --rm --entrypoint id "$IMAGE" -u)
[ "$uid" = "1000" ] || fail "runs as uid $uid, expected 1000"

docker run --rm --entrypoint test "$IMAGE" -f /app/assets/fonts/Monocraft.ttf || fail "assets/fonts/Monocraft.ttf missing"
docker run --rm --entrypoint node "$IMAGE" -e "require('@napi-rs/canvas')" || fail "@napi-rs/canvas does not load"
docker run --rm --entrypoint node "$IMAGE" -e "process.exit(require('v8').getHeapStatistics().heap_size_limit / 1048576 > 512 ? 1 : 0)" ||
  fail "NODE_OPTIONS heap cap not applied"

set +e
out=$(docker run --rm "$IMAGE" 2>&1); code=$?
set -e
[ "$code" -eq 1 ] || fail "empty env exited $code, expected 1"
grep -q 'Invalid environment' <<<"$out" || fail "empty env: no 'Invalid environment' message"
grep -q 'DISCORD_TOKEN' <<<"$out" || fail "empty env: DISCORD_TOKEN not named"
if grep -qE '^\s+at ' <<<"$out"; then fail "empty env printed a stack trace"; fi

set +e
out=$(docker run --rm -e RAILWAY_ENVIRONMENT_NAME=production "${REQ[@]}" "$IMAGE" 2>&1); code=$?
set -e
[ "$code" -eq 1 ] || fail "Railway without Volume exited $code"
grep -q 'wiped on the next redeploy' <<<"$out" || fail "Railway without Volume: guard message missing"

set +e
out=$(docker run --rm --read-only "${REQ[@]}" "$IMAGE" 2>&1); code=$?
set -e
[ "$code" -eq 1 ] || fail "read-only data dir exited $code"
grep -q 'Cannot write to the data directory' <<<"$out" || fail "read-only data dir: message missing"
if grep -qE '^\s+at ' <<<"$out"; then fail "read-only data dir printed a stack trace"; fi

vol="hcb-smoke-$$"
docker volume create "$vol" >/dev/null
trap 'docker volume rm -f "$vol" >/dev/null' EXIT
docker run --rm -v "$vol:/app/data" --entrypoint sh "$IMAGE" -c 'touch /app/data/.write-test' || fail "fresh named volume not writable by uid 1000"

echo "docker-smoke OK: $IMAGE"
