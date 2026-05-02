import { startGraphqlServer } from './standaloneServer.js'
import { PAYLOAD_SUBGRAPH_DEV_PORTS, type PayloadSubgraphDomain } from '../domains.js'

/**
 * Set `PAYLOAD_LAMBDA_SUBGRAPH` to a **single** pruned `buildFederatedSubgraphForDomain` view,
 * with a process-default `PORT` from `PAYLOAD_SUBGRAPH_DEV_PORTS` when unset.
 */
export async function runSubgraph(domain: PayloadSubgraphDomain) {
  process.env.PAYLOAD_LAMBDA_SUBGRAPH = domain
  if (!process.env.PORT) {
    process.env.PORT = String(PAYLOAD_SUBGRAPH_DEV_PORTS[domain])
  }
  await startGraphqlServer()
}
