/**
 * Smoke-test: `yarn tsx scripts/verify-domain-federation.mts` (from romainRetreatServer, with env).
 */
import { configToSchema } from '@payloadcms/graphql'
import { printSubgraphSchema } from '@apollo/subgraph'
import { parse } from 'graphql'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'

import configP from '../../romainRetreatCMS/src/payload.config.js'
import { buildPayloadSubgraphSchemaFromBase } from '../subgraphs/_shared/subgraph/buildPayloadSubgraphSchema.js'
import { buildFederatedSubgraphForDomain } from '../subgraphs/_shared/subgraph/payloadSubgraphByDomain.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
config({ path: resolve(root, '.env') })

const cfg = await configP
const { schema: base } = await configToSchema(cfg)
const fed = buildPayloadSubgraphSchemaFromBase(base)
for (const d of ['content', 'users', 'system'] as const) {
  const s = buildFederatedSubgraphForDomain(fed, d)
  const t = printSubgraphSchema(s)
  const u = t.includes('type User')
  const stub = t.includes('resolvable: false') && t.match(/type User/)
  console.log(`domain ${d} len=${t.length} has User in SDL: ${u} (stub hint: ${Boolean(stub)})`)
  if (d === 'content' && t.includes('type User')) {
    // expect stub line
    const doc = parse(t)
    const f = t.split('\n').find((l) => l.includes('type User @key'))
    console.log('  sample User line:', f || '(none)')
  }
  if (d === 'users' && t.includes('type User')) {
    const f = t.split('\n').find((l) => l.includes('type User @key'))
    console.log('  sample User line:', f || '(none)')
  }
}
console.log('ok')
