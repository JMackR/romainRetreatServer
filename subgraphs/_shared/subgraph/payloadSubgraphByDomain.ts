import { addResolversToSchema } from '@apollo/subgraph/dist/schema-helper/buildSchemaFromSDL.js'
import { buildSubgraphSchema } from '@apollo/subgraph'
import type { GraphQLResolverMap } from '@apollo/subgraph/dist/schema-helper/resolverMap.js'
import { getResolversFromSchema } from '@graphql-tools/utils'
import { filterSchema, healSchema, pruneSchema } from '@graphql-tools/utils'
import { isNamedType, parse, printSchema, type GraphQLSchema } from 'graphql'

import { FEDERATION_PREAMBLE_SDL } from './buildPayloadSubgraphSchema.js'

import { applyFederationEntityModelToSubgraphSdl } from '../federation/applyEntityModelToSubgraphSdl.js'
import { buildEntityResolversForDomain } from '../federation/entityResolvers.js'
import type { PayloadSubgraphDomain } from '../../domains.js'

/**
 * Re-exported from `../../domains.ts` (cft-federation-style `subgraphs/*` list).
 * Logical subgraphs: reduced Query/Mutation, Federation 2 entities with a single
 * **owning** subgraph per `type T @key(fields: "id")` and reference stubs
 * `type T @key(fields: "id", resolvable: false) { id: Int! }` elsewhere for merge-safe SDL.
 */
export { isPayloadSubgraphDomain, PAYLOAD_SUBGRAPH_DOMAINS, type PayloadSubgraphDomain } from '../../domains.js'

function isRootFieldInDomain(
  _operation: 'Query' | 'Mutation' | 'Subscription',
  fieldName: string,
  domain: PayloadSubgraphDomain,
): boolean {
  if (fieldName === '_service' || fieldName === '_entities') {
    return true
  }
  if (fieldName.startsWith('__')) {
    return true
  }
  if (fieldName.includes('Group')) {
    return domain === 'groups'
  }
  if (fieldName.includes('Search')) {
    return domain === 'search'
  }
  if (fieldName.includes('Payload')) {
    return domain === 'system'
  }
  if (fieldName.includes('User')) {
    return domain === 'users'
  }
  return domain === 'content'
}

function prunedFederatedView(federated: GraphQLSchema, domain: PayloadSubgraphDomain): GraphQLSchema {
  const filter = (operation: 'Query' | 'Mutation' | 'Subscription', name: string) => {
    return isRootFieldInDomain(operation, name, domain)
  }
  return healSchema(
    pruneSchema(
      filterSchema({
        schema: federated,
        rootFieldFilter: filter,
      }),
      {
        skipUnimplementedInterfacesPruning: true,
        // Keep link__/join__ etc. if still referenced (prune+print must stay consistent).
        skipPruning: (t) => {
          if (!isNamedType(t)) {
            return false
          }
          const n = t.name
          return (
            n.startsWith('link__') ||
            n.startsWith('join__') ||
            n.startsWith('federation__') ||
            n === '_Service' ||
            n === '_Entity'
          )
        },
      },
    ),
  )
}

/**
 * Shrink the monolith Payload Federation 2 subgraph to one concern, then re-apply
 * Apollo `buildSubgraphSchema` with @key + `__resolveReference` on the owning service only.
 */
export function buildFederatedSubgraphForDomain(
  federated: GraphQLSchema,
  domain: PayloadSubgraphDomain,
): GraphQLSchema {
  const pruned = prunedFederatedView(federated, domain)
  const printed = printSchema(pruned)
  const sdl = /extend schema\s*@link/.test(printed) ? printed : `${FEDERATION_PREAMBLE_SDL}\n${printed}`
  const withKeys = applyFederationEntityModelToSubgraphSdl(parse(sdl), domain)
  const out = buildSubgraphSchema({ typeDefs: withKeys, resolvers: {} })
  const fromPayload = getResolversFromSchema(pruned, true) as GraphQLResolverMap<unknown>
  // `buildSubgraphSchema({ typeDefs: withKeys })` above installs the correct per-domain
  // `_service.sdl` and `_entities` resolvers on `out`. `pruned` inherits the matching
  // resolvers from the *unpruned* federated parent (whose `_service.sdl` returns the
  // full 532 KB monolith SDL); copying those over via addResolversToSchema would
  // silently overwrite the per-domain ones and every subgraph would re-advertise the
  // entire schema — composition fails and every domain subgraph looks identical to
  // `_service { sdl }`. Strip the federation built-ins before copying.
  const r = fromPayload as Record<string, unknown> & { Query?: Record<string, unknown> }
  delete r._Service
  delete r._Entity
  if (r.Query) {
    delete r.Query._service
    delete r.Query._entities
  }
  const entity = buildEntityResolversForDomain(domain)
  addResolversToSchema(out, fromPayload)
  addResolversToSchema(out, entity)
  return out
}
