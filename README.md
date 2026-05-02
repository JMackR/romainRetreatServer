# romainRetreatServer

Standalone **Payload GraphQL** for Romain Retreat. It loads the same [`romainRetreatCMS` `payload.config.ts`](../romainRetreatCMS/src/payload.config.ts) as the CMS, so the executable GraphQL API matches the CMS’s `/api/graphql` (when GraphQL is not disabled). Keep `payload` and `@payloadcms/*` **versions in lockstep** with `romainRetreatCMS/package.json` so the generated schema is identical.

> **Deploying?** See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for end-to-end recipes — local Docker stack, native local dev, AWS first-time setup, Lambda/Router deploys, Apollo Studio publish, Aurora seeding, and Vercel for the CMS.

## Ports

| Service              | Port | URL                                      |
| -------------------- | ---- | ---------------------------------------- |
| GraphQL (this app)   | 3002 | `http://127.0.0.1:3002/api/graphql`      |
| Apollo Router (Docker) | 4000 | `http://127.0.0.1:4000/` (after `yarn docker:federation:up`) |
| Payload admin (Next) | 3001 | `http://127.0.0.1:3001/admin`            |
| Next web             | 3000 | `http://127.0.0.1:3000`                  |

## Setup

1. From this directory: `cp .env.example .env` and set `PAYLOAD_SECRET` and `DATABASE_URL` to the same values as `romainRetreatCMS/.env` (Postgres, e.g. `postgresql://…`). Use `yarn db:start` for a local Docker Postgres. Set `PAYLOAD_DATABASE_PUSH=1` on a **new** database until the schema exists, then set `0` for normal runs. **AWS / Lambda** uses the same `payload.config` with `DATABASE_URL` pointing at RDS (see `template.yaml` and `PAYLOAD_DATABASE_PUSH` there).
2. Install and run:

   ```bash
   yarn install
   yarn dev
   ```

3. In **`romainRetreatCMS/.env`**, use the same `PAYLOAD_SECRET` and `DATABASE_URL`. Set `PAYLOAD_DISABLE_GRAPHQL=true` in the CMS if you only want the standalone server to serve GraphQL in dev (see `romainRetreatCMS/.env.example`).

4. **Regenerate the subgraph SDL** when you change collections, fields, or `payload.config`: `yarn export:subgraph-sdl` (requires `PAYLOAD_SECRET` and `DATABASE_URL`). It updates `supergraph/payload-sdl/*.graphql` and `supergraph/payload-sdl/_merged.graphql` (the GraphQL for `rover` / GraphOS) from the shared `payload.config`, not hand-edited. A legacy `supergraph/payload.subgraph.graphql` is removed if it exists.

5. **Optional check** before a release: `yarn check:payload-version` — fails if `payload` / `@payloadcms/*` versions in this repo and `romainRetreatCMS` have diverged.

## Apollo Federation (supergraph) — cft-federation-server style

The repo follows the same on-disk layout as [`cft-federation-server`](../../Loop/cft-federation-server) (a 2023 Federation 2 demo): one folder per logical subgraph under [`subgraphs/`](./subgraphs/README.md), shell helpers under [`.scripts/`](./.scripts/), Rover composition configs under [`supergraph/schema/`](./supergraph/schema/README.md), top-level [`Makefile`](./Makefile) targets, [`docker-compose.federation.yml`](./docker-compose.federation.yml), and [`apollo.publish.env`](./apollo.publish.env.example) (Apollo Studio credentials — gitignored).

| Concept (cft) | Where it lives in Romain |
| --- | --- |
| `subgraphs/<name>/{package.json,Dockerfile,index.ts,src/<name>.graphql}` | `subgraphs/{users,groups,search,content,system}/…` (all share one Payload runtime) |
| `docker-compose.yaml` (one service per subgraph, ports 4001…) | `docker-compose.federation.yml` — `users:4001`, `groups:4002`, `search:4003`, `content:4004`, `system:4005` |
| `Makefile` (`up-subgraphs`, `publish-subgraphs`, `compose`, `run-router`, `smoke`, `down`, …) | `Makefile` (this repo) |
| `.scripts/{publish,smoke,query,config,subgraphs}.sh` + `subgraphs/{localhost,docker-compose}-networking.sh` | `.scripts/…` (same names + structure) |
| `graph-api.env` (`APOLLO_KEY`, `APOLLO_GRAPH_REF`) | `apollo.publish.env` (single source of truth — same two vars + `SUBGRAPH_NAME`/`SUBGRAPH_ROUTING_URL` for legacy `yarn publish:subgraph`) |
| `config.yaml` (CORS reference) | `config.yaml` |
| `supergraph/router.yaml` + Rust Apollo Router | `supergraph/router.yaml` + `ghcr.io/apollographql/router` Docker image (or `make deps` to download the binary) |
| `supergraph/schema/{local,docker}.yaml` (5-subgraph compose configs) | `supergraph/schema/{local,docker}.yaml` (5-subgraph) plus `local.unified.yaml` (legacy single `payload`) |

### Runtime model

**All five subgraphs share a single Payload + Hono image.** Each container/process selects a single pruned Federation 2 view via `PAYLOAD_LAMBDA_SUBGRAPH=<domain>` (see `subgraphs/_shared/subgraph/payloadSubgraphByDomain.ts:buildFederatedSubgraphForDomain`). This avoids 5× DB pools / 5× Payload bootstraps for one CMS while keeping the layout cft-shaped. AWS uses the same env (`SubgraphMode` parameter in `template.yaml`) to deploy one Lambda per subgraph (`yarn deploy:lambda all`).

### Local development

```sh
# 1. download Apollo Router + Rover (one-time)
make deps                      # or: brew install apollographql/tap/rover apollographql/tap/router
make deps-check                # sanity check

# 2. start the 5 subgraph containers (ports 4001..4005)
make up-subgraphs              # docker compose up users groups search content system

# 3. compose locally (without Apollo Studio)
make config                    # rewrites supergraph/schema/{local,docker}.yaml from .scripts/subgraphs/*
make compose                   # rover supergraph compose → supergraph/supergraph.{local,docker}.graphql
make run-router-local          # ./router --supergraph supergraph.local.graphql

# 4. or, with Apollo Studio (managed federation)
cp apollo.publish.env.example apollo.publish.env
edit apollo.publish.env        # set APOLLO_KEY + APOLLO_GRAPH_REF (.scripts/* + scripts/publish-subgraph.mts both read this)
make publish-subgraphs         # rover subgraph publish for each domain
make run-router                # router pulls the supergraph from Studio Uplink

# 5. one-shot Docker (subgraphs + supergraph compose + router)
yarn docker:federation:up      # → router on http://localhost:4000

# 6. smoke / query
make smoke                     # quick introspection check
make query                     # sample query

# 7. teardown
make down
```

Convenience yarn aliases: `yarn dev:subgraph:users` (etc.) for one process without Docker, `yarn publish:subgraphs` (= `.scripts/publish.sh`), `yarn router:config:local` / `:docker` (= `.scripts/config.sh`), `yarn smoke`, `yarn query`.

### Legacy unified mode

The original single `payload` subgraph on `:3002` is still available:

- Run unified: `yarn dev` (or `yarn start`) — exposes `POST /graphql`, `POST /api/graphql`, **and** `POST /api/subgraph/<domain>/graphql` for every domain in one process.
- Compose unified: `yarn compose:supergraph:unified` (uses `supergraph/schema/local.unified.yaml`).
- Publish unified: `yarn publish:subgraph` (sends the merged `supergraph/payload-sdl/_merged.graphql` once).

This is handy when iterating on Payload itself; for federation work prefer the cft-style 5-subgraph flow above.

### SDL

`yarn export:subgraph-sdl` regenerates **both** `supergraph/payload-sdl/<domain>.graphql` (used by `_merged.graphql`) **and** `subgraphs/<domain>/src/<domain>.graphql` (used by `supergraph/schema/{local,docker}.yaml`). Run it whenever collections, fields, or `payload.config` change.

### AWS

- One Lambda per subgraph: `yarn deploy:lambda all` — five stacks named `${SAM_STACK_PREFIX}-sg-<domain>` (default prefix `romain-retreat`); each Function URL becomes the `routing_url` in `supergraph/schema/aws.introspect.yaml` / `aws.unified-file.yaml`.
- One unified Lambda (all routes in one function): `yarn deploy:lambda unified`.
- Compose against AWS: `yarn compose:supergraph:aws` (introspect each Function URL) or `yarn compose:supergraph:aws:file` (read `_merged.graphql`).

The web app should use GraphQL on **:3002** (unified) for fast iteration, or **:4000** (router) when verifying federation behavior end-to-end.
