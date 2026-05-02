#!/bin/bash

# Emit a Rover supergraph compose YAML to stdout for the chosen networking mode.
# Mirrors cft-federation-server/.scripts/config.sh.
#
#   .scripts/config.sh localhost       > supergraph/schema/local.yaml
#   .scripts/config.sh docker-compose  > supergraph/schema/docker.yaml

source "$(dirname "$0")/subgraphs.sh" "$1"

echo "federation_version: '=2.8.0'"
echo "subgraphs:"
for subgraph in "${subgraphs[@]}"; do
  url="url_$subgraph"
  schema="schema_$subgraph"
  echo "  ${subgraph}:"
  echo "    routing_url: ${!url}"
  echo "    schema:"
  echo "      file: ../../${!schema}"
done
