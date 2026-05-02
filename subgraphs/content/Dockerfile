# Per-subgraph image, cft-federation-server style: one container per logical subgraph.
# Build context is the monorepo root so romainRetreatCMS + romainRetreatServer both land in the image.
#
#   docker build -f romainRetreatServer/subgraphs/content/Dockerfile -t romain-subgraph-content .
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
ENV PORT=4004
ENV PAYLOAD_LAMBDA_SUBGRAPH=content
EXPOSE 4004

HEALTHCHECK --interval=5s --timeout=5s --retries=10 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/health" | grep -q '"ok"' || exit 1

CMD ["yarn", "tsx", "subgraphs/content/index.ts"]
