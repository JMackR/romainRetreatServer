import type { GraphQLResolverMap } from '@apollo/subgraph/dist/schema-helper/resolverMap.js'
import type { Payload } from 'payload'

import { collectionForEntityTypeName, ownerForEntityTypeName, ENTITY_TYPE_TO_COLLECTION } from './entityModel.js'
import type { PayloadSubgraphDomain } from '../subgraph/payloadSubgraphByDomain.js'

type Reference = { id?: string | number; [key: string]: unknown }

type Context = { req: { payload: Payload; context?: unknown } }
/**
 * `__resolveReference` for entity types this subgraph **owns** (Federation 2: router fans out `_entities` here).
 */
export function buildEntityResolversForDomain(
  domain: PayloadSubgraphDomain,
): GraphQLResolverMap<unknown> {
  const r: GraphQLResolverMap<unknown> = {}
  for (const typeName of new Set([...Object.keys(ENTITY_TYPE_TO_COLLECTION)])) {
    if (ownerForEntityTypeName(typeName) !== domain) {
      continue
    }
    const col = collectionForEntityTypeName(typeName)
    if (col == null) {
      continue
    }
    r[typeName] = {
      __resolveReference: async (ref: Reference, context: Context) => {
        const id = ref?.id
        if (id === undefined || id === null) {
          return null
        }
        return context?.req?.payload.findByID({ collection: col, id, depth: 0 })
      },
    }
  }
  return r
}
