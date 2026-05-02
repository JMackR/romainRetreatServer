#!/bin/bash

# Remove each per-domain subgraph from Apollo Studio.
set -e

source "$(dirname "$0")/subgraphs.sh"
source "$(dirname "$0")/graph-api-env.sh"

ROVER_BIN="${ROVER_BIN:-rover}"

for subgraph in "${subgraphs[@]}"; do
  echo "---------------------------------------"
  echo "unpublish: ${subgraph}"
  echo "---------------------------------------"
  ( set -x; "${ROVER_BIN}" subgraph delete "${APOLLO_GRAPH_REF}" --name "${subgraph}" --confirm )
  echo ""
done
