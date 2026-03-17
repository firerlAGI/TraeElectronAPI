#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

if command -v npm >/dev/null 2>&1; then
  exec npm run quickstart
fi

exec node scripts/quickstart.js