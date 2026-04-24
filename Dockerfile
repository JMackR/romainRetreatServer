# Build from repository root:
#   docker build -f romainRetreatServer/Dockerfile -t romain-retreat-graphql .
#
# Expects romainRetreatCMS/src alongside romainRetreatServer (same layout as the repo).

FROM node:22-bookworm-slim AS deps
WORKDIR /app/romainRetreatServer

RUN corepack enable

COPY romainRetreatServer/package.json romainRetreatServer/yarn.lock ./
RUN yarn install --frozen-lockfile

FROM node:22-bookworm-slim AS runner
WORKDIR /app/romainRetreatServer

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3002

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

RUN corepack enable

COPY --from=deps --chown=nextjs:nodejs /app/romainRetreatServer/node_modules ./node_modules
COPY --chown=nextjs:nodejs romainRetreatServer/package.json romainRetreatServer/yarn.lock ./
COPY --chown=nextjs:nodejs romainRetreatServer/tsconfig.json ./
COPY --chown=nextjs:nodejs romainRetreatServer/src ./src
COPY --chown=nextjs:nodejs romainRetreatCMS/src ../romainRetreatCMS/src

USER nextjs

EXPOSE 3002

CMD ["yarn", "start"]
