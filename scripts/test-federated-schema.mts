import { configToSchema } from '@payloadcms/graphql'
import { getPayload } from 'payload'

import config from '../../romainRetreatCMS/src/payload.config.js'
import { buildPayloadSubgraphSchemaFromBase } from '../src/subgraph/buildPayloadSubgraphSchema.js'

async function main() {
  const p = await getPayload({ config })
  const resolved = await config
  const built = await configToSchema(resolved)
  const base = built.schema
  const s = buildPayloadSubgraphSchemaFromBase(base)
  const q = s.getQueryType()
  console.log('Query fields sample:', q ? Object.keys(q.getFields()).slice(0, 8) : 'none')
  console.log('_service', !!q?.getFields()._service)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
