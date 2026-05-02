#!/bin/bash

# Cft-federation-server style subgraph index, sourced by the rest of the .scripts/.
# Defines the `subgraphs` array and `url_<name>` / `schema_<name>` variables for
# either localhost (default) or docker-compose networking.
#
#   source .scripts/subgraphs.sh                # localhost ports 4001..4005
#   source .scripts/subgraphs.sh docker-compose # docker hostnames (port 4000)

SUBGRAPH_NETWORKING="${1:-localhost}"

>&2 echo ""
if [[ "$SUBGRAPH_NETWORKING" == "docker-compose" ]]; then
  >&2 echo "Subgraphs will listen on different docker-compose hostnames (all on port 4000)"
  source "$(dirname "$0")/subgraphs/docker-compose-networking.sh"
else
  >&2 echo "Subgraphs will listen on different localhost ports (4001..4005)"
  source "$(dirname "$0")/subgraphs/localhost-networking.sh"
fi
>&2 echo ""
