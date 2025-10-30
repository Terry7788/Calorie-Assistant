#!/usr/bin/env bash
set -euo pipefail

# Install backend dependencies
pushd server > /dev/null
npm ci --no-audit --no-fund
popd > /dev/null

# Install frontend dependencies and build
pushd web > /dev/null
npm ci --no-audit --no-fund
npm run build --yes || npm run build
popd > /dev/null

# Start backend (Express on 4000) in background
node server/src/index.js &

# Start frontend (Next.js) in foreground, binding to 0.0.0.0
export HOST=0.0.0.0
export PORT=${PORT:-3000}
npm --prefix web run start -- --port "$PORT" --hostname "$HOST"


