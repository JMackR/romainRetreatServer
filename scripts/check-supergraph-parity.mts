/**
 * Schema parity check: composes the local Docker supergraph from the on-disk
 * `subgraphs/<d>/src/<d>.graphql` files (what the local Docker router serves)
 * and fetches the AWS-published supergraph from Apollo Studio (what the
 * deployed ECS Router serves), then diffs the two — ignoring the 5
 * `@join__graph` routing-URL lines (which always differ: localhost vs Lambda).
 *
 * If the two are otherwise identical the CMS Apollo Client (or any other
 * consumer) is guaranteed to produce the same response shape against both
 * routers. If they diverge the script prints the first difference and exits 1
 * — usually that means someone tweaked Payload schema (or the federation
 * pruning code in `subgraphs/_shared/`) without re-running:
 *
 *   yarn export:subgraph-sdl    # regenerate subgraphs/<d>/src/<d>.graphql
 *   yarn deploy:lambda all      # push new bundle to all 5 Lambdas
 *   yarn publish:aws-subgraphs  # re-publish each subgraph's live SDL to GraphOS
 *
 * Run from `romainRetreatServer`: `yarn check:supergraph-parity`
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { config } from 'dotenv'

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
config({ path: resolve(root, 'apollo.publish.env') })

const apolloKey = process.env.APOLLO_KEY
const graphRef = process.env.APOLLO_GRAPH_REF || 'RomainRetreat@current'
if (!apolloKey) {
  console.error('APOLLO_KEY missing (set in apollo.publish.env).')
  process.exit(1)
}

function run(cmd: string, args: string[], extraEnv: Record<string, string> = {}): { stdout: string; code: number } {
  const r = spawnSync(cmd, args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
  })
  if (r.error) throw r.error
  return { stdout: r.stdout, code: r.status ?? 1 }
}

console.log('Composing local supergraph from on-disk subgraph files…')
const local = run(
  'npx',
  ['--yes', '@apollo/rover@0.38.1', 'supergraph', 'compose', '--config', 'supergraph/schema/local.yaml'],
  { APOLLO_ELV2_LICENSE: 'accept' },
)
if (local.code !== 0) {
  console.error('Local compose failed.')
  process.stderr.write(local.stdout)
  process.exit(local.code)
}

console.log(`Fetching AWS-composed supergraph from Apollo Studio (${graphRef})…`)
const aws = run('npx', ['--yes', '@apollo/rover', 'supergraph', 'fetch', graphRef], { APOLLO_KEY: apolloKey })
if (aws.code !== 0) {
  console.error('AWS fetch failed.')
  process.stderr.write(aws.stdout)
  process.exit(aws.code)
}

// Both routers serve the same supergraph schema; only the routing URLs differ
// (localhost ports vs Lambda Function URL hostnames). Drop those from both
// sides before diffing so we're comparing the schema content, not the topology.
function normalize(sdl: string): string {
  return sdl
    .split('\n')
    .filter((line) => !/^Fetching supergraph SDL from/.test(line)) // rover fetch header
    .map((line) => line.replace(/url: "[^"]*"/g, 'url: "<routing-url>"'))
    .join('\n')
    .trim()
}

const localNorm = normalize(local.stdout)
const awsNorm = normalize(aws.stdout)

if (localNorm === awsNorm) {
  console.log(`✓ Local Docker supergraph matches AWS-published supergraph (${localNorm.length} chars; routing URLs masked).`)
  process.exit(0)
}

const a = localNorm.split('\n')
const b = awsNorm.split('\n')
let i = 0
while (i < a.length && i < b.length && a[i] === b[i]) i += 1
console.error(`✗ Supergraph schemas DIVERGE at line ${i + 1} (local has ${a.length} lines, aws has ${b.length}).`)
console.error(`  local:  ${(a[i] || '').slice(0, 160)}`)
console.error(`  aws:    ${(b[i] || '').slice(0, 160)}`)
console.error(
  '\nFix: re-export per-domain SDLs and republish the live AWS subgraphs:\n  yarn export:subgraph-sdl && yarn deploy:lambda all && yarn publish:aws-subgraphs',
)
process.exit(1)
