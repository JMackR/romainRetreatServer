# Per-subgraph image, cft-federation-server style: one container per logical subgraph.
# Build context is the monorepo root (RomainRetreatProject) so romainRetreatCMS + romainRetreatServer
# both land in the image. PAYLOAD_LAMBDA_SUBGRAPH selects the pruned domain at runtime; HEALTHCHECK
# hits Hono /health on the chosen subgraph port (default 4001 for users — see PAYLOAD_SUBGRAPH_DEV_PORTS).
#
#   docker build -f romainRetreatServer/subgraphs/users/Dockerfile -t romain-subgraph-users .
FROM node:22-bookworm-slim

RUN apt-get update -y && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY romainRetreatCMS /app/romainRetreatCMS
COPY romainRetreatServer /app/romainRetreatServer
WORKDIR /app/romainRetreatServer
RUN corepack enable && yarn install --frozen-lockfile

ENV NODE_ENV=development
ENV HOST=0.0.0.0
ENV PORT=4001
ENV PAYLOAD_LAMBDA_SUBGRAPH=users
EXPOSE 4001

HEALTHCHECK --interval=5s --timeout=5s --retries=10 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/health" | grep -q '"ok"' || exit 1

CMD ["yarn", "tsx", "subgraphs/users/index.ts"]
