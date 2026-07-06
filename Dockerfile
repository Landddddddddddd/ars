# Single-service image: Node backend that also serves the built frontend.
FROM node:22-slim AS base
WORKDIR /app

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
EXPOSE 8787
CMD ["npm", "start"]
