/**
 * Writes Federation subgraph SDL for GraphOS / `rover subgraph publish --schema`.
 * Run from `romainRetreatServer` with the same env as the server (DATABASE_URL, PAYLOAD_SECRET, …).
 */
import { printSubgraphSchema } from '@apollo/subgraph'
import { configToSchema } from '@payloadcms/graphql'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import config from '../../romainRetreatCMS/src/payload.config.js'
import { buildPayloadSubgraphSchemaFromBase } from '../src/subgraph/buildPayloadSubgraphSchema.js'

const out = resolve(process.cwd(), 'supergraph', 'payload.subgraph.graphql')

const resolved = await config
const { schema: base } = await configToSchema(resolved)
const fed = buildPayloadSubgraphSchemaFromBase(base)
const sdl = printSubgraphSchema(fed)
writeFileSync(out, sdl, 'utf8')
console.log(`Wrote ${out}`)
