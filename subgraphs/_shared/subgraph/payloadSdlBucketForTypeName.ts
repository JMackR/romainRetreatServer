/**
 * Puts each definition from a full SDL string into a file under `supergraph/payload-sdl/`.
 * Heuristic; the merged SDL must still parse. Produced by `yarn export:subgraph-sdl` or `yarn split:payload-sdl`.
 */
export const SDL_OUTPUT_BUCKETS = [
  'federation-preamble',
  'operations',
  'content',
  'groups',
  'users',
  'search',
  'globals',
  'system',
  'misc',
] as const
export type PayloadSdlFileKey = (typeof SDL_OUTPUT_BUCKETS)[number]

/** Use `#` lines so merged validation does not stack invalid bare descriptions. */
const header = (label: string) =>
  `# Split SDL (yarn export:subgraph-sdl) | bucket: ${label}\n\n`

export const SDL_FILE_HEADER: Record<Exclude<PayloadSdlFileKey, 'federation-preamble'>, string> = {
  operations: header('operations (Query, Mutation, Subscription)'),
  content: header('content (pages, posts, media, forms, …)'),
  groups: header('groups'),
  users: header('users / auth'),
  search: header('search collection'),
  globals: header('globals (Header, Footer)'),
  system: header('system (Payload* system types)'),
  misc: header('scalars, directives, and unclassified'),
}

export function payloadSdlBucketForTypeName(
  defKind: string,
  name: string | null | undefined,
): PayloadSdlFileKey {
  if (defKind === 'SchemaDefinition' || defKind === 'SchemaExtension' || defKind === 'DirectiveDefinition') {
    return 'federation-preamble'
  }
  if (defKind === 'ScalarTypeDefinition') {
    return 'misc'
  }
  if (name == null) {
    return 'misc'
  }
  if (defKind === 'ObjectTypeDefinition' && (name === 'Query' || name === 'Mutation' || name === 'Subscription')) {
    return 'operations'
  }
  if (name.includes('Group')) {
    return 'groups'
  }
  if (name.includes('Search')) {
    return 'search'
  }
  if (name.includes('Payload')) {
    return 'system'
  }
  if (name.startsWith('Header') || name.startsWith('Footer')) {
    return 'globals'
  }
  if (name.includes('User') || /^users/i.test(name) || /usersMe/i.test(name) || /MeUser/i.test(name)) {
    return 'users'
  }
  const l = name.toLowerCase()
  if (l.startsWith('vers') && l.includes('user')) {
    return 'users'
  }
  if (
    l.startsWith('page') ||
    l.startsWith('post') ||
    l.startsWith('media') ||
    l.startsWith('category') ||
    l.startsWith('redirect') ||
    l.startsWith('form') ||
    l.startsWith('allmedia')
  ) {
    return 'content'
  }
  if (l.startsWith('vers') || l.startsWith('version')) {
    return 'content'
  }
  if (l.startsWith('user') || l.startsWith('userme')) {
    return 'users'
  }
  return 'misc'
}
