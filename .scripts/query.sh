#!/bin/bash

# Sample federated query — hits the Apollo Router (default :4000).
PORT="${1:-4000}"

read -r -d '' QUERY <<"EOF"
{
  __schema { queryType { name } }
}
EOF

QUERY=$(echo "${QUERY}" | awk -v ORS= -v OFS= '{$1=$1}1')

echo -------------------------------------------------------------------------------------------
( set -x; curl -i -X POST "http://localhost:${PORT}" \
  -H 'Content-Type: application/json' \
  --data-raw '{ "query": "'"${QUERY}"'" }' )
echo
echo -------------------------------------------------------------------------------------------
