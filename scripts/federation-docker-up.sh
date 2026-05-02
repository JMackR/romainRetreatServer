#!/usr/bin/env sh
# Start the local GraphQL subgraphs + Router stack (cft-federation-server style).
# Boot order:
#   1. postgres        (Postgres 17, matches AWS Aurora)
#   2. db-init         (one-shot: Drizzle push + seed demo content; exits 0)
#   3. subgraphs       (users/groups/search/content/system on 4001..4005)
#   4. supergraph      (Rover compose, one-shot)
#   5. router          (Apollo Router on :4000)
set -e
cd "$(dirname "$0")/.."
COMPOSE="docker compose -f docker-compose.federation.yml"

if ! [ -f .env ]; then
  echo "Missing .env. Copy from .env.example and set at least PAYLOAD_SECRET, etc."
  exit 1
fi

printf '[1/5] postgres + db-init (push schema + seed demo content)…\n'
$COMPOSE up -d --build postgres
$COMPOSE up --build --exit-code-from db-init db-init

printf '[2/5] subgraphs…\n'
$COMPOSE up -d --build users groups search content system

wait_health() {
  PORT="$1"
  NAME="$2"
  i=0
  printf 'Waiting for %s /health (http://127.0.0.1:%s)…\n' "$NAME" "$PORT"
  while [ "$i" -lt 120 ]; do
    if curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
  echo "$NAME did not become healthy. Check: docker logs romain-subgraph-${NAME}"
  exit 1
}

wait_health 4001 users
wait_health 4002 groups
wait_health 4003 search
wait_health 4004 content
wait_health 4005 system

printf '[3/5] supergraph compose…\n'
export APOLLO_ELV2_LICENSE="${APOLLO_ELV2_LICENSE:-accept}"
$COMPOSE --profile tools run --rm supergraph-build

printf '[4/5] router…\n'
$COMPOSE --profile router up -d router
printf '\nFederation (local Docker, cft-style):\n'
printf '  Postgres:  postgresql://postgres:postgres@127.0.0.1:5433/postgres (host) | postgres:5432 (container)\n'
printf '  Subgraphs: http://127.0.0.1:4001..4005/health\n'
printf '  Router:    http://127.0.0.1:4000/\n'
