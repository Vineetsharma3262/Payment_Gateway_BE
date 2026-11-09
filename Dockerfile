# syntax=docker/dockerfile:1.7
# One image, several processes: the API (default CMD) and workers
# (override the command, e.g. `node dist/workers/outbox-relay/main.js`).
# Migrations run as a separate one-off task from the `deps` stage, which keeps
# the Prisma CLI and schema: `docker build --target deps -t payco-migrate .` then
# `docker run --env DATABASE_URL=… payco-migrate npx prisma migrate deploy`.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --ignore-scripts && npx prisma generate

FROM deps AS build
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
# The generated Prisma client in node_modules/.prisma survives the prune.
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl tini && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --chown=node:node package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.APP_PORT||3000)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
