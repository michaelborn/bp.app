#!/bin/sh
# Redeploy bp.app on this host: fast-forward to origin/development (best
# effort), rebuild the container image, restart, and health-check.
# Zero decisions; safe to re-run. Deploys the working tree as-is.
set -eu

cd "$(dirname "$0")/.."
PORT=3100

echo "==> bp.app redeploy"

if git pull --ff-only origin development 2>&1; then
  echo "==> up to date with origin/development"
else
  echo "!! git pull failed (ssh agent not available?) - deploying the current working tree" >&2
  echo "!! HEAD: $(git rev-parse --short HEAD) ($(git branch --show-current))"
fi

echo "==> building image and restarting container"
docker compose up -d --build

echo "==> waiting for /api/health"
i=0
while [ "$i" -lt 30 ]; do
  if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
    echo "==> healthy at https://bp.theborns.xyz ($(git rev-parse --short HEAD))"
    exit 0
  fi
  i=$((i + 1))
  sleep 1
done

echo "!! health check failed after 30s - last container logs:" >&2
docker logs --tail 20 bp-app >&2 || true
exit 1
