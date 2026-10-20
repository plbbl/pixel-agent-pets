#!/bin/sh
set -eu
cd "$(dirname "$0")"
if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  echo "Install Node.js 20 or later from https://nodejs.org, then run this file again."
  read -r answer
  exit 1
fi
npm ci --no-audit --no-fund
node scripts/cli.mjs install --codex
echo "Open Settings → Mini & Pets (Mini 与虚拟宠物) → the circular Refresh icon → select a pet."
read -r answer
