#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3000}"

PIDS="$(lsof -ti tcp:"$PORT" || true)"
if [[ -n "$PIDS" ]]; then
  echo "Stopping process(es) on port $PORT: $PIDS"
  kill -9 $PIDS
  sleep 1
fi

echo "Starting matschema on port $PORT"
node src/server.js
