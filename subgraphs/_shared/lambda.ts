/**
 * AWS Lambda entry (API Gateway HTTP API / REST, or Function URL).
 * Uses the same Hono app as `subgraphs/_shared/server.ts`; initialize once per cold start.
 *
 * If `createApp()` throws (e.g. DB down, bad env), we still mount a minimal app so
 * you get JSON + 503 instead of an empty 502, and the real error is in CloudWatch
 * (see "createApp() failed" logs).
 */
import './load-env.js'

import { Hono } from 'hono'
import { handle, type LambdaContext, type LambdaEvent } from 'hono/aws-lambda'

import { maybeApplyRdsIamAuth } from './rds-iam-auth.js'

/**
 * Do not static-import `./app.js` at module load. That pulls in `payload.config` (sharp, CMS, …);
 * a load-time failure would bypass the try/catch below and surface as a bare 502 from the runtime.
 * Dynamic import defers that work and lets us return 503 + log the real error in CloudWatch.
 */
let invoke: ReturnType<typeof handle> | undefined

function createBootFailureApp() {
  const a = new Hono()
  a.get('/health', (c) =>
    c.json(
      {
        status: 'unhealthy',
        error: 'Application failed to initialize',
        detail: 'See CloudWatch logs (search for "createApp" or "failed to import").',
      },
      503,
    ),
  )
  a.notFound((c) => {
    if (c.req.path === '/favicon.ico') {
      return c.text('', 204)
    }
    if (c.req.path.includes('graphql') || c.req.path.startsWith('/api/')) {
      return c.json({ errors: [{ message: 'Service unavailable' }] }, 503)
    }
    return c.json({ error: 'Service unavailable' }, 503)
  })
  return a
}

/** Hono’s `handle()` does not `catch` rejections from `app.fetch` — those become an unhandled rejection → API Gateway/Function URL **502** with a tiny body. */
function httpApiV2ErrorBody(status: number, message: string) {
  return {
    statusCode: status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      error: message,
      detail: 'See CloudWatch for this function (unhandled Hono/GraphQL error, or import/createApp failure).',
    }),
  }
}

export const handler = async (event: LambdaEvent, lambdaContext: LambdaContext) => {
  if (!invoke) {
    try {
      // RDS IAM auth must mutate DATABASE_URL BEFORE app.ts loads payload.config —
      // postgresAdapter reads connectionString once at module-init time and never
      // re-reads the env var. No-op when RDS_IAM_AUTH != '1'.
      await maybeApplyRdsIamAuth()
      const { createApp } = await import('./app.js')
      const app = await createApp()
      invoke = handle(app)
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      // eslint-disable-next-line no-console
      console.error(
        '[romainRetreatServer lambda] import app or createApp() failed (DB, env, sharp, or payload config)',
        e,
      )
      invoke = handle(createBootFailureApp())
    }
  }
  try {
    return await invoke(event, lambdaContext)
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[romainRetreatServer lambda] unhandled error during request (Hono fetch/adapter)', e)
    return httpApiV2ErrorBody(503, e instanceof Error ? e.message : String(e))
  }
}
