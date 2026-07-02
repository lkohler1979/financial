# =============================================================================
# EthosFinancial — Web (Angular 17+)
# =============================================================================

FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/web/package.json ./apps/web/package.json

# ---------------------------------------------------------------------------
FROM base AS development
RUN npm install --workspaces --include-workspace-root
COPY apps/web ./apps/web
WORKDIR /app/apps/web
EXPOSE 4200
CMD ["npm", "run", "start", "--", "--host", "0.0.0.0", "--poll", "2000"]

# ---------------------------------------------------------------------------
FROM base AS build
RUN npm install --workspaces --include-workspace-root
COPY apps/web ./apps/web
WORKDIR /app/apps/web
RUN npm run build -- --configuration production

# ---------------------------------------------------------------------------
FROM nginx:alpine AS production
COPY --from=build /app/apps/web/dist/ethos-financial-web/browser /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
