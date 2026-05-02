import './load-env.js'

import { serve } from '@hono/node-server'

import { createApp } from './app.js'

/**
 * Hono + Payload for local `node` (not AWS Lambda). Used by `subgraphs/_shared/server.ts` and
 * `subgraphs/_shared/bootstrap.ts` to run a single `PAYLOAD_LAMBDA_SUBGRAPH` slice.
 */
export async function startGraphqlServer() {
  const port = Number(process.env.PORT || 3002)
  const hostname = process.env.HOST || '0.0.0.0'
  const app = await createApp()

  serve(
    {
      fetch: app.fetch,
      port,
      hostname,
    },
    (info) => {
      const listenPort =
        info && typeof info === 'object' && 'port' in info && typeof info.port === 'number'
          ? info.port
          : port
      const addr =
        info && typeof info === 'object' && 'address' in info && typeof info.address === 'string'
          ? info.address
          : hostname
      const mode = (process.env.PAYLOAD_LAMBDA_SUBGRAPH || 'unified').toLowerCase()
      // eslint-disable-next-line no-console
      console.log(`romainRetreatServer listening on http://${addr}:${listenPort}`)
      // eslint-disable-next-line no-console
      console.log(
        `  PAYLOAD_LAMBDA_SUBGRAPH=${mode}  |  /graphql, /api/graphql, /api/subgraph/:domain/graphql`,
      )
      // eslint-disable-next-line no-console
      console.log(`  Playground    http://${addr}:${listenPort}/api/graphql-playground`)
      // eslint-disable-next-line no-console
      console.log(`  Health        http://${addr}:${listenPort}/health`)
    },
  )
}
