import { GRAPHQL_PLAYGROUND_GET, REST_OPTIONS } from '@payloadcms/next/routes'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

import config from '../../romainRetreatCMS/src/payload.config.js'

import { createFederatedGraphqlArtifacts, createFederatedGraphqlPostHandler } from './graphql/createFederatedGraphqlPostHandler.js'

/** Hono's `Request` can be frozen w.r.t. `json`; Payload mutates the request — use a fresh `Request`. */
function toPayloadRequest(incoming: Request): Request {
  const init: RequestInit & { duplex?: 'half' } = {
    method: incoming.method,
    headers: incoming.headers,
    body: incoming.body,
  }
  if (incoming.body) init.duplex = 'half'
  return new Request(incoming.url, init)
}

const defaultCorsOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://localhost:3002',
  'http://127.0.0.1:3002',
  'http://localhost:4000',
  'http://127.0.0.1:4000',
] as const

/**
 * Hono app: Payload-backed Federation 2 subgraph at `/graphql` (and `/api/graphql`).
 * Pair with Apollo Router (see repo `docker-compose.supergraph.yml`) for a supergraph like
 * [supergraph-demo-fed2](https://github.com/apollographql/supergraph-demo-fed2).
 */
export async function createApp() {
  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
    : [...defaultCorsOrigins]

  const { federatedSchema, validationRules } = await createFederatedGraphqlArtifacts(config)
  const graphqlPost = createFederatedGraphqlPostHandler(config, federatedSchema, validationRules)
  const playground = GRAPHQL_PLAYGROUND_GET(config)
  const graphqlOptions = REST_OPTIONS(config)

  const app = new Hono()

  app.use(
    '*',
    cors({
      origin: corsOrigins,
      credentials: true,
    }),
  )

  app.get('/health', (c) => c.json({ status: 'ok' }))

  app.get('/api/graphql-playground', (c) => playground(c.req.raw))
  app.post('/api/graphql', (c) => graphqlPost(toPayloadRequest(c.req.raw)))
  app.options('/api/graphql', (c) =>
    graphqlOptions(c.req.raw, { params: Promise.resolve({ slug: [] }) }),
  )

  // Subgraph URL expected by Apollo Router / `rover subgraph publish` examples.
  app.post('/graphql', (c) => {
    const incoming = c.req.raw
    const u = new URL(incoming.url)
    u.pathname = '/api/graphql'
    const init: RequestInit & { duplex?: 'half' } = {
      method: incoming.method,
      headers: incoming.headers,
      body: incoming.body,
    }
    if (incoming.body) init.duplex = 'half'
    const request = new Request(u.toString(), init)
    return graphqlPost(request)
  })
  app.options('/graphql', (c) =>
    graphqlOptions(c.req.raw, { params: Promise.resolve({ slug: [] }) }),
  )

  return app
}
