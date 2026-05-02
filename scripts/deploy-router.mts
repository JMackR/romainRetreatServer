/**
 * Deploys the Apollo Router ECS Fargate stack (template.router.yaml).
 *
 * Discovers the account's default VPC + 2 default-AZ public subnets at deploy
 * time and passes them through as `VpcId` / `SubnetIds` parameter overrides.
 * Static parameters (ApolloKeySecretArn, ApolloGraphRef, image, sizing) live
 * in `samconfig.router.toml`.
 *
 * Run from `romainRetreatServer`: `yarn deploy:router`
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const region = process.env.AWS_REGION || 'us-east-1'

function aws(args: string[]): string {
  const r = spawnSync('aws', [...args, '--region', region, '--output', 'text'], {
    cwd: root,
    encoding: 'utf8',
  })
  if (r.status !== 0) {
    console.error(`aws ${args.join(' ')} failed:\n${r.stdout}\n${r.stderr}`)
    process.exit(r.status ?? 1)
  }
  return r.stdout.trim()
}

const vpcId = aws([
  'ec2',
  'describe-vpcs',
  '--filters',
  'Name=isDefault,Values=true',
  '--query',
  'Vpcs[0].VpcId',
])
if (!vpcId || vpcId === 'None') {
  console.error('No default VPC in this account/region. Either restore the default VPC or set VpcId+SubnetIds explicitly.')
  process.exit(1)
}

// Fargate needs ≥2 subnets for the service rolling deploy (so it can drain a
// task while the new one warms up). 2 default-AZ subnets is the minimum.
const subnets = aws([
  'ec2',
  'describe-subnets',
  '--filters',
  `Name=vpc-id,Values=${vpcId}`,
  'Name=default-for-az,Values=true',
  '--query',
  'Subnets[*].SubnetId',
])
  .split(/\s+/)
  .filter(Boolean)

if (subnets.length < 2) {
  console.error(`Default VPC ${vpcId} has fewer than 2 default-AZ subnets (${subnets.length}). Pass SubnetIds explicitly.`)
  process.exit(1)
}
const pickedSubnets = subnets.slice(0, 2).join(',')

// `sam deploy --parameter-overrides …` REPLACES samconfig's parameter_overrides
// instead of merging with them, so we read the static block out of the toml and
// concatenate the dynamic VPC/subnet params here. (Hand-rolled parser — only
// needs to extract one quoted string for one key.)
function readToml(file: string, key: string): string {
  const m = new RegExp(`^\\s*${key}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'm').exec(readFileSync(file, 'utf8'))
  if (!m) {
    throw new Error(`Couldn't find ${key} in ${file}`)
  }
  return m[1]!.replace(/\\"/g, '"')
}
const staticOverrides = readToml(resolve(root, 'samconfig.router.toml'), 'parameter_overrides')
const overrides = `${staticOverrides} VpcId=${vpcId} SubnetIds=${pickedSubnets}`
console.log(`Parameter overrides: ${overrides}\n`)

const cmd = [
  'sam',
  'deploy',
  '--template-file',
  'template.router.yaml',
  // Pull stack name / region / capabilities from the toml's [default.global] +
  // [default.deploy] sections, but we override parameter_overrides via --parameter-overrides.
  '--config-file',
  'samconfig.router.toml',
  '--parameter-overrides',
  overrides,
  '--no-confirm-changeset',
]
console.log(`$ ${cmd.join(' ')}\n`)

const r = spawnSync(cmd[0]!, cmd.slice(1), { cwd: root, stdio: 'inherit' })
process.exit(r.status ?? 1)
