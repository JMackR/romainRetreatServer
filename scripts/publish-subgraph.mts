/**
 * Loads `apollo.publish.env`, regenerates `supergraph/payload.subgraph.graphql`, runs `rover subgraph publish`.
 * Run from `romainRetreatServer`: `yarn publish:subgraph`
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { config } from 'dotenv'

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const envPath = resolve(root, 'apollo.publish.env')

if (!existsSync(envPath)) {
  console.error(`Missing ${envPath}. Copy apollo.publish.env.example and set APOLLO_KEY, SUBGRAPH_ROUTING_URL, DATABASE_URL, PAYLOAD_SECRET.`)
  process.exit(1)
}

// Load secrets for export: prefer repo `docker.env`, then local `.env`, then Apollo publish file (wins for APOLLO_*).
config({ path: resolve(root, '../../docker.env') })
config({ path: resolve(root, '.env') })
config({ path: envPath })

const apolloKey = process.env.APOLLO_KEY
const graphRef = process.env.APOLLO_GRAPH_REF || 'RomainRetreat@current'
const subgraphName = process.env.SUBGRAPH_NAME || 'payload'
const routingUrl = process.env.SUBGRAPH_ROUTING_URL

if (!apolloKey) {
  console.error('APOLLO_KEY is missing in apollo.publish.env')
  process.exit(1)
}
if (!routingUrl) {
  console.error('SUBGRAPH_ROUTING_URL is missing in apollo.publish.env')
  process.exit(1)
}
if (!process.env.DATABASE_URL || !process.env.PAYLOAD_SECRET) {
  console.error('DATABASE_URL and PAYLOAD_SECRET must be set (in apollo.publish.env, .env, or ../../docker.env) for export:subgraph-sdl.')
  process.exit(1)
}

function run(cmd: string, args: string[], extraEnv: Record<string, string> = {}) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
    shell: process.platform === 'win32',
  })
  if (r.error) throw r.error
  if (r.status !== 0) process.exit(r.status ?? 1)
}

console.log('Generating subgraph SDL…')
run('yarn', ['export:subgraph-sdl'])

const schemaPath = resolve(root, 'supergraph', 'payload.subgraph.graphql')
console.log(`Publishing subgraph "${subgraphName}" to ${graphRef}…`)

run(
  'npx',
  [
    '--yes',
    '@apollo/rover@0.38.1',
    'subgraph',
    'publish',
    graphRef,
    '--schema',
    schemaPath,
    '--name',
    subgraphName,
    '--routing-url',
    routingUrl,
  ],
  { APOLLO_KEY: apolloKey },
)

console.log('Done.')
