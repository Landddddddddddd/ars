# Single-service image: Node backend that also serves the built frontend.
FROM node:22-slim AS base
WORKDIR /app

# Build tools for native modules (better-sqlite3) in case no prebuilt binary
# matches the platform; prebuild-install uses these only as a fallback.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Install all deps (dev deps needed to build the web app + run tsx).
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci

# Build the frontend into apps/web/dist.
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=8787
# SQLite lives here — mount a volume at /data so users & credits survive redeploys:
#   docker run -p 8787:8787 -v ars-data:/data ars
ENV DATABASE_PATH=/data/ars.db
VOLUME ["/data"]
EXPOSE 8787
CMD ["npm", "start"]
