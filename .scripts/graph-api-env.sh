#!/bin/bash

# Loads APOLLO_KEY and APOLLO_GRAPH_REF from apollo.publish.env (Romain's single source
# of truth — also read by scripts/publish-subgraph.mts). The file is gitignored;
# copy apollo.publish.env.example if it does not exist.

if ! ls apollo.publish.env > /dev/null 2>&1; then
  echo "Missing apollo.publish.env. Copy apollo.publish.env.example and set APOLLO_KEY + APOLLO_GRAPH_REF."
  exit 1
fi

eval "$(grep -E '^(APOLLO_KEY|APOLLO_GRAPH_REF)=' apollo.publish.env)"

if [ -z "${APOLLO_KEY:-}" ] || [ -z "${APOLLO_GRAPH_REF:-}" ]; then
  echo "apollo.publish.env is missing APOLLO_KEY or APOLLO_GRAPH_REF."
  exit 1
fi

export APOLLO_KEY=$APOLLO_KEY
export APOLLO_GRAPH_REF=$APOLLO_GRAPH_REF
