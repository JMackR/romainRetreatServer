# romainRetreatServer

Standalone **Payload GraphQL** for Romain Retreat. It loads the same [`romainRetreatCMS` `payload.config.ts`](../romainRetreatCMS/src/payload.config.ts) as the CMS, so the executable GraphQL API matches the CMS’s `/api/graphql` (when GraphQL is not disabled). Keep `payload` and `@payloadcms/*` **versions in lockstep** with `romainRetreatCMS/package.json` so the generated schema is identical.

## Ports

| Service              | Port | URL                                      |
| -------------------- | ---- | ---------------------------------------- |
| GraphQL (this app)   | 3002 | `http://127.0.0.1:3002/api/graphql`      |
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

4. **Refresh the committed subgraph SDL** when you change collections, fields, or `payload.config`: run `yarn export:subgraph-sdl` (requires `PAYLOAD_SECRET` and a `DATABASE_URL` the adapter can use). The file `supergraph/payload.subgraph.graphql` is the Federation 2 view for `rover` and GraphOS; the **source of truth** for types is always the shared `payload.config`.

5. **Optional check** before a release: `yarn check:payload-version` — fails if `payload` / `@payloadcms/*` versions in this repo and `romainRetreatCMS` have diverged.

## Apollo Federation (supergraph)

This service exposes a **Federation 2** subgraph: `POST /graphql` and `POST /api/graphql` (same handler). Romain’s `supergraph/supergraph.yaml` points the `payload` subgraph at `http://127.0.0.1:3002/graphql` for local `rover` composition.

- Compose the supergraph (from this directory, with Rover and `APOLLO_ELV2_LICENSE=accept`): `yarn compose:supergraph`
- Export SDL for GraphOS (and to update `supergraph/payload.subgraph.graphql` after config changes): `yarn export:subgraph-sdl`

The web app should use GraphQL on **:3002** (this subgraph) when the CMS has GraphQL disabled, so a single schema powers both the public API and the federated supergraph.

From the monorepo root you can use `yarn server:dev` if you have that script.
