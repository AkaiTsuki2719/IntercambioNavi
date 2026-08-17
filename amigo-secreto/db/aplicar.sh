#!/usr/bin/env bash
# Aplica las migraciones en orden. Requiere psql y DATABASE_URL.
set -euo pipefail
: "${DATABASE_URL:?falta DATABASE_URL}"
for f in db/0*.sql; do
  echo "→ $f"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done
echo "listo"
