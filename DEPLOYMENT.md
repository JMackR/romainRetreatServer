# Deployment guide

End-to-end recipes for running and shipping Romain Retreat:

1. [Local — full federation in Docker](#1-local--full-federation-in-docker) (recommended for dev)
2. [Local — native processes (no Docker)](#2-local--native-processes-no-docker)
3. [AWS — first-time setup](#3-aws--first-time-setup) (one-time per account)
4. [AWS — deploy / update the subgraph Lambdas](#4-aws--deploy--update-the-subgraph-lambdas)
5. [AWS — deploy / update the Apollo Router (ECS Fargate + ALB)](#5-aws--deploy--update-the-apollo-router-ecs-fargate--alb)
6. [AWS — publish subgraph schemas to Apollo Studio](#6-aws--publish-subgraph-schemas-to-apollo-studio)
7. [AWS — seed (or re-seed) the Aurora database](#7-aws--seed-or-re-seed-the-aurora-database)
8. [Vercel — deploy the CMS / Next.js app](#8-vercel--deploy-the-cms--nextjs-app)
9. [Verifying / day-2 ops](#9-verifying--day-2-ops)

The supergraph topology end-state:

```
                    ┌─ Lambda: romain-retreat-sg-users  ─┐
                    ├─ Lambda: romain-retreat-sg-groups ─┤
Vercel (Next/CMS) ─►│ ALB ─► ECS Fargate (Apollo Router) │─►│ ├─ Lambda: romain-retreat-sg-search  ─├─► Aurora Postgres 17.7
                    │                                   │   ├─ Lambda: romain-retreat-sg-content ─┤      (IAM auth)
                    │                                   │   └─ Lambda: romain-retreat-sg-system  ─┘
                    └─────────────► Apollo Studio (composes & serves the supergraph schema via Uplink)
```

All paths share **one** Payload `payload.config.ts` (`romainRetreatCMS/src/payload.config.ts`) — locally and on Lambda. Each subgraph process / function runs the same image but selects a single domain via `PAYLOAD_LAMBDA_SUBGRAPH=<users|groups|search|content|system>`, which prunes the monolithic Payload schema down to that domain's federated slice.

---

## 1. Local — full federation in Docker

Self-contained stack: Postgres 17 (matches Aurora 17.7) + 5 subgraphs + Apollo Router. **No host Postgres required.**

```bash
cd romainRetreatServer
cp .env.example .env                        # set PAYLOAD_SECRET (DATABASE_URL is overridden inside docker)
yarn docker:federation:up
```

Boots, in order:

| Step | What happens | Why |
|------|--------------|-----|
| 1 | `postgres` (Postgres 17.7) starts | Same major version as AWS Aurora |
| 2 | `db-init` runs `yarn seed` from the CMS image | Drizzle push + seeds 1 user, 6 categories, 4 media, 3 posts, contact form, 2 pages, 2 globals (same content `seed/index.ts` produces in any environment) |
| 3 | 5 subgraphs (`users`/`groups`/`search`/`content`/`system`) start on host ports `4001…4005` | Each pinned to its `PAYLOAD_LAMBDA_SUBGRAPH=<domain>` |
| 4 | `supergraph-build` (one-shot) composes via Rover into `supergraph/supergraph.docker.graphql` | |
| 5 | Apollo Router starts on `http://127.0.0.1:4000/` | |

### Endpoints

| URL | What it is |
|---|---|
| `http://127.0.0.1:4000/` | **Federated GraphQL endpoint** (point Apollo Client here) |
| `http://127.0.0.1:4001/health` … `4005/health` | Subgraph health probes |
| `postgresql://postgres:postgres@127.0.0.1:5433/postgres` | The dockerized Postgres (host port `5433` to avoid clashing with `yarn db:start`) |

### Common operations

```bash
yarn docker:federation:up               # full stack from cold
yarn docker:federation:down             # stop everything (DB volume preserved)

# Re-run schema push + reseed against a stale DB (DESTRUCTIVE: wipes content collections):
docker compose -f docker-compose.federation.yml run --rm db-init \
  sh -c 'cd /app/romainRetreatCMS && yarn seed --force'

# Tail logs:
docker logs -f romain-subgraph-content
docker logs -f romain-federation-router

# Drop the Postgres volume (next `up` re-pushes schema + reseeds from scratch):
docker compose -f docker-compose.federation.yml down -v
```

### When to re-run

| You changed | Action |
|---|---|
| `payload.config.ts`, a collection, a plugin | `yarn docker:federation:down && yarn docker:federation:up` (rebuilds image, db-init detects new schema, applies push) |
| Federation logic (`subgraphs/_shared/federation/*`, `subgraphs/_shared/subgraph/payloadSubgraphByDomain.ts`) | Same as above — image rebuilds, supergraph recomposes |
| Only seed content (`romainRetreatCMS/src/endpoints/seed/*`) | Run the `--force` reseed command above |
| Router config (`supergraph/router.federation.yaml`) | `docker compose -f docker-compose.federation.yml --profile router restart router` |

---

## 2. Local — native processes (no Docker)

Faster iteration loop when you're just hacking on Payload code, but you don't get the federated router and don't match production exactly.

```bash
# Terminal 1: start a host-side Postgres
cd romainRetreatServer && yarn db:start                     # docker run postgres:16-alpine on :5432

# Terminal 2: push Payload schema once + seed
cd romainRetreatCMS && yarn seed                            # also runs Drizzle push on a fresh DB

# Terminal 3: run a single subgraph (or `yarn dev` for the unified app)
cd romainRetreatServer && yarn dev:subgraph:content         # or: users / groups / search / system
# → POST http://127.0.0.1:4004/graphql (each subgraph has its own port; see scripts in package.json)

# Terminal 4: run the CMS (point it at the local subgraph rather than the router)
cd romainRetreatCMS
ROMAIN_RETREAT_SERVER_URL=http://127.0.0.1:3002 \
  ROMAIN_RETREAT_SERVER_GRAPHQL_PATH=/graphql \
  yarn dev                                                  # http://localhost:3000
```

For the **legacy unified mode** (one process serving every subgraph at `/api/subgraph/<domain>/graphql` and the full Payload monolith at `/graphql`):

```bash
cd romainRetreatServer && yarn dev                          # http://127.0.0.1:3002
```

---

## 3. AWS — first-time setup

One-time, per AWS account/region. Skip whichever steps you've already done.

### 3.1 AWS CLI / SAM CLI

```bash
brew install awscli aws-sam-cli                             # macOS
aws configure                                               # or: aws configure sso && aws sso login
export AWS_REGION=us-east-1                                 # used by every script in this repo
```

You need permissions for: CloudFormation, Lambda, IAM (role creation), Secrets Manager, S3 (SAM artifacts), ECS, EC2 (default-VPC discovery), RDS, Logs.

### 3.2 ECS service-linked role (one command per account)

The Apollo Router runs on Fargate, which needs `AWSServiceRoleForECS`. Most accounts already have it; if `yarn deploy:router` errors with *"Unable to assume the service linked role"*:

```bash
aws iam create-service-linked-role --aws-service-name ecs.amazonaws.com
```

### 3.3 Aurora Postgres 17 cluster

The Lambdas talk to a single Aurora cluster shared with the local schema. Create one **once**:

1. RDS Console → Create database → Aurora (PostgreSQL-Compatible) → Engine version `17.7` (matches our local docker image and `payload.config.ts`).
2. Master username `postgres`, master password (you'll discard it), DB name `postgres`.
3. **Enable IAM database authentication** (Database authentication → "IAM").
4. Note the **cluster endpoint** (`database-1.cluster-XXXX.us-east-1.rds.amazonaws.com`) and the **cluster Resource ID** (`cluster-XXXXXXXXXXXXXXX`, RDS Console → cluster → Configuration). Both go into `samconfig.toml` below.
5. Connect once with the master password and grant IAM auth to `postgres`:

   ```bash
   export RDSHOST=database-1.cluster-XXXX.us-east-1.rds.amazonaws.com
   psql "host=$RDSHOST port=5432 dbname=postgres user=postgres sslmode=require"
   # → in psql:
   GRANT rds_iam TO postgres;
   ```

6. Make sure the cluster's security group allows inbound `5432` from your Lambdas. (For the simplest case, leave the cluster public + grant `0.0.0.0/0` only on `5432`; Lambdas use IAM auth so a leaked endpoint is harmless without the IAM token.)

### 3.4 Secrets Manager: `romain-retreat/payload-secret`

The same `PAYLOAD_SECRET` you use locally, stored once and resolved by every Lambda at deploy time:

```bash
aws secretsmanager create-secret \
  --name romain-retreat/payload-secret \
  --secret-string "$(openssl rand -hex 48)"                 # or: paste the value from your .env
```

### 3.5 Apollo Studio API key + graph

1. Create a graph in Apollo Studio (https://studio.apollographql.com) — note the graph ref, e.g. `RomainRetreat@current`.
2. Create a graph API key (Settings → API Keys → Graph API Key) — this is your `APOLLO_KEY`.
3. Stash it in Secrets Manager (the Router pulls it at task start, so it never lives in plaintext on the cluster):

   ```bash
   aws secretsmanager create-secret \
     --name romain-retreat/apollo-key \
     --secret-string "service:RomainRetreat:xxxxxxxxxxxxxxxxxxxxxx"
   # Note the returned ARN — it goes into samconfig.router.toml as ApolloKeySecretArn.
   ```

4. For the publish CLI:

   ```bash
   cd romainRetreatServer
   cp apollo.publish.env.example apollo.publish.env         # gitignored
   # Edit apollo.publish.env: set APOLLO_KEY and APOLLO_GRAPH_REF (e.g. RomainRetreat@current).
   ```

### 3.6 `samconfig.toml` (subgraph deploy parameters)

```bash
cd romainRetreatServer
cp samconfig.toml.example samconfig.toml
# Edit parameter_overrides:
#   - DatabaseUrl: postgresql://postgres@<cluster-endpoint>:5432/postgres?sslmode=require   (NO password — IAM)
#   - PayloadSecret: leave the {{resolve:secretsmanager:romain-retreat/payload-secret:SecretString}} reference as-is
#   - UseRdsIamAuth: "true"
#   - RdsDbiResourceId: cluster-XXXXXXXXXXXXXXX (from step 3.3)
#   - PayloadDatabasePush: "0" (we push from the seed flow in §7, not from the Lambda)
```

`samconfig.toml` is gitignored — it contains your account-specific endpoint.

---

## 4. AWS — deploy / update the subgraph Lambdas

Five Lambdas (one per domain), each fronted by an AWS Lambda Function URL.

```bash
cd romainRetreatServer
yarn deploy:lambda all                                      # builds → deploys 5 stacks: romain-retreat-sg-{users,groups,search,content,system}
```

Each `sam deploy` is idempotent (CloudFormation diffs the template + code). On a code change to **only** `subgraphs/_shared/*.ts` (no template change), SAM may short-circuit; force a redeploy:

```bash
yarn sam:build                                              # rebuilds .aws-sam/build
yarn deploy:lambda all
```

**Single domain** (e.g. you only changed something `content`-related):

```bash
yarn deploy:lambda content
```

**Tail Lambda logs** for a domain:

```bash
aws logs tail /aws/lambda/romain-retreat-sg-content-SubgraphFunction-xxxxxxxx \
  --since 5m --follow --region us-east-1
# (function name suffix is in the stack outputs; or use the AWS console)
```

After **any** Lambda redeploy that changes the served `_service { sdl }`, re-run §6 so Apollo Studio re-composes.

---

## 5. AWS — deploy / update the Apollo Router (ECS Fargate + ALB)

```bash
cd romainRetreatServer
yarn deploy:router
```

The script discovers the account's default VPC + 2 default-AZ public subnets at deploy time and passes them to CloudFormation. The stack creates:

- ECS Cluster + Fargate task (256 CPU / 512 MiB, ARM64) running `ghcr.io/apollographql/router:v1.59.0`
- Execution role that pulls the GHCR image and reads `romain-retreat/apollo-key` from Secrets Manager
- Application Load Balancer on **port 80** (no TLS yet — see "Phase 3" below)
- Security groups: ALB open on `0.0.0.0/0:80`, Router only reachable from the ALB on `:4000`

**Output:**

```bash
aws cloudformation describe-stacks --stack-name romain-retreat-router \
  --region us-east-1 --query 'Stacks[0].Outputs[?OutputKey==`AlbUrl`].OutputValue' --output text
# → http://romain-retreat-router-alb-xxxxxxx.us-east-1.elb.amazonaws.com/
```

That ALB URL is what you put in the CMS's `ROMAIN_RETREAT_SERVER_URL` on Vercel (§8).

**Logs:**

```bash
yarn logs:router                                            # aws logs tail /ecs/romain-retreat-router
```

**Forcing a new task** (e.g. after editing the router image tag):

```bash
yarn deploy:router                                          # CloudFormation updates the task definition; ECS rolling-replaces the task
```

**Phase 3 (HTTPS / custom domain — TODO):** request an ACM cert in `us-east-1` for your domain, add a `:443` Listener on the ALB pointing at the existing target group, and update `template.router.yaml` to redirect `:80 → :443`.

---

## 6. AWS — publish subgraph schemas to Apollo Studio

After every subgraph deploy that changes the schema:

```bash
cd romainRetreatServer
yarn publish:aws-subgraphs
```

For each of the 5 domains, the script:

1. Reads `SubgraphUrl` from the `romain-retreat-sg-<domain>` CloudFormation stack output.
2. Fetches the **live** `_service { sdl }` from `<SubgraphUrl>/graphql` (cold-start tolerant).
3. Runs `rover subgraph publish RomainRetreat@current --name <domain> --schema <live-sdl> --routing-url <SubgraphUrl>/graphql`.

Apollo Studio then re-composes and pushes the new supergraph to the Router via Uplink within ~30 seconds. No router redeploy needed.

**Verify what AWS is serving matches what the local Docker stack composes:**

```bash
yarn check:supergraph-parity
# → "OK — local and AWS supergraphs are byte-identical (modulo routing URLs)"
```

---

## 7. AWS — seed (or re-seed) the Aurora database

The exact same `yarn seed` script that the local `db-init` container uses, just pointed at Aurora.

### 7.1 First-time bootstrap (empty Aurora)

```bash
cd romainRetreatCMS

# Generate a 15-min IAM token (will be embedded in DATABASE_URL):
export AURORA_HOST=database-1.cluster-XXXX.us-east-1.rds.amazonaws.com
export PGTOKEN=$(aws rds generate-db-auth-token \
  --hostname "$AURORA_HOST" --port 5432 --username postgres --region us-east-1)

# Pull PAYLOAD_SECRET out of Secrets Manager so it matches what the Lambdas use:
export PAYLOAD_SECRET=$(aws secretsmanager get-secret-value \
  --secret-id romain-retreat/payload-secret --region us-east-1 \
  --query SecretString --output text)

# Push schema + seed in one shot (PAYLOAD_DATABASE_PUSH=1 is set automatically by yarn seed):
DATABASE_URL="postgresql://postgres:${PGTOKEN}@${AURORA_HOST}:5432/postgres?sslmode=require" \
  yarn seed
```

This creates the same content set as the local `db-init` container: 1 user, 6 categories, 4 media, 3 posts (with related-posts), contact form, home + contact pages, header + footer globals.

### 7.2 Re-seed (wipe + repopulate)

The IAM token only lives 15 minutes — regenerate before each long-running seed:

```bash
export PGTOKEN=$(aws rds generate-db-auth-token \
  --hostname "$AURORA_HOST" --port 5432 --username postgres --region us-east-1)

DATABASE_URL="postgresql://postgres:${PGTOKEN}@${AURORA_HOST}:5432/postgres?sslmode=require" \
  PAYLOAD_SECRET=$(aws secretsmanager get-secret-value \
    --secret-id romain-retreat/payload-secret --region us-east-1 \
    --query SecretString --output text) \
  yarn seed --force                                         # DESTRUCTIVE: clears all content collections first
```

Without `--force` the script no-ops if `posts` already has rows (idempotent).

### 7.3 Sanity-check connectivity before seeding

The repo includes a helper that prints `pg_isready` + lists tables:

```bash
cd romainRetreatServer
yarn tsx scripts/probe-aurora.mts                           # uses AWS CLI / sigv4 — no env vars needed
```

---

## 8. Vercel — deploy the CMS / Next.js app

Only `romainRetreatCMS` deploys to Vercel. The federation server (Lambdas + Router) lives entirely in AWS.

### 8.1 Connect the project

1. Vercel Dashboard → Add New → Project → Import the `romainRetreatCMS` repo.
2. **Root Directory:** `romainRetreatCMS` (if importing the monorepo).
3. **Framework preset:** Next.js (auto-detected).
4. **Build Command:** `yarn build` (auto-detected).
5. **Install Command:** `yarn install --frozen-lockfile` (auto-detected).
6. **Output:** `.next` (default).
7. **Node version:** 22.x (Vercel project settings → Node.js version).

### 8.2 Environment variables (Project → Settings → Environment Variables)

Set these for **Production**, **Preview**, and **Development** as needed. See `romainRetreatCMS/.env.example` for the full reference; the minimal Vercel set is:

| Variable | Value | Why |
|---|---|---|
| `PAYLOAD_SECRET` | Same value as Secrets Manager `romain-retreat/payload-secret` | Payload session signing (must match Lambdas) |
| `DATABASE_URL` | `postgresql://postgres:<password>@<aurora-cluster>:5432/postgres?sslmode=require` | Payload admin reads/writes Aurora directly. Use a **password** here (Vercel can't sigv4-sign IAM tokens), so create a non-IAM read/write user for Vercel and grant it the same tables: `CREATE USER vercel WITH PASSWORD '…'; GRANT ALL ON ALL TABLES IN SCHEMA public TO vercel;`. Or use Aurora Data API + a wrapping `pg`-compatible URL. |
| `PAYLOAD_DATABASE_PUSH` | `0` | Schema is owned by the seed/Lambda flow; never let Vercel push |
| `NEXT_PUBLIC_SERVER_URL` | `https://<your-vercel-prod-domain>` | Used in sitemaps + image URLs |
| `PAYLOAD_SERVER_URL` | `https://<your-vercel-prod-domain>` | Same, for SSR fallbacks |
| `ROMAIN_RETREAT_SERVER_URL` | `http://romain-retreat-router-alb-XXXXXXX.us-east-1.elb.amazonaws.com` (the §5 output) | Apollo Client target — proxied via Next rewrite to `/api/retreat-graphql` (same-origin in the browser, no CORS) |
| `ROMAIN_RETREAT_SERVER_GRAPHQL_PATH` | `/` | Apollo Router serves at `/`, not `/graphql` |
| `S3_BUCKET` | `romain-media` | @payloadcms/storage-s3 |
| `S3_REGION` | `us-east-1` | |
| `S3_ACCESS_KEY_ID` | (IAM user) | Vercel can't assume an IAM role; create a dedicated user with `s3:GetObject`/`PutObject`/`DeleteObject` on `arn:aws:s3:::romain-media/*` |
| `S3_SECRET_ACCESS_KEY` | (IAM user) | |

**Vercel auto-sets** `VERCEL_PROJECT_PRODUCTION_URL` and `VERCEL=1`; the CMS uses both:
- `next.config.ts` derives `NEXT_PUBLIC_SERVER_URL` from `VERCEL_PROJECT_PRODUCTION_URL` if you don't set it explicitly.
- `@payloadcms/storage-s3` switches to **client-side uploads** (browser → S3 with pre-signed URLs) when `VERCEL` is set, which sidesteps Vercel's 4.5 MB request body limit. The S3 bucket needs CORS to allow `PUT/POST` from your Vercel origin (see `.env.example` for the policy).

### 8.3 First deploy

Push to the connected branch (`main` for prod, others for previews). Vercel runs `yarn install && yarn build`. The build invokes `next-sitemap` post-build via `postbuild`.

### 8.4 Day-2 ops

| Task | How |
|---|---|
| Update content via admin | `https://<vercel-domain>/admin` — writes go straight to Aurora |
| Update collection schema | Edit in `romainRetreatCMS/src/collections/...`, run `yarn generate:types` locally, then push. Vercel rebuilds; **also** run `cd ../romainRetreatServer && yarn deploy:lambda all && yarn publish:aws-subgraphs` so Lambdas + Apollo Studio see the new schema. |
| Switch the CMS between AWS Router and a local stack | Toggle `ROMAIN_RETREAT_SERVER_URL` (Vercel env var or local `.env`) per `romainRetreatCMS/.env.example` |
| Apply Drizzle migrations | Run §7.1 against Aurora once with `PAYLOAD_DATABASE_PUSH=1` (`yarn seed` does this automatically). Vercel never owns the schema. |

---

## 9. Verifying / day-2 ops

### Smoke-test the AWS supergraph end-to-end

```bash
ALB=$(aws cloudformation describe-stacks --stack-name romain-retreat-router \
  --region us-east-1 --query 'Stacks[0].Outputs[?OutputKey==`AlbUrl`].OutputValue' --output text)

curl -sS -X POST "$ALB" -H 'content-type: application/json' \
  -d '{"query":"{ Posts(limit:5){ totalDocs docs { id title slug _status } } }"}'
```

Expected: 3 seeded posts.

### Confirm local and AWS supergraphs match

```bash
cd romainRetreatServer && yarn check:supergraph-parity
```

### Confirm the CMS Apollo Client documents are still valid against the live endpoint

```bash
cd romainRetreatCMS && yarn check:graphql --url "$ALB"
# or against local docker:
cd romainRetreatCMS && yarn check:graphql --url http://127.0.0.1:4000/
```

### Re-deploy everything after a collection change

```bash
cd romainRetreatServer
yarn deploy:lambda all          # 5 stacks rebuilt + pushed
yarn publish:aws-subgraphs      # Apollo Studio re-composes
yarn check:supergraph-parity    # confirm local==AWS
# Vercel auto-redeploys when you push to the connected branch
```
