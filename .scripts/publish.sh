#!/bin/bash

# Publish each per-domain subgraph SDL to Apollo Studio (managed federation).
# Mirrors cft-federation-server/.scripts/publish.sh: one rover subgraph publish per name.
#
#   .scripts/publish.sh                 # localhost routing URLs (4001..4005)
#   .scripts/publish.sh docker-compose  # docker hostnames

set -e

SUBGRAPH_NETWORKING="${1:-localhost}"

echo "======================================="
echo "PUBLISH SUBGRAPHS TO APOLLO REGISTRY"
echo "======================================="

source "$(dirname "$0")/subgraphs.sh" "$SUBGRAPH_NETWORKING"
source "$(dirname "$0")/graph-api-env.sh"

ROVER_BIN="${ROVER_BIN:-rover}"

# Make sure the per-subgraph SDL files exist (they’re the source of truth here).
if [ ! -f "subgraphs/users/src/users.graphql" ]; then
  echo "Generating per-subgraph SDL via yarn export:subgraph-sdl ..."
  yarn export:subgraph-sdl
fi

for subgraph in "${subgraphs[@]}"; do
  echo "---------------------------------------"
  echo "subgraph: ${subgraph}"
  echo "---------------------------------------"
  url="url_$subgraph"
  schema="schema_$subgraph"
  ( set -x; "${ROVER_BIN}" subgraph publish "${APOLLO_GRAPH_REF}" \
      --routing-url "${!url}" \
      --schema "${!schema}" \
      --name "${subgraph}" \
      --convert )
  echo ""
done
