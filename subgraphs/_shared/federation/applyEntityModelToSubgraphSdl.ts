import { Kind, type DocumentNode, type ObjectTypeDefinitionNode, visit, parse } from 'graphql'

import { ownerForEntityTypeName } from './entityModel.js'
import type { PayloadSubgraphDomain } from '../subgraph/payloadSubgraphByDomain.js'

const TEMPLATEStub = /* GraphQL */ `
  type T @key(fields: "id", resolvable: false) {
    id: Int!
  }
`
const TEMPLATEOwner = /* GraphQL */ `
  type T @key(fields: "id") {
    id: Int!
  }
`
// `@shareable` lets the same value type appear in multiple subgraphs (e.g.
// Media_Sizes_Medium, *DocAccess, …) without Federation 2's default
// non-shareable rule causing INVALID_FIELD_SHARING composition errors.
const TEMPLATEShareable = /* GraphQL */ `
  type T @shareable {
    placeholder: String
  }
`

const astStub = parse(TEMPLATEStub).definitions[0] as ObjectTypeDefinitionNode
const keyDirectiveStub = astStub.directives!
const idFieldInt = astStub.fields![0]!
const keyDirectiveOwner = (parse(TEMPLATEOwner).definitions[0] as ObjectTypeDefinitionNode)
  .directives![0]!
const shareableDirective = (parse(TEMPLATEShareable).definitions[0] as ObjectTypeDefinitionNode)
  .directives![0]!

function isJoinOrInternalType(name: string): boolean {
  return name.startsWith('__') || name.startsWith('join_') || name === '_Service' || name === '_Entity'
}

function isNonNullIntOrIdIdField(node: ObjectTypeDefinitionNode): boolean {
  const f = node.fields?.find((x) => x.name.value === 'id')
  if (!f) {
    return false
  }
  const t = f.type
  if (t.kind === Kind.NON_NULL_TYPE) {
    const n2 = t.type
    if (n2.kind === Kind.NAMED_TYPE) {
      return n2.name.value === 'Int' || n2.name.value === 'ID'
    }
    return false
  }
  if (t.kind === Kind.NAMED_TYPE) {
    return t.name.value === 'Int' || t.name.value === 'ID'
  }
  return false
}

function withOwnerKeyDirective(node: ObjectTypeDefinitionNode): ObjectTypeDefinitionNode {
  const dirs = node.directives
  if (dirs?.some((d) => d.name.value === 'key')) {
    return node
  }
  return {
    ...node,
    directives: [...(dirs || []), keyDirectiveOwner] as never,
  } as ObjectTypeDefinitionNode
}

function withShareableDirective(node: ObjectTypeDefinitionNode): ObjectTypeDefinitionNode {
  const dirs = node.directives
  if (dirs?.some((d) => d.name.value === 'shareable' || d.name.value === 'inaccessible' || d.name.value === 'key')) {
    return node
  }
  return {
    ...node,
    directives: [...(dirs || []), shareableDirective] as never,
  } as ObjectTypeDefinitionNode
}

function toStubTypeDefinition(
  typeName: string,
  description: ObjectTypeDefinitionNode['description'],
): ObjectTypeDefinitionNode {
  return {
    kind: Kind.OBJECT_TYPE_DEFINITION,
    name: { kind: Kind.NAME, value: typeName },
    description: description,
    fields: [idFieldInt] as [typeof idFieldInt],
    directives: keyDirectiveStub,
  } as ObjectTypeDefinitionNode
}

/**
 * Owning domain: add `@key(fields: "id")` on `id: Int!` / `id: ID!` types.
 * Other domains: `type T @key(fields: "id", resolvable: false) { id: Int! }`.
 */
export function applyFederationEntityModelToSubgraphSdl(
  document: DocumentNode,
  domain: PayloadSubgraphDomain,
): DocumentNode {
  return visit(document, {
    ObjectTypeDefinition: (node) => {
      if (node.kind !== Kind.OBJECT_TYPE_DEFINITION) {
        return
      }
      const n = node.name.value
      if (n === 'Query' || n === 'Mutation' || n === 'Subscription' || isJoinOrInternalType(n)) {
        return
      }
      if (!isNonNullIntOrIdIdField(node)) {
        // Value type (no id field) — appears in multiple subgraphs (e.g. Media_Sizes_*,
        // *DocAccess, PayloadPreferences*); mark @shareable so Federation 2 composition
        // doesn't reject it as INVALID_FIELD_SHARING.
        return withShareableDirective(node)
      }
      const owner = ownerForEntityTypeName(n)
      if (owner === domain) {
        return withOwnerKeyDirective(node)
      }
      return toStubTypeDefinition(n, node.description)
    },
  }) as DocumentNode
}
