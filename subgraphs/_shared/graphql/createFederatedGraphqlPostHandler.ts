import { configToSchema } from '@payloadcms/graphql'
import { createHandler } from 'graphql-http/lib/use/fetch'
import type { GraphQLError, GraphQLSchema } from 'graphql'
import {
  addDataAndFileToRequest,
  addLocalesToRequestFromData,
  createPayloadRequest,
  headersWithCors,
  logError,
  mergeHeaders,
} from 'payload'
import type { SanitizedConfig } from 'payload'

import { buildPayloadSubgraphSchemaFromBase } from '../subgraph/buildPayloadSubgraphSchema.js'

type Config = SanitizedConfig | Promise<SanitizedConfig>

const INTERNAL_ERROR = 500

const handleError = async ({
  err,
  payload,
  req,
}: {
  err: { message: string; locations?: unknown; path?: unknown; originalError?: { status?: number; data?: unknown; name?: string }; stack?: string }
  payload: { config: { debug?: boolean } }
  req: { context: unknown }
}) => {
  const status = err.originalError?.status || INTERNAL_ERROR
  let errorMessage = err.message
  logError({ err: err as never, payload: payload as never })
  if (!payload.config.debug && status === INTERNAL_ERROR) {
    errorMessage = 'Something went wrong.'
  }
  const response = {
    extensions: {
      name: err?.originalError?.name || undefined,
      data: (err && err.originalError && err.originalError.data) || undefined,
      stack: payload.config.debug ? err.stack : undefined,
      statusCode: status,
    },
    locations: err.locations,
    message: errorMessage,
    path: err.path,
  }
  return response
}

/**
 * GraphQL-over-HTTP handler using a Federation 2 subgraph schema built from Payload's
 * `configToSchema` output (same execution as Payload's Next route, plus `_service` / `_entities`).
 */
export function createFederatedGraphqlPostHandler(
  config: Config,
  federatedSchema: GraphQLSchema,
  validationRules: (args: import('graphql').ExecutionArgs) => import('graphql').ValidationRule[],
) {
  return async (request: Request): Promise<Response> => {
    const originalRequest = request.clone()
    const resolvedConfig = await config
    const req = await createPayloadRequest({
      canSetHeaders: true,
      config: resolvedConfig,
      request,
    })
    await addDataAndFileToRequest(req)
    addLocalesToRequestFromData(req)
    const { payload } = req
    const headers: Record<string, string> = {}
    const apiResponse = await createHandler({
      context: {
        headers,
        req,
      },
      onOperation: async (_request, args, result) => {
        const response =
          typeof payload.extensions === 'function'
            ? await payload.extensions({
                args,
                req: _request,
                result,
              })
            : result
        if (response.errors && result.errors) {
          const errors = await Promise.all(
            result.errors.map((error: GraphQLError) =>
              handleError({
                err: error as never,
                payload: payload as never,
                req: req as never,
              }),
            ),
          )
          return {
            ...response,
            errors,
          }
        }
        return response
      },
      schema: federatedSchema,
      validationRules: (_, args, defaultRules) => defaultRules.concat(validationRules(args)),
    })(originalRequest)
    const resHeaders = headersWithCors({
      headers: new Headers(apiResponse.headers),
      req,
    })
    for (const key in headers) {
      resHeaders.append(key, headers[key])
    }
    return new Response(apiResponse.body, {
      headers: req.responseHeaders ? mergeHeaders(req.responseHeaders, resHeaders) : resHeaders,
      status: apiResponse.status,
    })
  }
}

export async function createFederatedGraphqlArtifacts(config: Config): Promise<{
  federatedSchema: GraphQLSchema
  validationRules: (args: import('graphql').ExecutionArgs) => import('graphql').ValidationRule[]
}> {
  const resolvedConfig = await config
  const { schema: base, validationRules } = await configToSchema(resolvedConfig)
  const federatedSchema = buildPayloadSubgraphSchemaFromBase(base)
  return { federatedSchema, validationRules }
}
