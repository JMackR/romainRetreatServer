/**
 * AWS Lambda entry (API Gateway HTTP API / REST, or Function URL).
 * Uses the same Hono app as `server.ts`; initialize once per cold start.
 */
import 'dotenv/config'

import { handle, type LambdaContext, type LambdaEvent } from 'hono/aws-lambda'

import { createApp } from './app.js'

let invoke: ReturnType<typeof handle> | undefined

export const handler = async (event: LambdaEvent, lambdaContext: LambdaContext) => {
  if (!invoke) {
    const app = await createApp()
    invoke = handle(app)
  }
  return invoke(event, lambdaContext)
}
