# =============================================================================
# Nexus RTP Frontend - Development Docker Image
# Multi-stage build for production-quality output
# =============================================================================

# Stage 1: Dependencies
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate
WORKDIR /app

# Copy workspace config
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/ui/package.json packages/ui/
COPY apps/web/package.json apps/web/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Stage 2: Build UI library
FROM deps AS ui-build
WORKDIR /app

COPY packages/ui ./packages/ui

RUN pnpm --filter @nexus/ui build

# Stage 3: Build Next.js app
FROM deps AS builder
WORKDIR /app

COPY --from=ui-build /app/packages/ui ./packages/ui
COPY apps/web ./apps/web

# Build args for API URLs
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ARG NEXT_PUBLIC_WS_URL=ws://localhost:8089/ws
ARG NEXT_PUBLIC_MOCK_MODE=false
ARG NEXT_PUBLIC_ENABLE_REALTIME=true

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_MOCK_MODE=$NEXT_PUBLIC_MOCK_MODE
ENV NEXT_PUBLIC_ENABLE_REALTIME=$NEXT_PUBLIC_ENABLE_REALTIME

RUN pnpm --filter @nexus/web build

# Stage 4: Production runner
FROM node:20-alpine AS runner
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/web/public ./apps/web/public

# Set the correct permission for prerender cache
RUN mkdir -p apps/web/.next
RUN chown nextjs:nodejs apps/web/.next

# Automatically leverage output traces to reduce image size
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
