#!/bin/bash

# Same as cft-federation-server/.scripts/docker-prune.sh — frees disk for fresh builds.
docker image prune -f
docker kill $(docker ps -aq) 2>/dev/null || true
docker rm $(docker ps -aq) 2>/dev/null || true
docker volume rm $(docker volume ls -qf dangling=true) 2>/dev/null || true
