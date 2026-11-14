# Keyring API — build from the repo root:
#   docker build -f apps/server/Dockerfile -t keyring-api .
FROM node:22-slim AS build
WORKDIR /repo
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile --filter @keyring/server...
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN pnpm --filter @keyring/server build \
 && pnpm --filter @keyring/server deploy --prod /out

FROM node:22-slim
ENV NODE_ENV=production PORT=8787 DATABASE_PATH=/data/keyring.sqlite
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/server/dist ./dist
COPY --from=build /repo/apps/server/package.json ./
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8787
HEALTHCHECK CMD node -e "fetch('http://localhost:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "dist/index.js"]
