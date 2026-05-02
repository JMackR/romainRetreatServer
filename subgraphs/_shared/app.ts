import { Hono } from 'hono'
import { cors } from 'hono/cors'

import config from '../../../romainRetreatCMS/src/payload.config.js'

import { createFederatedGraphqlArtifacts, createFederatedGraphqlPostHandler } from './graphql/createFederatedGraphqlPostHandler.js'
import {
  PAYLOAD_SUBGRAPH_DOMAINS,
  type PayloadSubgraphDomain,
  buildFederatedSubgraphForDomain,
  isPayloadSubgraphDomain,
} from './subgraph/payloadSubgraphByDomain.js'

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
 * On Lambda, set `PAYLOAD_LAMBDA_SUBGRAPH=unified` (or omit) to expose the full app + all
 * `/api/subgraph/:domain/graphql` paths. Set to `users` | `groups` | `search` | `content` |
 * `system` to run a **single** domain handler at `POST /graphql` and `.../api/subgraph/<name>/graphql`
 * (one logical subgraph per function — use one stack + parameter per GraphOS `routing_url`).
 */
export async function createApp() {
  const mode = (process.env.PAYLOAD_LAMBDA_SUBGRAPH || 'unified').toLowerCase()
  const single = mode !== 'unified' && isPayloadSubgraphDomain(mode) ? mode : undefined
  if (mode !== 'unified' && !isPayloadSubgraphDomain(mode) && !single) {
    // eslint-disable-next-line no-console
    console.warn(
      `[romainRetreatServer] PAYLOAD_LAMBDA_SUBGRAPH="${process.env.PAYLOAD_LAMBDA_SUBGRAPH}" is invalid; using unified`,
    )
  }

  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
    : [...defaultCorsOrigins]

  const { federatedSchema, validationRules } = await createFederatedGraphqlArtifacts(config)

  const app = new Hono()

  app.use(
    '*',
    cors({
      origin: corsOrigins,
      credentials: true,
    }),
  )

  // CORS preflights (OPTIONS) are handled by the global hono/cors middleware above —
  // no per-route OPTIONS handlers needed. The legacy GET /api/graphql-playground was
  // backed by `@payloadcms/next` which dragged the entire Next admin UI into the Lambda
  // bundle (next, @next, monaco-editor, react-datepicker — pushed node_modules over the
  // 250 MB unzipped Lambda limit). Use Apollo Studio Sandbox instead for ad-hoc queries.

  if (single) {
    const s = buildFederatedSubgraphForDomain(federatedSchema, single)
    const onePost = createFederatedGraphqlPostHandler(config, s, validationRules)
    app.get('/health', (c) =>
      c.json({
        status: 'ok',
        subgraph: single,
        mode: 'single-domain-lambda',
        runtime: process.env.AWS_LAMBDA_FUNCTION_NAME ? 'aws-lambda' : 'local',
      }),
    )
    app.post('/api/graphql', (c) => onePost(toPayloadRequest(c.req.raw)))
    app.post('/graphql', (c) => onePost(toPayloadRequest(c.req.raw)))
    app.post('/api/subgraph/:domain/graphql', (c) => {
      if (c.req.param('domain') !== single) {
        return c.text('Not Found', 404)
      }
      return onePost(toPayloadRequest(c.req.raw))
    })
    app.post('/subgraph/:domain/graphql', (c) => {
      if (c.req.param('domain') !== single) {
        return c.text('Not Found', 404)
      }
      return onePost(toPayloadRequest(c.req.raw))
    })
    return app
  }

  const graphqlPost = createFederatedGraphqlPostHandler(config, federatedSchema, validationRules)
  const postByDomain: Record<PayloadSubgraphDomain, (request: Request) => Promise<Response>> = {} as Record<
    PayloadSubgraphDomain,
    (request: Request) => Promise<Response>
  >
  for (const d of PAYLOAD_SUBGRAPH_DOMAINS) {
    const s = buildFederatedSubgraphForDomain(federatedSchema, d)
    postByDomain[d] = createFederatedGraphqlPostHandler(config, s, validationRules)
  }

  app.get('/health', (c) =>
    c.json({
      status: 'ok',
      mode: 'unified',
      runtime: process.env.AWS_LAMBDA_FUNCTION_NAME ? 'aws-lambda' : 'local',
    }),
  )

  app.post('/api/graphql', (c) => graphqlPost(toPayloadRequest(c.req.raw)))

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

  app.post('/api/subgraph/:domain/graphql', (c) => {
    const id = c.req.param('domain')
    if (!isPayloadSubgraphDomain(id)) {
      return c.text('Not Found', 404)
    }
    return postByDomain[id](toPayloadRequest(c.req.raw))
  })
  app.post('/subgraph/:domain/graphql', (c) => {
    const id = c.req.param('domain')
    if (!isPayloadSubgraphDomain(id)) {
      return c.text('Not Found', 404)
    }
    return postByDomain[id](toPayloadRequest(c.req.raw))
  })

  return app
}
