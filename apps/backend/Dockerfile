# ─── Build stage ──────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace manifests
COPY package.json turbo.json ./
COPY apps/backend/package.json ./apps/backend/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-validation/package.json ./packages/shared-validation/
COPY packages/shared-constants/package.json ./packages/shared-constants/

# Install dependencies
RUN npm ci

# Copy source
COPY apps/backend/ ./apps/backend/
COPY packages/ ./packages/
COPY tsconfig.base.json ./

# Build
RUN cd apps/backend && npm run build

# ─── Production stage ─────────────────────────────────────────────
FROM node:20-alpine AS runner

# Security: run as non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S courier -u 1001

WORKDIR /app

# Copy only production artifacts
COPY --from=builder --chown=courier:nodejs /app/apps/backend/dist ./dist
COPY --from=builder --chown=courier:nodejs /app/apps/backend/package.json ./

# Install production deps only
RUN npm ci --omit=dev

USER courier

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "dist/index.js"]

