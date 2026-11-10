#!/usr/bin/env bash
# Rotate the Grafana Cloud remote_write access-policy token for Prometheus.
#
# Usage: ./rotate-grafana-key.sh <new-glc-token>
#
# 1. Smoke-tests auth against the push endpoint (401 => rejects token)
# 2. Atomic-swaps the key file (write temp, chmod 600, mv)
# 3. Recreates the prometheus container so it re-reads the key
# 4. Verifies no 401 in the logs after the write window
#
# The token lives only on this host (-rw-------). It is never stored in the
# repo. Generate a new token in the Cloud Portal:
#   stack -> Prometheus -> Details -> "Generate now" (metrics:write)
set -euo pipefail

cd "$(dirname "$0")/.."
KEY="grafana_key"
URL="https://prometheus-prod-55-prod-gb-south-1.grafana.net/api/prom/push"
USER="3752346"
NEW="${1:-}"
[ -z "$NEW" ] && { echo "usage: $0 <new-token>" >&2; exit 1; }

echo "[1/4] validating token auth..."
code=$(curl -s -o /dev/null -w '%{http_code}' -u "${USER}:${NEW}" \
  -H "Content-Type: application/x-protobuf" -X POST "$URL" -d '' || true)
case "$code" in
  200|400) echo "  auth OK (HTTP $code)" ;;
  401|403) echo "  token REJECTED (HTTP $code) — not rotating" >&2; exit 2 ;;
  *) echo "  unexpected HTTP $code, assuming auth failure" >&2; exit 3 ;;
esac

echo "[2/4] swapping $KEY..."
umask 077
printf '%s' "$NEW" > "$KEY.tmp"
mv -f "$KEY.tmp" "$KEY"
chmod 600 "$KEY"
unset NEW

echo "[3/4] recreating prometheus container..."
docker compose up -d --force-recreate prometheus >/dev/null

echo "[4/4] waiting 75s for first remote_write cycle..."
sleep 75
if docker logs --since 3m "$(
  docker ps --filter name=nexus-dns-prometheus --format '{{.Names}}'
)" 2>&1 | grep -q "401 Unauthorized"; then
  echo "FAILED: still seeing 401s — restore previous token and retry" >&2
  exit 4
fi
echo "rotation complete — metrics flowing to Grafana Cloud"
