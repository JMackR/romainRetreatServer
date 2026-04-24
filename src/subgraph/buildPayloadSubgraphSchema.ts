import { buildSubgraphSchema } from '@apollo/subgraph'
// Apollo's helper mutates the federated schema in-place; graphql-tools' version
// expects a different schema shape and throws on subgraph schemas.
import type { GraphQLResolverMap } from '@apollo/subgraph/dist/schema-helper/resolverMap.js'
import { addResolversToSchema } from '@apollo/subgraph/dist/schema-helper/buildSchemaFromSDL.js'
import { getResolversFromSchema } from '@graphql-tools/utils'
import { parse, printSchema, type GraphQLSchema } from 'graphql'
/**
 * Federation v2 link directives + Payload's printed schema, composed as one Apollo subgraph.
 * Resolvers are copied from Payload's executable schema so runtime behavior matches `/api/graphql`.
 *
 * Use {@link buildPayloadSubgraphSchemaFromBase} with `configToSchema(config)` when
 * `payload.schema` is not populated (e.g. `graphQL.disable` is true).
 */
const FEDERATION_LINK_SDL = /* GraphQL */ `
extend schema
  @link(url: "https://specs.apollo.dev/link/v1.0")
  @link(
    url: "https://specs.apollo.dev/federation/v2.8"
    import: [
      "@key"
      "@shareable"
      "@inaccessible"
      "@tag"
      "@override"
      "@extends"
      "@external"
      "@requires"
      "@provides"
    ]
  )
`

export function buildPayloadSubgraphSchemaFromBase(base: GraphQLSchema): GraphQLSchema {
  const printed = printSchema(base)
  const schema = buildSubgraphSchema({
    typeDefs: parse(`${FEDERATION_LINK_SDL}\n${printed}`),
  })
  const resolvers = getResolversFromSchema(base, true)
  addResolversToSchema(schema, resolvers as GraphQLResolverMap<unknown>)
  return schema
}
