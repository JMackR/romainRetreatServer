# AWS: subgraph + federation + GraphOS

This document implements the deployment checklist for **romainRetreatServer** (Federation subgraph) and optional **Apollo Router (Rust)** on AWS.

## 1. Connect your machine to AWS (todo: AWS prerequisites)

1. Create an **IAM user** or **IAM Identity Center (SSO)** role with permission to run CloudFormation, Lambda, IAM (role creation), S3 (for SAM artifacts), and optionally ECS/EC2/RDS.
2. Install **AWS CLI v2** and **AWS SAM CLI**.
3. Run `aws configure` or `aws configure sso` and `aws sso login`.
4. Choose a **region** (e.g. `us-east-1`) and use it everywhere below.

## 2. Database and optional VPC (todo: RDS / VPC)

- **Lambda cannot use local SQLite files** for production. Payload is configured for **Postgres** when `DATABASE_URL` is a `postgres://` or `postgresql://` URL (see `romainRetreatCMS/src/payload.db.ts`).
- If RDS is in a **private subnet**, put the deployed Lambda in the **same VPC** after deploy: **Lambda → Configuration → VPC** (subnets + security group). The execution role already includes **`AWSLambdaVPCAccessExecutionRole`** for ENIs. Ensure the Lambda SG can reach RDS on **5432** and RDS allows inbound from that SG.
- With **no** VPC on the function, only **publicly reachable** RDS (or other network paths) will work for `DATABASE_URL`.

### RDS IAM database authentication (same pattern as `aws rds generate-db-auth-token`)

1. In the RDS console, enable **IAM DB authentication** on the instance (modify instance).
2. In PostgreSQL, grant the DB user the RDS IAM role, e.g. `GRANT rds_iam TO postgres;` (user must match `RdsIamDbUser` / the user in `DATABASE_URL`).
3. Deploy with a **passwordless** URL and IAM flags, for example:

   `DatabaseUrl` = `postgresql://postgres@database-1-instance-1.cq5m8kimg8gg.us-east-1.rds.amazonaws.com:5432/postgres?sslmode=require`

   `UseRdsIamAuth` = `true`

   `RdsDbiResourceId` = the instance **Resource ID** from RDS → your DB → **Configuration** (value like `db-ABCDEFGHIJKLMNOPQRSTUVWXYZ`).

4. On **first** connect to an empty database, deploy with **`PayloadDatabasePush=1`** (stack parameter) so Payload can create tables; set it back to **`0`** after the schema exists.

### Static password instead of IAM

Use a normal URL, e.g. `postgresql://user:password@host:5432/dbname?sslmode=require`, and keep `UseRdsIamAuth` = `false` (default). Prefer **Secrets Manager** and a short-lived deploy pipeline over committing passwords.

### Local database development

- **SQLite (default):** keep a non-Postgres `DATABASE_URL` (e.g. `file:../romainRetreatServer/data/payload.db` in [`.env.example`](../../romainRetreatCMS/.env.example)). `RDS_IAM_AUTH` from a copied Lambda env is **ignored** unless the process runs on Lambda (`AWS_LAMBDA_FUNCTION_NAME`) or you set `RDS_IAM_AUTH_ALLOW_LOCAL=1` to test IAM signing locally.
- **Local Postgres:** set `DATABASE_URL` to a normal URL with user/password (and optional `?sslmode=disable` for Docker). Leave `RDS_IAM_AUTH` unset.
- **Force SQLite:** set `PAYLOAD_DB_DRIVER=sqlite` if you need a file DB while `DATABASE_URL` still looks like `postgresql://...`.

## 3. Deploy the subgraph with SAM (todo: sam build / deploy)

The Lambda **CodeUri** is the **monorepo root** so esbuild can see `romainRetreatCMS`. Dependencies are installed from **`romainRetreatServer/package.json`** via the manifest flag.

```bash
cd romainRetreatServer
cp samconfig.toml.example samconfig.toml
# Edit samconfig.toml: set `parameter_overrides` to include DatabaseUrl and PayloadSecret (required — no template defaults).
# If you leave parameter_overrides empty, deploy fails with: Parameters [DatabaseUrl, PayloadSecret] must have values.

yarn sam:build
# Equivalent: sam build -m package.json   (from romainRetreatServer; uses template CodeUri ../)
# `sam deploy` alone reuses the last `.aws-sam/build` output — if the template changed, run `yarn sam:build` first (or use `yarn sam:deploy`, which builds then deploys).
sam deploy --guided
# Subsequent deploys:
# sam deploy --config-env default
```

**Parameters**

| Parameter | Description |
|-----------|-------------|
| `DatabaseUrl` | Postgres URL. For IAM auth, omit the password (see above). |
| `PayloadSecret` | Same secret you use for Payload elsewhere. |
| `UseRdsIamAuth` | `true` / `false`. When `true`, Lambda sets `RDS_IAM_AUTH=1` and signs tokens with `@aws-sdk/rds-signer`. |
| `RdsDbiResourceId` | Required when `UseRdsIamAuth` is `true` (RDS **Resource ID**, `db-...`). |
| `RdsIamDbUser` | DB username for the IAM policy resource (default `postgres`). |
| `PayloadDatabasePush` | `0` or `1`. Use `1` once on an empty Postgres DB to create Payload tables; then `0`. |

**VPC** is not a stack parameter (CloudFormation early validation rejects `Fn::Split` on empty subnet/SG strings). Attach the function to a VPC in the **AWS Console** when needed (see §2 above).

If CloudFormation errors on `AWS::LanguageExtensions`, remove that transform from [template.yaml](../template.yaml) per AWS guidance for your region.

**Outputs**

- `SubgraphUrl` — Lambda **Function URL** (base URL). Use **`{SubgraphUrl}/graphql`** (or `/api/graphql`) as the GraphOS **routing URL**.

If CloudFormation fails on the output resource name, check the stack’s **Resources** for `AWS::Lambda::Url` and adjust [template.yaml](../template.yaml) `Outputs` accordingly.

## 4. Publish the subgraph endpoint to Apollo (todo: GraphOS / routing URL)

1. In **Apollo Studio**, copy **`APOLLO_KEY`** for graph **RomainRetreat** (or your graph).
2. Copy `apollo.publish.env.example` → `apollo.publish.env` and set:
   - `APOLLO_KEY`
   - `SUBGRAPH_ROUTING_URL` = `https://<lambda-url-id>.lambda-url.<region>.on.aws/graphql` (from SAM output `SubgraphUrl` + path).
3. Ensure `DATABASE_URL` and `PAYLOAD_SECRET` are available for SDL export (root `docker.env` or env vars).
4. Run:

```bash
yarn publish:subgraph
```

## 5. Rust Apollo Router on AWS (todo: ECS Fargate)

Vercel cannot run the Router binary. On AWS, run the **official Router image** on **ECS Fargate** (or EKS).

- Template: [aws/router-fargate.yaml](../aws/router-fargate.yaml) — Fargate + public ALB on port 80 → Router :4000. Router uses **GraphOS uplink** from `APOLLO_KEY` + `APOLLO_GRAPH_REF` (no `router.yaml` volume). Add **HTTPS / ACM** on the ALB for production.
- Deploy (example; run from `romainRetreatServer`):

```bash
aws cloudformation deploy \
  --template-file aws/router-fargate.yaml \
  --stack-name romain-retreat-router \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    VpcId=vpc-xxx \
    PublicSubnetIds=subnet-aaa,subnet-bbb \
    ApolloKey=service:... \
    ApolloGraphRef=RomainRetreat@current
```

Point clients at the stack **output** `RouterServiceUrl` (or put an ALB in front for TLS and custom domain — extend the stack as needed).

**GraphOS uplink mode:** the template sets `APOLLO_KEY` and `APOLLO_GRAPH_REF` so the Router pulls the composed supergraph from Apollo (same idea as local `router` + Studio).

## Architecture

```mermaid
flowchart TB
  subgraph graphos [Apollo GraphOS]
    key[APOLLO_KEY]
    compose[Composition]
  end
  subgraph awsLambda [AWS Lambda]
    fn[SubgraphFunction]
    url[Function URL]
  end
  subgraph awsEcs [AWS ECS Fargate optional]
    router[Apollo Router Rust]
  end
  subgraph data [Data]
    rds[(RDS Postgres)]
  end
  compose --> key
  url --> fn
  fn --> rds
  graphos -->|uplink| router
  router -->|HTTP| url
```

Without ECS, clients can use **Apollo’s hosted graph endpoint** from Studio while the subgraph runs only on Lambda.
