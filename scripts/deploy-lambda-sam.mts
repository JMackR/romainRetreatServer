/**
 * Build (SAM) and deploy the Payload GraphQL Lambda.
 *
 * From `romainRetreatServer`:
 *   yarn deploy:lambda                         # interactive
 *   yarn deploy:lambda unified                 # one stack, all routes
 *   yarn deploy:lambda all                     # 5 stacks; needs SAM_BASE_PARAMETER_OVERRIDES
 *   yarn deploy:lambda content                 # one stack, single domain (routing_url …/graphql)
 *   yarn deploy:lambda --no-build unified      # skip build
 *
 * `all` and single-domain: use `SAM_BASE_PARAMETER_OVERRIDES=…` **or** `parameter_overrides` in `samconfig.toml` (read automatically).
 * Omit `SubgraphMode` in that base (or it is stripped); this script appends `SubgraphMode=<domain>`.
 *
 * Optional: SAM_STACK_PREFIX (default romain-retreat) → {prefix}-sg-<domain>; SAM_STACK_NAME overrides single stack name.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import {
  isPayloadSubgraphDomain,
  PAYLOAD_SUBGRAPH_DOMAINS,
  type PayloadSubgraphDomain,
} from '../subgraphs/domains.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DOMAINS = PAYLOAD_SUBGRAPH_DOMAINS

function run(args: string[]) {
  const r = spawnSync(args[0]!, args.slice(1), {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (r.error) {
    throw r.error
  }
  if (r.status !== 0) {
    process.exit(r.status ?? 1)
  }
}

/** `sam deploy` passes each stack its own `SubgraphMode=`; base config must not pin a single mode. */
function stripSubgraphMode(overrides: string): string {
  return overrides.replace(/\bSubgraphMode=\S+/g, '').replace(/\s+/g, ' ').trim()
}

/**
 * Same string `sam` uses from `[default.deploy.parameters] parameter_overrides = "…"` in `samconfig.toml`.
 * Only one-line, double-quoted form is supported.
 */
function readParameterOverridesFromSamconfig(): string {
  const p = resolve(root, 'samconfig.toml')
  if (!existsSync(p)) {
    return ''
  }
  const text = readFileSync(p, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    if (t.startsWith('#') || t === '') {
      continue
    }
    if (!/^parameter_overrides\s*=\s*"/.test(t)) {
      continue
    }
    const firstQuote = t.indexOf('"', t.indexOf('=')) + 1
    if (firstQuote <= 0) {
      continue
    }
    let out = ''
    for (let i = firstQuote; i < t.length; i += 1) {
      const c = t[i]!
      if (c === '\\' && i + 1 < t.length) {
        out += t[i + 1]!
        i += 1
        continue
      }
      if (c === '"') {
        return out
      }
      out += c
    }
  }
  return ''
}

function getBaseParamOverrides(): string {
  const fromEnv = (process.env.SAM_BASE_PARAMETER_OVERRIDES || '').trim()
  if (fromEnv) {
    return stripSubgraphMode(fromEnv)
  }
  return stripSubgraphMode(readParameterOverridesFromSamconfig())
}

function parseCli(argv: string[]) {
  const out: { noBuild: boolean; help: boolean; positionals: string[] } = {
    noBuild: false,
    help: false,
    positionals: [],
  }
  for (const a of argv) {
    if (a === '--no-build') {
      out.noBuild = true
    } else if (a === '-h' || a === '--help') {
      out.help = true
    } else {
      out.positionals.push(a)
    }
  }
  return out
}

function printHelp() {
  console.log(
    `romainRetreatServer — deploy GraphQL Lambda (SAM)

  yarn deploy:lambda                    # prompt: unified | all domains | one domain
  yarn deploy:lambda unified            # one stack (full app + all /api/subgraph/*)
  yarn deploy:lambda all                # five stacks (per-domain); uses env or samconfig.toml parameter_overrides
  yarn deploy:lambda <domain>           # one stack, e.g. content — SubgraphMode for GraphOS
  yarn deploy:lambda --no-build …       # skip "yarn sam:build"

  Base parameters: SAM_BASE_PARAMETER_OVERRIDES, or the same one-line value in samconfig.toml (see samconfig.toml.example)
  SAM_STACK_PREFIX: default romain-retreat  →  stacks {prefix}-sg-content for "all"
  SAM_STACK_NAME:  optional override for single-domain deploy
`,
  )
}

function runSamBuild() {
  run(['yarn', 'run', 'sam:build'])
}

/**
 * `sam deploy` with optional --parameter-overrides. Extra flags go last (e.g. --no-confirm-changeset if you add).
 */
function runSamDeploy(overrides: string | undefined, extra: string[] = ['--config-env', 'default']) {
  const cmd: string[] = ['sam', 'deploy', ...extra]
  if (overrides) {
    cmd.push('--parameter-overrides', overrides)
  }
  run(cmd)
}

function doUnified(noBuild: boolean) {
  if (!noBuild) {
    runSamBuild()
  }
  runSamDeploy(undefined)
}

function doSingle(domain: PayloadSubgraphDomain, noBuild: boolean) {
  if (!noBuild) {
    runSamBuild()
  }
  const base = getBaseParamOverrides()
  if (!base) {
    console.error(
      'No base parameters. Set [default.deploy.parameters] parameter_overrides in samconfig.toml (see samconfig.toml.example), or export SAM_BASE_PARAMETER_OVERRIDES="DatabaseUrl=… PayloadSecret=…". SubgraphMode is added by this script. For one stack with plain sam, use: yarn deploy:lambda unified  or  sam deploy …',
    )
    process.exit(1)
  }
  const ovr = [base, `SubgraphMode=${domain}`].join(' ').replace(/\s+/g, ' ').trim()
  const prefix = process.env.SAM_STACK_PREFIX || 'romain-retreat'
  const stack = process.env.SAM_STACK_NAME || `${prefix}-sg-${domain}`
  const noConfirm = process.env.SAM_NO_CONFIRM === '1' ? (['--no-confirm-changeset'] as const) : []
  runSamDeploy(ovr, ['--stack-name', stack, '--config-env', 'default', ...noConfirm])
}

function doAll(noBuild: boolean) {
  const base = getBaseParamOverrides()
  if (!base) {
    console.error(
      'For `all`, set parameter_overrides in romainRetreatServer/samconfig.toml, or export SAM_BASE_PARAMETER_OVERRIDES="DatabaseUrl=… PayloadSecret=…" (same as samconfig).',
    )
    process.exit(1)
  }
  if (!noBuild) {
    runSamBuild()
  }
  const prefix = process.env.SAM_STACK_PREFIX || 'romain-retreat'
  const noConfirm = process.env.SAM_NO_CONFIRM === '1' ? (['--no-confirm-changeset'] as const) : []
  for (const d of DOMAINS) {
    const ovr = [base, `SubgraphMode=${d}`].join(' ').replace(/\s+/g, ' ').trim()
    const stack = `${prefix}-sg-${d}`
    console.log(`\n=== Deploy ${stack} (SubgraphMode=${d}) ===\n`)
    runSamDeploy(ovr, ['--stack-name', stack, '--config-env', 'default', ...noConfirm])
  }
}

async function promptMode(): Promise<'unified' | 'all' | PayloadSubgraphDomain> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const q = (s: string) => new Promise<string>((res) => rl.question(s, res))
  const line = (await q(`Deploy Lambda [1 unified | 2 all 5 domain stacks | 3 one domain] (1/2/3): `))
    .trim()
    .toLowerCase()
  if (line === '2' || line === 'all') {
    rl.close()
    return 'all'
  }
  if (line === '3' || line === 'one' || line === 'single') {
    const d = (await q(`Domain (${DOMAINS.join(' / ')}): `)).trim().toLowerCase()
    rl.close()
    if (isPayloadSubgraphDomain(d)) {
      return d
    }
    console.error('Invalid domain.')
    process.exit(1)
  }
  rl.close()
  return 'unified'
}

async function main() {
  const { noBuild, help, positionals } = parseCli(process.argv.slice(2))
  if (help) {
    printHelp()
    process.exit(0)
  }

  if (positionals[0] === 'help') {
    printHelp()
    process.exit(0)
  } else if (positionals[0] === 'all') {
    return doAll(noBuild)
  } else if (positionals[0] === 'unified' || positionals[0] === 'mono') {
    return doUnified(noBuild)
  } else if (positionals[0] && isPayloadSubgraphDomain(positionals[0]!)) {
    return doSingle(positionals[0] as PayloadSubgraphDomain, noBuild)
  } else if (positionals[0]) {
    printHelp()
    console.error(`Unknown: ${positionals[0]}`)
    process.exit(1)
  }

  if (!process.stdin.isTTY) {
    printHelp()
    process.exit(1)
  }
  const mode = await promptMode()
  if (mode === 'unified') {
    doUnified(noBuild)
  } else if (mode === 'all') {
    doAll(noBuild)
  } else {
    if (getBaseParamOverrides() === '') {
      console.error('Set parameter_overrides in samconfig.toml, or export SAM_BASE_PARAMETER_OVERRIDES=…, before deploying a single domain.')
      process.exit(1)
    }
    doSingle(mode, noBuild)
  }
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
