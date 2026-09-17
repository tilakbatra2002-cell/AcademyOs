# ---------------------------------------------------------------------------
# AcademyOS API — production image
#
# Multi-stage: the toolchain (typescript, tsx, vitest) stays in the builder and
# never reaches the runtime layer. Works on Render, Railway, Fly.io, Cloud Run,
# ECS or any plain Docker host.
#
#   docker build -t academyos-api ./server
#   docker run -p 4000:4000 --env-file server/.env academyos-api
# ---------------------------------------------------------------------------

# ---------- build ----------
FROM node:20-bookworm-slim AS build
WORKDIR /app

# Install with dev dependencies so tsc is available.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Drop dev dependencies so we can copy a lean node_modules into the runtime.
RUN npm prune --omit=dev

# ---------- runtime ----------
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# dumb-init gives us correct PID-1 signal forwarding so SIGTERM reaches Node
# and the server's graceful-shutdown handler actually runs.
RUN apt-get update \
 && apt-get install -y --no-install-recommends dumb-init \
 && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# Run unprivileged (the node image ships a `node` user).
USER node

# Hosting providers inject PORT; the app falls back to 4000.
ENV PORT=4000
EXPOSE 4000

# Container-level health check hitting the app's own endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
