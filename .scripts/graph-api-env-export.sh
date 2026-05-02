#!/bin/bash

# Same as graph-api-env.sh but designed to be sourced before invoking ./router
# (matches the cft-federation-server convention, even though we only have one file now).

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
