/**
 * Splits a full SDL file into `supergraph/payload-sdl/*.graphql` for browsing in the editor.
 * Does not use `supergraph/payload.subgraph.graphql` — pass a file path, or `yarn export:subgraph-sdl` writes `payload-sdl` directly.
 *
 * Usage: `yarn split:payload-sdl` (uses supergraph/payload-sdl/_merged.graphql or legacy .graphql if present) or
 *        `yarn split:payload-sdl /path/to/schema.graphql`
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

import { writeSplitPayloadSdlToSupergraph } from './splitPayloadSdlString.mts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const supergraphDir = join(root, 'supergraph')
const legacy = join(supergraphDir, 'payload.subgraph.graphql')
const merged = join(supergraphDir, 'payload-sdl', '_merged.graphql')

const arg = process.argv[2]
const inPath = arg
  ? isAbsolute(arg)
    ? arg
    : resolve(process.cwd(), arg)
  : existsSync(legacy)
    ? legacy
    : existsSync(merged)
      ? merged
      : null

if (!inPath) {
  console.error(
    `No SDL to split. Either:\n` +
      `  run: yarn export:subgraph-sdl  (from romainRetreatServer, with .env: DATABASE_URL, PAYLOAD_SECRET)\n` +
      `  or: yarn split:payload-sdl <path-to-full-subgraph-sdl.graphql>`,
  )
  process.exit(1)
}

const sdl = readFileSync(inPath, 'utf8')
writeSplitPayloadSdlToSupergraph(sdl, supergraphDir)
console.log(
  `Wrote ${join(supergraphDir, 'payload-sdl')} and validated _merged (assumeValid).  (source: ${inPath})`,
)
