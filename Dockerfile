# Image de production BozoChat : un seul conteneur sert le front (React), l'API (NestJS) et Socket.IO.

# ---------- 1. Build ----------
FROM node:24-slim AS build
WORKDIR /repo
RUN corepack enable

# Dépendances d'abord (cache Docker : ne se réinstalle que si les manifestes changent)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# Ne garder que les dépendances de production de l'API
RUN pnpm --filter api deploy --prod --legacy /out/apps/api \
 && cp -r apps/api/dist apps/api/drizzle /out/apps/api/ \
 && mkdir -p /out/apps/web && cp -r apps/web/dist /out/apps/web/

# ---------- 2. Runtime ----------
FROM node:24-slim AS runtime
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
WORKDIR /app/apps/api
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Applique les migrations puis démarre le serveur
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/main.js"]
