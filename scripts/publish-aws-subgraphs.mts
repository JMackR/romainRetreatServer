/**
 * Publish all 5 domain subgraphs to Apollo Studio with each Lambda's actual
 * `_service { sdl }` and Function URL as the `routing_url`.
 *
 * Run from `romainRetreatServer`: `yarn tsx scripts/publish-aws-subgraphs.mts`
 *
 * The published SDL is fetched live from `<lambda-url>/graphql`, so what GraphOS
 * uses for composition planning exactly matches what the Lambda advertises (no
 * drift between locally-generated `subgraphs/<d>/src/<d>.graphql` and runtime
 * after a code change). Function URL is read from the CloudFormation stack
 * output `SubgraphUrl` of `romain-retreat-sg-<domain>`.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { config } from 'dotenv'

import { PAYLOAD_SUBGRAPH_DOMAINS, type PayloadSubgraphDomain } from '../subgraphs/domains.js'

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
config({ path: resolve(root, 'apollo.publish.env') })
config({ path: resolve(root, '.env') })

const apolloKey = process.env.APOLLO_KEY
const graphRef = process.env.APOLLO_GRAPH_REF || 'RomainRetreat@current'
const stackPrefix = process.env.SAM_STACK_PREFIX || 'romain-retreat'
const region = process.env.AWS_REGION || 'us-east-1'

if (!apolloKey) {
  console.error('APOLLO_KEY missing (set in apollo.publish.env).')
  process.exit(1)
}

function getOutput(stack: string, key: string): string | null {
  const r = spawnSync(
    'aws',
    [
      'cloudformation',
      'describe-stacks',
      '--stack-name',
      stack,
      '--region',
      region,
      '--query',
      `Stacks[0].Outputs[?OutputKey=='${key}'].OutputValue|[0]`,
      '--output',
      'text',
    ],
    { encoding: 'utf8' },
  )
  if (r.status !== 0) return null
  const v = r.stdout.trim()
  return v && v !== 'None' ? v : null
}

async function fetchSdl(graphqlUrl: string): Promise<string> {
  // Cold-start tolerance — generous on first hit.
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 35000)
    try {
      const res = await fetch(graphqlUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: '{ _service { sdl } }' }),
        signal: ctrl.signal,
      })
      clearTimeout(t)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j = (await res.json()) as { data?: { _service?: { sdl?: string } }; errors?: unknown }
      const sdl = j.data?._service?.sdl
      if (!sdl) throw new Error(`bad response: ${JSON.stringify(j)}`)
      return sdl
    } catch (err) {
      clearTimeout(t)
      if (attempt === 3) throw err
      await new Promise((r) => setTimeout(r, 1000 * attempt))
    }
  }
  throw new Error('unreachable')
}

function rover(args: string[]): void {
  const r = spawnSync('npx', ['--yes', '@apollo/rover@0.38.1', ...args], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, APOLLO_KEY: apolloKey },
  })
  if (r.error) throw r.error
  if (r.status !== 0) process.exit(r.status ?? 1)
}

const tmpDir = resolve(root, '.aws-sam', 'published-sdl')
mkdirSync(tmpDir, { recursive: true })

for (const domain of PAYLOAD_SUBGRAPH_DOMAINS as readonly PayloadSubgraphDomain[]) {
  const stack = `${stackPrefix}-sg-${domain}`
  const baseUrl = getOutput(stack, 'SubgraphUrl')
  if (!baseUrl) {
    console.warn(`[skip ${domain}] no SubgraphUrl output on stack ${stack}`)
    continue
  }
  // Function URL output ends with a trailing slash; routing URL needs `/graphql` (no double slash).
  const routingUrl = `${baseUrl.replace(/\/$/, '')}/graphql`
  console.log(`\n=== ${domain} → ${routingUrl} ===`)

  console.log(`  fetching live _service { sdl } …`)
  const sdl = await fetchSdl(routingUrl)
  const sdlPath = resolve(tmpDir, `${domain}.graphql`)
  writeFileSync(sdlPath, sdl, 'utf8')
  console.log(`  wrote ${sdlPath} (${sdl.length} bytes)`)

  rover([
    'subgraph',
    'publish',
    graphRef,
    '--name',
    domain,
    '--schema',
    sdlPath,
    '--routing-url',
    routingUrl,
    // GraphOS already enforces these, but skip the prompt on first publish per subgraph name.
    '--allow-invalid-routing-url',
  ])
}

console.log('\nAll 5 subgraphs published to', graphRef)
console.log('Apollo Studio: https://studio.apollographql.com/graph/' + graphRef.split('@')[0] + '/home')
