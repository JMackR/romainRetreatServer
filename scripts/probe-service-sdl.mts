// Compares what `printSubgraphSchema(s)` says vs what `_service { sdl }` actually
// returns when you EXECUTE the introspection query against the pruned schema.
// Both should be identical; if the deployed Lambda diverges from this output we know
// the bundle is wrong; if THIS script also returns the full monolith then the
// pruning never makes it into the @apollo/subgraph runtime.
import { configToSchema } from '@payloadcms/graphql'
import { printSubgraphSchema } from '@apollo/subgraph'
import { graphql } from 'graphql'

import configP from '../../romainRetreatCMS/src/payload.config.js'
import { buildPayloadSubgraphSchemaFromBase } from '../subgraphs/_shared/subgraph/buildPayloadSubgraphSchema.js'
import { buildFederatedSubgraphForDomain } from '../subgraphs/_shared/subgraph/payloadSubgraphByDomain.js'

const cfg = await configP
const { schema: base } = await configToSchema(cfg)
const fed = buildPayloadSubgraphSchemaFromBase(base)

for (const d of ['users', 'system', 'content'] as const) {
  const s = buildFederatedSubgraphForDomain(fed, d)
  const printed = printSubgraphSchema(s)
  const result = await graphql({
    schema: s,
    source: '{ _service { sdl } }',
  })
  const sdlField = (result.data as { _service?: { sdl?: string } } | null)?._service?.sdl
  console.log(`domain=${d} printSubgraphSchema=${printed.length} _service.sdl=${sdlField?.length ?? 'NULL'}`)
  if (sdlField && sdlField.length > printed.length * 2) {
    console.log(`  ⚠ _service.sdl is ${(sdlField.length / printed.length).toFixed(1)}x bigger than printSubgraphSchema — pruning is bypassed at runtime`)
    console.log('  first 250 chars of _service.sdl:')
    console.log('  ' + sdlField.slice(0, 250).replace(/\n/g, '\n  '))
  }
}
