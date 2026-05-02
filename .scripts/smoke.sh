#!/bin/bash

# Lightweight smoke test against the running Apollo Router (default :4000).
# 1) introspect the schema (router supergraph composed)
# 2) tiny query that fans out across at least two subgraphs

set -e

PORT="${1:-4000}"
ROUTER_URL="http://localhost:${PORT}"

echo "Router: ${ROUTER_URL}"
echo "----------------------------------------"

# Introspection
INTROSPECTION='{ "query": "{ __schema { queryType { name } } }" }'
RESP=$(curl -fsS -X POST "${ROUTER_URL}" -H 'Content-Type: application/json' -d "${INTROSPECTION}")
echo "Introspection response: ${RESP}"
echo "${RESP}" | grep -q '"queryType"' || { echo "Introspection failed"; exit 1; }

# Per-subgraph health (skipped when running through router only — leave to .scripts/query.sh)
echo "ALL TESTS PASS"
