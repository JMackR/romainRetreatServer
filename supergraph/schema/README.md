# Supergraph composition configs (Romain Retreat)

This layout follows the same idea as `cft-federation-server`’s `supergraph/schema/` (local vs docker vs cloud): **separate Rover composition configs** per target, and **separate composed `*.graphql` outputs** under `supergraph/`.

| File | When to use | Composed output |
| ---- | ------------ | --------------- |
| `local.yaml` | 5 per-domain subgraph services running on the host (ports 4001..4005, e.g. `make up-subgraphs`) | `supergraph/supergraph.graphql`, `supergraph/supergraph.local.graphql` |
| `docker.yaml` | 5 per-domain subgraph services on the `federation` Docker network (each container :4000) | `supergraph/supergraph.docker.graphql` |
| `local.unified.yaml` | **Legacy** — a single `payload` subgraph on :3002 (handy for fast Payload iteration) | `supergraph/supergraph.local.graphql` |
| `aws.introspect.yaml` | AWS Lambda URLs (introspect; needs healthy 200 from each path) | `supergraph/supergraph.aws.graphql` |
| `aws.unified-file.yaml` | AWS unified routing URL + `payload-sdl/_merged.graphql` (no introspection) | `supergraph/supergraph.aws.graphql` |

**Runtime (this repo):** the same `createApp` + Hono graph runs in **`subgraphs/_shared/server.ts`** (local) and **`subgraphs/_shared/lambda.ts`** (AWS). `PAYLOAD_LAMBDA_SUBGRAPH` / `SubgraphMode` in SAM control domain slices. Federation composition is a **separate** step (Rover) from that binary.

**Scripts (from `romainRetreatServer`):**

- `yarn compose:supergraph` / `yarn compose:supergraph:local` — local host introspection
- `yarn compose:supergraph:docker` — Docker network (run from the `supergraph-build` one-shot in `docker-compose.federation.yml` or a container on the same network)
- `yarn compose:supergraph:aws` — AWS introspect
- `yarn compose:supergraph:aws:file` — AWS from files
- `yarn publish:subgraph` — GraphOS; routing URL from env or `aws.unified-file.yaml`

Edit **`aws.*.yaml`** when your Function URL or paths change.
