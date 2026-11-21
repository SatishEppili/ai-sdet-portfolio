#!/usr/bin/env bash
# Starts the self-hosted Toolshop, seeds a fresh database and waits until UI + API respond.
# Used by CI and by `npm run toolshop:up` (needs Docker).
set -euo pipefail

COMPOSE="docker compose -f docker/toolshop.compose.yml"
UI_URL="${BASE_URL:-http://localhost:4200}"
API_URL="${API_URL:-http://localhost:8091}"

wait_for() { # name, max attempts, sleep seconds, command...
  local name=$1 tries=$2 pause=$3; shift 3
  for i in $(seq 1 "$tries"); do
    if "$@" >/dev/null 2>&1; then echo "✓ $name ready"; return 0; fi
    echo "  waiting for $name ($i/$tries)"; sleep "$pause"
  done
  echo "✗ $name not ready in time"; $COMPOSE logs --tail=80; return 1
}

$COMPOSE up -d --quiet-pull

wait_for "database" 45 2 $COMPOSE exec -T mariadb mysqladmin ping -h localhost -u root -proot --silent

echo "Seeding a fresh database..."
wait_for "migrations + seed" 10 5 $COMPOSE exec -T laravel-api php artisan migrate:fresh --seed --force

wait_for "API ($API_URL/status)" 30 2 curl -fsS "$API_URL/status"
wait_for "API login with seeded customer" 10 3 curl -fsS -X POST "$API_URL/users/login" \
  -H 'Content-Type: application/json' \
  --data '{"email":"customer@practicesoftwaretesting.com","password":"welcome01"}'

# ng serve compiles on first start; this is the slow part (1-3 min).
wait_for "UI ($UI_URL)" 72 5 curl -fsS "$UI_URL"
echo "Toolshop is up: UI $UI_URL  API $API_URL"
