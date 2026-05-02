/**
 * Writes per-domain Federation subgraph SDL files for the local Docker
 * federation stack and the legacy split-by-bucket layout.
 *
 * Outputs:
 *   - `subgraphs/<domain>/src/<domain>.graphql` — what `supergraph/schema/docker.yaml`
 *     reads when running `yarn compose:supergraph:docker`. Each file is the EXACT
 *     SDL that `buildFederatedSubgraphForDomain(<domain>)` produces at runtime
 *     (so the AWS Lambdas, the local Docker subgraphs, and Rover composition
 *     all see the same per-domain schema — no drift).
 *   - `supergraph/payload-sdl/<bucket>.graphql` + `_merged.graphql` — the older
 *     split-by-typename-bucket files used by the legacy `publish:subgraph`
 *     monolith flow (`yarn publish:subgraph`). Kept for back-compat.
 *
 * Run from `romainRetreatServer` with Payload env (DATABASE_URL, PAYLOAD_SECRET).
 */
import { printSubgraphSchema } from '@apollo/subgraph'
import { configToSchema } from '@payloadcms/graphql'
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import config from '../../romainRetreatCMS/src/payload.config.js'
import { buildPayloadSubgraphSchemaFromBase } from '../subgraphs/_shared/subgraph/buildPayloadSubgraphSchema.js'
import { buildFederatedSubgraphForDomain } from '../subgraphs/_shared/subgraph/payloadSubgraphByDomain.js'
import { PAYLOAD_SUBGRAPH_DOMAINS } from '../subgraphs/domains.js'
import { writeSplitPayloadSdlToSupergraph } from './splitPayloadSdlString.mts'

const supergraphDir = resolve(process.cwd(), 'supergraph')
const subgraphsDir = resolve(process.cwd(), 'subgraphs')
const legacyMonolith = resolve(supergraphDir, 'payload.subgraph.graphql')

const resolved = await config
const { schema: base } = await configToSchema(resolved)
const fed = buildPayloadSubgraphSchemaFromBase(base)
const sdl = printSubgraphSchema(fed)
writeSplitPayloadSdlToSupergraph(sdl, supergraphDir)

// Per-domain SDLs come straight from the runtime `buildFederatedSubgraphForDomain`
// (NOT the bucket-split files) so the Docker compose schema matches what each
// Lambda actually serves via `_service { sdl }` byte-for-byte.
for (const domain of PAYLOAD_SUBGRAPH_DOMAINS) {
  const subgraph = buildFederatedSubgraphForDomain(fed, domain)
  const text = printSubgraphSchema(subgraph)
  const toDir = resolve(subgraphsDir, domain, 'src')
  mkdirSync(toDir, { recursive: true })
  writeFileSync(resolve(toDir, `${domain}.graphql`), text, 'utf8')
}

if (existsSync(legacyMonolith)) {
  unlinkSync(legacyMonolith)
  console.log(`Removed legacy file ${legacyMonolith}`)
}
console.log(
  `Wrote ${resolve(supergraphDir, 'payload-sdl')}, ${resolve(supergraphDir, 'payload-sdl', '_merged.graphql')}, and subgraphs/<name>/src/<name>.graphql for ${PAYLOAD_SUBGRAPH_DOMAINS.join(', ')}.`,
)
