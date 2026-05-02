SHELL := /bin/bash
export COMPOSE_PROJECT_NAME=romain
export SUBGRAPH_BOOT_TIME=4

.PHONY: default
default: deps run-supergraph

# ---------------------------------------------------------------------------
# Dependencies (mirrors cft-federation-server/Makefile `deps`)
# ---------------------------------------------------------------------------

.PHONY: deps
deps:
	@echo --------------------------------------------
	curl -sSL https://rover.apollo.dev/nix/latest | sh
	@echo --------------------------------------------
	curl -sSL https://router.apollo.dev/download/nix/latest | sh
	@echo --------------------------------------------

.PHONY: deps-windows
deps-windows:
	@echo --------------------------------------------
	iwr 'https://rover.apollo.dev/win/latest' | iex
	@echo --------------------------------------------
	curl -sSL https://router.apollo.dev/download/nix/v2/latest | sh
	@echo --------------------------------------------

.PHONY: deps-check
deps-check:
	.scripts/deps-check.sh

# ---------------------------------------------------------------------------
# Standalone Apollo Router with Apollo Studio (managed federation)
# ---------------------------------------------------------------------------

.PHONY: run-supergraph
run-supergraph: up-subgraphs publish-subgraphs run-router

.PHONY: run-router
run-router:
	@source "./.scripts/graph-api-env-export.sh" && set -x; \
	  ./router --version && \
	  ./router --dev \
	    -c ./supergraph/router.yaml \
	    --log info

.PHONY: query
query:
	@.scripts/query.sh

.PHONY: smoke
smoke:
	@.scripts/smoke.sh

# ---------------------------------------------------------------------------
# Subgraphs in Docker Compose (5 services on ports 4001..4005)
# ---------------------------------------------------------------------------

.PHONY: up-subgraphs
up-subgraphs:
	docker compose \
	  -f docker-compose.federation.yml \
	  up -d --build users groups search content system
	@set -x; sleep $$SUBGRAPH_BOOT_TIME
	docker compose -f docker-compose.federation.yml logs --tail=20 users groups search content system

.PHONY: build-subgraphs-no-cache
build-subgraphs-no-cache:
	docker compose \
	  -f docker-compose.federation.yml \
	  build --no-cache users groups search content system

.PHONY: publish-subgraphs
publish-subgraphs:
	.scripts/publish.sh

.PHONY: publish-subgraphs-docker-compose
publish-subgraphs-docker-compose:
	.scripts/publish.sh "docker-compose"

.PHONY: unpublish-subgraphs
unpublish-subgraphs:
	.scripts/unpublish.sh

.PHONY: down
down:
	docker compose -f docker-compose.federation.yml down --remove-orphans

# ---------------------------------------------------------------------------
# Local composition with Rover (no Apollo Studio required)
# ---------------------------------------------------------------------------

.PHONY: config
config:
	.scripts/config.sh "localhost" > ./supergraph/schema/local.yaml 2>/dev/null
	.scripts/config.sh "docker-compose" > ./supergraph/schema/docker.yaml 2>/dev/null

.PHONY: compose
compose:
	@set -x; cd supergraph/schema; \
	  rover supergraph compose --elv2-license=accept --config local.yaml > ../supergraph.local.graphql
	@set -x; cd supergraph/schema; \
	  rover supergraph compose --elv2-license=accept --config docker.yaml > ../supergraph.docker.graphql
	@cp supergraph/supergraph.local.graphql supergraph/supergraph.graphql

.PHONY: run-supergraph-local
run-supergraph-local: up-subgraphs config compose run-router-local

.PHONY: run-router-local
run-router-local:
	@set -x; \
	  ./router --version && \
	  ./router --dev \
	    -c ./supergraph/router.yaml \
	    -s ./supergraph/supergraph.local.graphql \
	    --log info

# ---------------------------------------------------------------------------
# Apollo Router in Docker (uses pre-built image; no native binary needed)
# ---------------------------------------------------------------------------

.PHONY: up-supergraph
up-supergraph:
	docker compose \
	  -f docker-compose.federation.yml \
	  --profile router \
	  up -d --build
	@set -x; sleep $$SUBGRAPH_BOOT_TIME
	docker compose -f docker-compose.federation.yml logs --tail=20

.PHONY: up-supergraph-local
up-supergraph-local: config compose
	docker compose \
	  -f docker-compose.federation.yml \
	  --profile router \
	  up -d --build
	@set -x; sleep $$SUBGRAPH_BOOT_TIME

# ---------------------------------------------------------------------------
# Subgraph SDL housekeeping (Romain-specific)
# ---------------------------------------------------------------------------

.PHONY: export-sdl
export-sdl:
	yarn export:subgraph-sdl

.PHONY: verify-domain-federation
verify-domain-federation:
	yarn verify:domain-federation

# ---------------------------------------------------------------------------
# AWS Lambda deployment (SAM)
# ---------------------------------------------------------------------------

# SAM (BuildMethod: makefile) sets ARTIFACTS_DIR. We delegate the actual bundling
# to subgraphs/_shared/lambda-build/build.mjs (esbuild API + plugin to stub admin-UI
# imports like next/cache). Anything that needs to ship as an actual node_modules
# entry (currently just `sharp` for its native libvips binary) is npm-installed here
# with cross-arch flags so the linux-arm64 prebuilt lands in the artifact.
SUBGRAPH_LAMBDA_NPM_INSTALL := sharp

.PHONY: build-SubgraphFunction
build-SubgraphFunction:
	@if [ -z "$(ARTIFACTS_DIR)" ]; then echo "ARTIFACTS_DIR is empty (run via \`yarn sam:build\`)"; exit 1; fi
	@if [ -z "$$LAMBDA_BUILD_REPO_ROOT" ]; then echo "LAMBDA_BUILD_REPO_ROOT not set — invoke via \`yarn sam:build\` (it sets it to romainRetreatServer/ so esbuild can resolve ../../../romainRetreatCMS from outside SAM's scratch copy)."; exit 1; fi
	@echo "[build-SubgraphFunction] esbuild (from $$LAMBDA_BUILD_REPO_ROOT) → $(ARTIFACTS_DIR)/lambda.mjs"
	@cd "$$LAMBDA_BUILD_REPO_ROOT" && node subgraphs/_shared/lambda-build/build.mjs
	@echo "[build-SubgraphFunction] writing minimal package.json + npm install (cpu=arm64,os=linux,libc=glibc)"
	@cd "$$LAMBDA_BUILD_REPO_ROOT" && node -e "const root=require('./package.json'); const ext=process.argv.slice(1); const out={name:'lambda-deps',version:'0.0.0',private:true,dependencies:Object.fromEntries(ext.map(n=>[n,root.dependencies[n]||(()=>{throw new Error('missing '+n+' in package.json')})()]))}; require('fs').writeFileSync(process.env.ARTIFACTS_DIR+'/package.json', JSON.stringify(out,null,2))" $(SUBGRAPH_LAMBDA_NPM_INSTALL)
	@cd $(ARTIFACTS_DIR) && npm install \
	  --omit=dev \
	  --no-package-lock \
	  --no-audit \
	  --no-fund \
	  --ignore-scripts \
	  --cpu=arm64 \
	  --os=linux \
	  --libc=glibc
	@echo "[build-SubgraphFunction] artifact contents:"
	@ls -lah $(ARTIFACTS_DIR) | head -10
	@echo "[build-SubgraphFunction] node_modules size: $$(du -sh $(ARTIFACTS_DIR)/node_modules 2>/dev/null | cut -f1)"

.PHONY: deploy-lambda
deploy-lambda:
	yarn deploy:lambda

.PHONY: deploy-lambda-all
deploy-lambda-all:
	yarn deploy:lambda all

.PHONY: deploy-lambda-unified
deploy-lambda-unified:
	yarn deploy:lambda unified

# ---------------------------------------------------------------------------
# Misc
# ---------------------------------------------------------------------------

.PHONY: docker-prune
docker-prune:
	.scripts/docker-prune.sh
