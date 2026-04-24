import 'dotenv/config'

import { serve } from '@hono/node-server'

import { createApp } from './app.js'

const port = Number(process.env.PORT || 3002)
/** Bind all interfaces so the process is reachable from Docker / LAN (default 0.0.0.0). */
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
    console.log(`romainRetreatServer listening on http://${addr}:${listenPort}`)
    console.log(`  Subgraph POST /graphql and /api/graphql`)
    console.log(`  Playground    http://${addr}:${listenPort}/api/graphql-playground`)
    console.log(`  Health        http://${addr}:${listenPort}/health`)
  },
)
