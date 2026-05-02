#!/bin/bash

# Validate the local environment has everything needed to run `make run-supergraph` /
# `make run-supergraph-local`.  Same spirit as cft-federation-server/.scripts/deps-check.sh.

set -e

ok() { printf "  \033[32mOK\033[0m  %s\n" "$1"; }
miss() { printf "  \033[31mMISS\033[0m %s\n" "$1"; }

echo "Checking dependencies..."

command -v docker >/dev/null 2>&1 && ok "docker" || miss "docker"
command -v node >/dev/null 2>&1 && ok "node ($(node --version))" || miss "node"
command -v yarn >/dev/null 2>&1 && ok "yarn ($(yarn --version))" || miss "yarn"

if [ -x ./router ]; then
  ok "./router (Apollo Router binary)"
elif command -v router >/dev/null 2>&1; then
  ok "router on PATH"
else
  miss "Apollo Router — run \`make deps\` to download"
fi

if command -v rover >/dev/null 2>&1; then
  ok "rover ($(rover --version | head -n 1))"
else
  miss "rover — run \`make deps\` to install"
fi

if [ -f apollo.publish.env ]; then
  ok "APOLLO_KEY env file present (apollo.publish.env)"
else
  miss "apollo.publish.env (copy apollo.publish.env.example)"
fi
