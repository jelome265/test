# ─── Build stage ──────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Install build essentials for native modules (e.g. @sentry/profiling-node)
RUN apk add --no-cache python3 make g++ libc6-compat

WORKDIR /app

# ── Dependency layer (cached unless package files change) ──────────
# Copy only manifests first so dependency install is cached
COPY package.json package-lock.json turbo.json ./
COPY apps/backend/package.json             ./apps/backend/
COPY packages/shared-types/package.json    ./packages/shared-types/
COPY packages/shared-validation/package.json ./packages/shared-validation/
COPY packages/shared-constants/package.json  ./packages/shared-constants/

RUN npm ci --frozen-lockfile

# ── Source layer ───────────────────────────────────────────────────
COPY tsconfig.base.json           ./
COPY apps/backend/                ./apps/backend/
COPY apps/backend/tsconfig.json   ./apps/backend/
COPY apps/backend/tsconfig.build.json ./apps/backend/
COPY packages/shared-types/       ./packages/shared-types/
COPY packages/shared-validation/  ./packages/shared-validation/
COPY packages/shared-constants/   ./packages/shared-constants/

# ── Build ─────────────────────────────────────────────────────────
# Build shared packages first (backend depends on them)
RUN cd packages/shared-types      && npx tsc -p tsconfig.json --noEmit false --declaration true || true
RUN cd packages/shared-validation && npx tsc -p tsconfig.json --noEmit false --declaration true || true
RUN cd packages/shared-constants  && npx tsc -p tsconfig.json --noEmit false --declaration true || true

# Build backend
RUN cd apps/backend && npm run build

# ── Prune dev dependencies ─────────────────────────────────────────
RUN npm prune --omit=dev

# ─── Production stage ─────────────────────────────────────────────
FROM node:20-alpine AS runner

# Security hardening
RUN apk add --no-cache dumb-init && \
    addgroup -g 1001 -S nodejs && \
    adduser  -S courier -u 1001 -G nodejs

WORKDIR /app

# Copy only what the production runtime needs
COPY --from=builder --chown=courier:nodejs /app/apps/backend/dist         ./dist
COPY --from=builder --chown=courier:nodejs /app/apps/backend/package.json  ./package.json
COPY --from=builder --chown=courier:nodejs /app/node_modules               ./node_modules

# Drop privileges
USER courier

EXPOSE 3000

# Health check — matches Railway's health probe configuration
HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/v1/health', (r) => { \
    process.exit(r.statusCode === 200 ? 0 : 1); \
  }).on('error', () => process.exit(1));"

# Use dumb-init as PID 1 for proper signal handling
# Without this, SIGTERM from Docker/Kubernetes doesn't reach Node
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/index.js"]
