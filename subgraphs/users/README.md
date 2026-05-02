# users — Romain Retreat federation subgraph

Logical Federation 2 subgraph that owns the `User` entity (and identity-adjacent types).

- **SDL** — `src/users.graphql` (regenerated from Payload by `yarn export:subgraph-sdl` at the repo root).
- **Entry** — `index.ts` sets `PAYLOAD_LAMBDA_SUBGRAPH=users` and starts the shared Hono + Payload runtime via `subgraphs/_shared/bootstrap.ts`. The pruned subgraph schema is built at runtime by `subgraphs/_shared/subgraph/payloadSubgraphByDomain.ts:buildFederatedSubgraphForDomain('users')`.
- **Default port** — `4001` (see `subgraphs/domains.ts:PAYLOAD_SUBGRAPH_DEV_PORTS`).

## Run

```sh
# from romainRetreatServer
yarn dev:subgraph:users          # tsx watch on :4001
# or
docker compose -f docker-compose.federation.yml up users
```

## Federation routing URL

Local: `http://localhost:4001/graphql` — see `supergraph/schema/local.yaml`.
Docker: `http://users:4000/graphql` — see `supergraph/schema/docker.yaml`.
AWS:   per-domain Lambda Function URL — see `supergraph/schema/aws.introspect.yaml` / `aws.unified-file.yaml`.
