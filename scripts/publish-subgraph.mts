/**
 * Loads `apollo.publish.env`, runs `export:subgraph-sdl` (writes `supergraph/payload-sdl/`), then `rover subgraph publish` using `_merged.graphql`.
 * Run from `romainRetreatServer`: `yarn publish:subgraph`
 *
 * **Routing URL:** `SUBGRAPH_ROUTING_URL` in `apollo.publish.env` wins if set to a **non-local** value.
 * If it is **unset/empty** or you set `SUBGRAPH_ROUTING_URL=auto`, the script reads
 * `supergraph/schema/aws.unified-file.yaml` for `SUBGRAPH_NAME` (default `payload`) — the same
 * host as `compose:supergraph:aws:file`. If your env still has `http://127.0.0.1:...`, you will
 * be warned; use `SUBGRAPH_USE_LOCALHOST_ROUTING=1` to force local, or remove the var to use the YAML.
 *
 * (Publishing **five** domain-pruned subgraphs to GraphOS needs a different SDL per name; this script
 * publishes the **unified** monolith SDL once, which matches the `payload` subgraph in that YAML.)
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
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
const useLocalhost =
  process.env.SUBGRAPH_USE_LOCALHOST_ROUTING === '1' || process.env.SUBGRAPH_USE_LOCALHOST_ROUTING === 'true'

function readRoutingUrlFromSupergraphAwsUnifiedFile(name: string): string | null {
  const primary = resolve(root, 'supergraph', 'schema', 'aws.unified-file.yaml')
  const legacy = resolve(root, 'supergraph', 'supergraph.aws.unified-file.yaml')
  const f = existsSync(primary) ? primary : existsSync(legacy) ? legacy : null
  if (!f) {
    return null
  }
  const text = readFileSync(f, 'utf8')
  // Example block:
  //   payload:
  //     routing_url: https://.../graphql
  const m = new RegExp(`^\\s*${name}:\\s*\\n\\s+routing_url:\\s*(.+)`, 'm').exec(text)
  if (m) {
    return m[1]!.trim().replace(/['"]/g, '')
  }
  return null
}

const envRouting = (process.env.SUBGRAPH_ROUTING_URL || '').trim()
const fromYaml = readRoutingUrlFromSupergraphAwsUnifiedFile(subgraphName)
function isLoopbackUrl(u: string): boolean {
  if (/^https?:\/\/(127\.0\.0\.1|localhost)\b/i.test(u)) {
    return true
  }
  try {
    return /127\.0\.0\.1|localhost/i.test(new URL(u).hostname)
  } catch {
    return /127\.0\.0\.1|localhost/i.test(u)
  }
}

let routingUrl: string | null = null
if (envRouting === 'auto' || envRouting === '') {
  routingUrl = fromYaml
  if (routingUrl) {
    console.log('Using SUBGRAPH_ROUTING_URL from supergraph/schema/aws.unified-file.yaml')
  }
} else {
  routingUrl = envRouting
  if (isLoopbackUrl(routingUrl) && !useLocalhost) {
    if (fromYaml) {
      console.warn(
        `SUBGRAPH_ROUTING_URL is a local/loopback address (${routingUrl}). GraphOS cannot reach that from the public internet. Using routing_url from supergraph/schema/aws.unified-file.yaml for subgraph "${subgraphName}" instead.\n` +
          `  To keep publishing a loopback URL, set SUBGRAPH_USE_LOCALHOST_ROUTING=1 in apollo.publish.env`,
      )
      routingUrl = fromYaml
    } else {
      console.warn(
        `SUBGRAPH_ROUTING_URL is a local/loopback address (${routingUrl}). Add supergraph/schema/aws.unified-file.yaml (routing_url) or set a public https://… URL.`,
      )
    }
  }
}
if (!routingUrl) {
  console.error(
    'No routing URL. Set SUBGRAPH_ROUTING_URL in apollo.publish.env, or set SUBGRAPH_ROUTING_URL=auto/empty and add a routing_url under subgraphs in supergraph/schema/aws.unified-file.yaml (see apollo.publish.env.example).',
  )
  process.exit(1)
}

if (!apolloKey) {
  console.error('APOLLO_KEY is missing in apollo.publish.env')
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

const schemaPath = resolve(root, 'supergraph', 'payload-sdl', '_merged.graphql')
console.log(`Publishing subgraph "${subgraphName}" to ${graphRef}…\n  routing_url: ${routingUrl}`)

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
