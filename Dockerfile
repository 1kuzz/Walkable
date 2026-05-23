# Multi-stage build: Node builds the SPA, nginx serves it.
# No Node.js required on the host — only Docker needed.
ARG DOCKER_REGISTRY=

# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM ${DOCKER_REGISTRY}node:20-alpine AS builder

WORKDIR /app

# Install dependencies (ci = reproducible, honours package-lock.json)
COPY package.json package-lock.json ./
RUN npm ci --prefer-offline --ignore-scripts --include=dev

# Copy source and build
COPY . .

ARG VITE_APP_VERSION=dev
ENV VITE_APP_VERSION=$VITE_APP_VERSION

RUN npm run build && \
    echo "$VITE_APP_VERSION" > dist/version.txt

# ── Stage 2: serve ────────────────────────────────────────────────────────────
FROM ${DOCKER_REGISTRY}nginx:1.27-alpine

# Redirect all nginx writable paths to /tmp so the container runs rootless.
RUN sed -i \
      -e 's|pid\s*/run/nginx.pid;|pid /tmp/nginx.pid;|' \
      -e 's|pid\s*/var/run/nginx.pid;|pid /tmp/nginx.pid;|' \
      /etc/nginx/nginx.conf && \
    rm -f /etc/nginx/conf.d/default.conf

# NGINX_BACKEND_HOST: Docker container name of the backend on the same network.
ARG NGINX_BACKEND_HOST=backend
COPY nginx.conf /tmp/nginx.conf.template
RUN envsubst '${NGINX_BACKEND_HOST}' < /tmp/nginx.conf.template > /etc/nginx/conf.d/portal.conf && \
    rm /tmp/nginx.conf.template

COPY --from=builder /app/dist /usr/share/nginx/html

ARG VITE_APP_VERSION=dev
ENV VITE_APP_VERSION=$VITE_APP_VERSION

# Fix permissions for rootless operation.
RUN chown -R nginx:nginx /usr/share/nginx/html \
    && chown -R nginx:nginx /var/log/nginx

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh && \
    chown nginx:nginx /docker-entrypoint.sh

USER nginx

EXPOSE 80

CMD ["/docker-entrypoint.sh"]
