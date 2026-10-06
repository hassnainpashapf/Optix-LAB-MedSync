# LabPOS cloud API — production image
FROM node:20-alpine

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# App code (server, adapters, seed, releases)
COPY server.js sync-store.js tenant-store.js saas.js desktop-sync.js db-pg.js db-sqlite.js seed.json default-params.json report-viewer.html releases.json ./

ENV NODE_ENV=production \
    PORT=4000 \
    BIND_HOST=0.0.0.0 \
    DB_ADAPTER=pg

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT:-4000}/api/health | grep -q '"ok":true' || exit 1

CMD ["node", "server.js"]
