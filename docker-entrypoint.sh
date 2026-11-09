#!/bin/sh
set -eu

DB_PATH="${IPL_DB_PATH:-/data/ipl-arena.db}"
SEED="/app/seed/ipl-arena.db"

mkdir -p "$(dirname "$DB_PATH")"

# First boot on a fresh volume: copy the shipped database once, then never touch it again.
if [ ! -f "$DB_PATH" ]; then
  if [ -f "$SEED" ]; then
    cp "$SEED" "$DB_PATH"
    echo "Seeded database at $DB_PATH"
  else
    echo "No database at $DB_PATH and no seed available." >&2
    exit 1
  fi
fi

chown -R nextjs:nodejs "$(dirname "$DB_PATH")" 2>/dev/null || true

exec gosu nextjs node_modules/.bin/next start --hostname 0.0.0.0 --port "${PORT:-3000}"
