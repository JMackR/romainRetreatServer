/**
 * RDS IAM authentication for the Lambda subgraphs.
 *
 * Equivalent to the CLI pattern:
 *   psql "host=$RDSHOST … password=$(aws rds generate-db-auth-token --hostname $RDSHOST …)"
 *
 * Called once per cold start from `lambda.ts` BEFORE `app.ts` is dynamic-imported.
 * Reads the host/port/user out of `DATABASE_URL`, calls `Signer.getAuthToken()`
 * (a local sigv4 sign — no network call), and writes the resulting 15-minute
 * token back into `DATABASE_URL` as the password so `payload.config`'s
 * `postgresAdapter({ pool: { connectionString } })` picks it up unchanged.
 *
 * Caveats / gotchas:
 *   - Token TTL is 15 minutes. node-postgres lazily opens new connections; if a
 *     warm Lambda container outlives the token AND needs a new connection, that
 *     connection will fail authentication. In practice Lambda containers usually
 *     recycle within 5–15 minutes for low-traffic functions, so this is rarely
 *     hit. If it becomes an issue we'd switch payload.config to pass `password`
 *     as a callback to `pg.Pool` instead of using `connectionString`.
 *   - `sslmode=require` is mandatory for RDS IAM auth — we set it if missing.
 *   - The execution role must have `rds-db:connect` on the right resource ARN
 *     (template.yaml SubgraphFunctionRdsIamPolicy adds this when UseRdsIamAuth=true).
 *   - Works against either an RDS instance hostname (db-XXXX) or an Aurora
 *     cluster endpoint (cluster-XXXX); the IAM policy resource id must match.
 */
import { Signer } from '@aws-sdk/rds-signer'

export async function maybeApplyRdsIamAuth(): Promise<void> {
  if (process.env.RDS_IAM_AUTH !== '1') return
  const raw = process.env.DATABASE_URL
  if (!raw) {
    throw new Error('RDS_IAM_AUTH=1 but DATABASE_URL is empty (need at least postgresql://USER@HOST:PORT/DB).')
  }
  const url = new URL(raw)
  const username = decodeURIComponent(url.username || 'postgres')
  const port = Number(url.port || '5432')
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1'

  const signer = new Signer({
    hostname: url.hostname,
    port,
    username,
    region,
  })
  const token = await signer.getAuthToken()
  url.password = encodeURIComponent(token)
  if (!url.searchParams.get('sslmode')) {
    url.searchParams.set('sslmode', 'require')
  }
  process.env.DATABASE_URL = url.toString()

  // eslint-disable-next-line no-console
  console.log(
    `[rds-iam-auth] generated 15-min IAM token for ${username}@${url.hostname}:${port} (region=${region})`,
  )
}
