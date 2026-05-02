# Local Docker: subgraph + Apollo Router

Use this for **local development** with a composed supergraph and the **Apollo Router (Rust)** container. **GraphOS / published graphs** use **AWS Lambda** and `yarn publish:subgraph` instead — that path is not served by this compose file.

| Environment        | Subgraph (Payload GraphQL)      | Supergraph            | Who calls it                    |
| ------------------ | ------------------------------- | --------------------- | ------------------------------- |
| This compose stack | `graphql` service on **:3002** | Router on **:4000**   | Your app / curl to `localhost` |
| Production / GraphOS | Lambda URL + `SUBGRAPH_ROUTING_URL` (or `supergraph/schema/aws.unified-file.yaml`) | Composed in Studio   | Mobile / web / Studio           |

## Prerequisites

- **Docker** and Docker Compose v2
- A **`.env`** in `romainRetreatServer` (same as `yarn dev`: `DATABASE_URL`, `PAYLOAD_SECRET`, etc.).

**Postgres on the host machine (not in this compose file):** from inside the `graphql` container, `127.0.0.1` is the **container itself**, not your Mac. Set e.g. `DATABASE_URL=postgresql://user:pass@host.docker.internal:5432/dbname` (the compose file adds `host.docker.internal` via `extra_hosts`). On some Linux setups you may need your host’s LAN IP instead. If Postgres is in **another** Docker network, point `DATABASE_URL` at that service name and attach `graphql` to the same network (or use `extra_hosts` / a bridge), or run `yarn dev` on the host without Docker for the subgraph.

## One command (recommended)

From `romainRetreatServer`:

```bash
yarn docker:federation:up
```

This:

1. Builds and starts the **graphql** service (exposes `http://127.0.0.1:3002`)
2. Runs **Rover** in a one-shot container on the same Docker network so `supergraph/schema/docker.yaml` can resolve `http://graphql:3002`
3. Writes `supergraph/supergraph.docker.graphql` and starts the **router** on `http://127.0.0.1:4000`

Stop:

```bash
yarn docker:federation:down
```

## Manual steps

- **Only the subgraph (no router):** `docker compose -f docker-compose.federation.yml up -d --build graphql`
- **Recompose the supergraph** (after the subgraph is healthy): `yarn compose:supergraph:federation-docker`
- **Start the router** (after `supergraph/supergraph.docker.graphql` exists): `docker compose -f docker-compose.federation.yml --profile router up -d`

## `yarn compose:supergraph:docker` from the **host** (Rover on your machine)

`supergraph/schema/docker.yaml` uses the hostname `graphql`, which only resolves **inside** the Docker network. Use `yarn compose:supergraph:local` (127.0.0.1:3002) when the subgraph is only on the host, or use **`yarn compose:supergraph:federation-docker`** with the `graphql` container up.

## Published / AWS graphs

- Regenerate SDL: `yarn export:subgraph-sdl`
- Publish to GraphOS: `yarn publish:subgraph` (routing URL from `supergraph/schema/aws.unified-file.yaml` when not using localhost; see `apollo.publish.env.example`)
- Lambda deploy: `docs/aws-federation-deploy.md`, `template.yaml`, `yarn deploy:lambda …`

The **Router** in this file does **not** use `APOLLO_KEY` Uplink; it only loads a **local** `supergraph.graphql`. GraphOS’s hosted graph / Router on ECS is a separate workflow.
