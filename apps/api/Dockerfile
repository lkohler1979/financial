# =============================================================================
# EthosFinancial — API (Node.js 20 + Express 5 + TypeScript + Prisma)
# =============================================================================

FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/shared-types/package.json ./packages/shared-types/package.json

# ---------------------------------------------------------------------------
FROM base AS development
RUN npm install --workspaces --include-workspace-root
COPY apps/api ./apps/api
COPY packages/shared-types ./packages/shared-types
WORKDIR /app/apps/api
RUN npx prisma generate
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ---------------------------------------------------------------------------
FROM base AS build
RUN npm install --workspaces --include-workspace-root
COPY apps/api ./apps/api
COPY packages/shared-types ./packages/shared-types
WORKDIR /app/apps/api
RUN npx prisma generate
RUN npm run build

# ---------------------------------------------------------------------------
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/node_modules ./node_modules
COPY --from=build /app/apps/api/prisma ./prisma
COPY --from=build /app/apps/api/templates ./templates
EXPOSE 3000
CMD ["node", "dist/server.js"]
