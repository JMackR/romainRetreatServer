/**
 * One-shot Aurora connectivity / schema probe. Connects with the same RDS IAM
 * token flow the Lambdas use (so a successful run also confirms IAM auth grants
 * are working from your laptop's AWS creds).
 *
 * Run: `yarn tsx scripts/probe-aurora.mts`
 */
import { Signer } from '@aws-sdk/rds-signer'
import pg from 'pg'

const host = process.env.AURORA_HOST || 'database-1.cluster-cq5m8kimg8gg.us-east-1.rds.amazonaws.com'
const port = Number(process.env.AURORA_PORT || '5432')
const user = process.env.AURORA_USER || 'postgres'
const db = process.env.AURORA_DB || 'postgres'
const region = process.env.AWS_REGION || 'us-east-1'

console.log(`Generating IAM token for ${user}@${host}:${port} (region=${region})...`)
const token = await new Signer({ hostname: host, port, username: user, region }).getAuthToken()

const client = new pg.Client({
  host,
  port,
  database: db,
  user,
  password: token,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10_000,
})
await client.connect()
console.log('Connected.\n')

const r = await client.query(
  `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' ORDER BY table_name`,
)
console.log(`public schema has ${r.rows.length} tables.`)
for (const row of r.rows.slice(0, 30)) console.log(`  ${row.table_name}`)
if (r.rows.length > 30) console.log(`  … (+${r.rows.length - 30} more)`)

const need = ['users', 'pages', 'posts', 'media', 'categories', 'forms', 'redirects', 'search', 'payload_preferences']
const have = new Set(r.rows.map((x) => x.table_name as string))
console.log('\nPayload table presence check:')
for (const t of need) console.log(`  ${have.has(t) ? 'YES' : 'NO '}   ${t}`)

await client.end()
