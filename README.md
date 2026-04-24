# romainRetreatServer

Standalone **Payload GraphQL** + **SQLite** process for Romain Retreat. It imports the shared [`romainRetreatCMS`](../romainRetreatCMS) Payload config and collections so the schema stays in one place.

## Ports

| Service              | Port | URL                                      |
| -------------------- | ---- | ---------------------------------------- |
| GraphQL (this app)   | 3002 | `http://127.0.0.1:3002/api/graphql`      |
| Payload admin (Next) | 3001 | `http://127.0.0.1:3001/admin`            |
| Next web             | 3000 | `http://127.0.0.1:3000`                  |

## Setup

1. From this directory: `cp .env.example .env` and set `PAYLOAD_SECRET` (same value as in `romainRetreatCMS/.env`).
2. Ensure `DATABASE_URL` points at `./data/payload.db` (default in `.env.example`).
3. If you already have a SQLite file at `romainRetreatCMS/romainRetreatCMS.db`, copy it once:

   ```bash
   mkdir -p data && cp ../romainRetreatCMS/romainRetreatCMS.db ./data/payload.db
   ```

4. Install and run:

   ```bash
   yarn install
   yarn dev
   ```

5. In **`romainRetreatCMS/.env`**, use the same `PAYLOAD_SECRET`, set `PAYLOAD_DISABLE_GRAPHQL=true`, and point `DATABASE_URL` at the same file (see `romainRetreatCMS/.env.example`).

From the monorepo root you can use `yarn server:dev`.
