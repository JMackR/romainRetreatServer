# Monorepo build: run from the directory that contains `romainRetreatServer` and `romainRetreatCMS` as siblings:
#   docker build -f romainRetreatServer/Dockerfile -t romain-graphql .
FROM node:22-bookworm-slim

RUN apt-get update -y && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY romainRetreatCMS /app/romainRetreatCMS
COPY romainRetreatServer /app/romainRetreatServer
RUN corepack enable
# Install BOTH packages' deps. The runtime imports `romainRetreatCMS/src/payload.config.ts`,
# whose bare `import 'payload'` resolves against the *importing file's* node_modules tree
# (Node ESM rule), so the CMS folder must have its own node_modules. The db-init one-shot
# also runs `romainRetreatCMS/scripts/seed-all.mts` which depends on @payloadcms/* plugins
# only declared in the CMS package.json.
RUN cd /app/romainRetreatCMS && yarn install --frozen-lockfile
RUN cd /app/romainRetreatServer && yarn install --frozen-lockfile
WORKDIR /app/romainRetreatServer

ENV NODE_ENV=development
ENV HOST=0.0.0.0
ENV PORT=3002
EXPOSE 3002

HEALTHCHECK --interval=5s --timeout=5s --retries=5 \
  CMD curl -fsS "http://127.0.0.1:3002/health" | grep -q "ok" || exit 1

CMD ["yarn", "start"]
