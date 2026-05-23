ARG DOCKER_REGISTRY=

# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM ${DOCKER_REGISTRY}node:20-alpine AS builder

WORKDIR /app

ARG NPM_REGISTRY=https://registry.npmjs.org/
ARG NPM_AUTH=
RUN npm config set registry "$NPM_REGISTRY" && \
    if [ -n "$NPM_AUTH" ]; then \
      HOST=$(echo "$NPM_REGISTRY" | sed 's|^https\?://||' | sed 's|/$||'); \
      npm config set "//${HOST}/:_auth" "$NPM_AUTH"; \
      npm config set "//${HOST}/:always-auth" true; \
      npm config set strict-ssl false; \
    fi

COPY package.json package-lock.json* ./
RUN npm install --prefer-offline --ignore-scripts --include=dev --verbose

COPY . .
RUN npm run build && \
    cp -r src/db/migrations dist/db/migrations

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM ${DOCKER_REGISTRY}node:20-alpine

WORKDIR /app

ARG NPM_REGISTRY=https://registry.npmjs.org/
ARG NPM_AUTH=
RUN npm config set registry "$NPM_REGISTRY" && \
    if [ -n "$NPM_AUTH" ]; then \
      HOST=$(echo "$NPM_REGISTRY" | sed 's|^https\?://||' | sed 's|/$||'); \
      npm config set "//${HOST}/:_auth" "$NPM_AUTH"; \
      npm config set "//${HOST}/:always-auth" true; \
      npm config set strict-ssl false; \
    fi

COPY package.json package-lock.json* ./
RUN npm install --prefer-offline --omit=dev --ignore-scripts --verbose

COPY --from=builder /app/dist ./dist

# Directory for uploaded multi-file apps (mounted as a Docker volume)
RUN mkdir -p /app/uploads && chown node:node /app/uploads

ENV NODE_ENV=production
ENV PORT=3001
ENV UPLOADS_DIR=/app/uploads

EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

USER node

CMD ["node", "dist/index.js"]
