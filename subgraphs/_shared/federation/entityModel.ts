import type { PayloadSubgraphDomain } from '../subgraph/payloadSubgraphByDomain.js'

/**
 * Subgraph that **owns** the full `type` + `__resolveReference` for this object (int `id` key).
 * Other domains use `type T @key(fields: "id", resolvable: false) { id: Int! }`.
 */
export const ENTITY_TYPE_OWNER: Partial<Record<string, PayloadSubgraphDomain>> = {
  User: 'users',
  Page: 'content',
  Post: 'content',
  Media: 'content',
  Category: 'content',
  Redirect: 'content',
  Form: 'content',
  FormSubmission: 'content',
  Search: 'search',
  Group: 'groups',
  GroupMember: 'groups',
  GroupPost: 'groups',
  GroupComment: 'groups',
  GroupPostLike: 'groups',
  GroupCommentLike: 'groups',
  GroupEvent: 'groups',
  GroupInvite: 'groups',
  PayloadKv: 'system',
  PayloadJob: 'system',
  PayloadFolder: 'system',
  PayloadLockedDocument: 'system',
  PayloadPreference: 'system',
}

export function defaultOwnerForEntityTypeName(typeName: string): PayloadSubgraphDomain {
  if (typeName.startsWith('Payload') || typeName.toLowerCase().includes('payload')) {
    return 'system'
  }
  if (typeName.startsWith('Group')) {
    return 'groups'
  }
  if (typeName === 'User' || (typeName.includes('User') && !typeName.includes('Group') && !typeName.includes('Payload'))) {
    return 'users'
  }
  if (typeName === 'Search' || typeName.startsWith('Search')) {
    return 'search'
  }
  return 'content'
}

export function ownerForEntityTypeName(typeName: string): PayloadSubgraphDomain {
  return ENTITY_TYPE_OWNER[typeName] ?? defaultOwnerForEntityTypeName(typeName)
}

/**
 * `payload.findByID` collection (must match your config + plugins for these GraphQL type names).
 */
export const ENTITY_TYPE_TO_COLLECTION: Partial<Record<string, string>> = {
  User: 'users',
  Page: 'pages',
  Post: 'posts',
  Media: 'media',
  Category: 'categories',
  Redirect: 'redirects',
  Form: 'forms',
  FormSubmission: 'form-submissions',
  Search: 'search',
  Group: 'groups',
  GroupMember: 'groupMembers',
  GroupPost: 'groupPosts',
  GroupComment: 'groupComments',
  GroupPostLike: 'groupPostLikes',
  GroupCommentLike: 'groupCommentLikes',
  GroupEvent: 'groupEvents',
  GroupInvite: 'groupInvites',
  PayloadKv: 'payload-kv',
  PayloadJob: 'payload-jobs',
  PayloadFolder: 'payload-folders',
  PayloadLockedDocument: 'payload-locked-documents',
  PayloadPreference: 'payload-preferences',
}

export function collectionForEntityTypeName(typeName: string): string | null {
  return ENTITY_TYPE_TO_COLLECTION[typeName] ?? null
}
