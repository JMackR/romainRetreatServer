/**
 * Splits a full Federation subgraph SDL string into `supergraph/payload-sdl/*.graphql` + `_merged.graphql`.
 * Used by `export:subgraph-sdl` and by `split:payload-sdl` for an existing file.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { type DefinitionNode, Kind, buildSchema, parse, print } from 'graphql'

import {
  SDL_FILE_HEADER,
  type PayloadSdlFileKey,
  payloadSdlBucketForTypeName,
} from '../subgraphs/_shared/subgraph/payloadSdlBucketForTypeName.js'

const MERGE_ORDER: PayloadSdlFileKey[] = [
  'federation-preamble',
  'operations',
  'content',
  'groups',
  'users',
  'search',
  'globals',
  'system',
  'misc',
]

function definitionName(node: DefinitionNode): string | undefined {
  if (
    (node as { name?: { value: string } }).name &&
    typeof (node as { name: { value: string } }).name.value === 'string'
  ) {
    return (node as { name: { value: string } }).name.value
  }
  return undefined
}

function bucketForDefinition(node: DefinitionNode): PayloadSdlFileKey {
  if (node.kind === Kind.SCHEMA_DEFINITION || node.kind === Kind.SCHEMA_EXTENSION) {
    return 'federation-preamble'
  }
  if (node.kind === Kind.DIRECTIVE_DEFINITION) {
    return 'federation-preamble'
  }
  return payloadSdlBucketForTypeName(node.kind, definitionName(node))
}

export function writeSplitPayloadSdlToSupergraph(sdl: string, supergraphDir: string): void {
  const outDir = join(supergraphDir, 'payload-sdl')
  const byBucket: Record<PayloadSdlFileKey, string[]> = {
    'federation-preamble': [],
    operations: [],
    content: [],
    groups: [],
    users: [],
    search: [],
    globals: [],
    system: [],
    misc: [],
  }
  const doc = parse(sdl)
  for (const def of doc.definitions) {
    byBucket[bucketForDefinition(def)].push(print(def))
  }

  mkdirSync(outDir, { recursive: true })
  const mergedForValidate: string[] = []

  for (const key of MERGE_ORDER) {
    const block = byBucket[key].filter(Boolean).join('\n\n')
    const outName =
      key === 'federation-preamble' ? 'federation-preamble.graphql' : `${key}.graphql`
    const withHeader = key === 'federation-preamble' ? block : `${SDL_FILE_HEADER[key]}${block}\n`
    const path = join(outDir, outName)
    if (key === 'federation-preamble') {
      writeFileSync(path, block || '# empty\n', 'utf8')
    } else {
      writeFileSync(path, withHeader, 'utf8')
    }
    if (block) {
      mergedForValidate.push(block)
    }
  }

  const mergedSdl = mergedForValidate.join('\n\n')
  const mergedPath = join(outDir, '_merged.graphql')
  writeFileSync(mergedPath, `${mergedSdl}\n`, 'utf8')
  buildSchema(mergedSdl, { assumeValid: true, assumeValidSDL: true })
}
