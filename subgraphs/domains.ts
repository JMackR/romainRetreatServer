/**
 * One folder per **logical** federated surface (cft-federation-server `subgraphs/*` style).
 * All share the same Payload + Hono stack; `PAYLOAD_LAMBDA_SUBGRAPH` selects a single pruned
 * `buildFederatedSubgraphForDomain` view at `POST /graphql` (and matching `/api/subgraph/.../graphql`).
 */
export const PAYLOAD_SUBGRAPH_DOMAINS = ['users', 'groups', 'search', 'content', 'system'] as const
export type PayloadSubgraphDomain = (typeof PAYLOAD_SUBGRAPH_DOMAINS)[number]

export function isPayloadSubgraphDomain(
  s: string,
): s is PayloadSubgraphDomain {
  return (PAYLOAD_SUBGRAPH_DOMAINS as readonly string[]).includes(s)
}

/** Default ports when running each `subgraphs/<name>/index.mts` (avoid :3000–:3002 used by Next/CMS/unified). */
export const PAYLOAD_SUBGRAPH_DEV_PORTS: Record<PayloadSubgraphDomain, number> = {
  users: 4001,
  groups: 4002,
  search: 4003,
  content: 4004,
  system: 4005,
}
