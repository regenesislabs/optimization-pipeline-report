# Build stage for server
FROM node:20-alpine AS server-builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./

# Install all dependencies
RUN npm install

# Copy source code
COPY src ./src

# Build server
RUN npm run build:server

# Build stage for UI
FROM node:20-alpine AS ui-builder

WORKDIR /app

# Build args for UI configuration (can be overridden at build time)
ARG VITE_OPTIMIZATION_API_URL=https://optimized-assets.dclexplorer.com/v3
ARG VITE_WORLDS_API_URL=https://worlds-content-server.decentraland.org

# Set as env vars for Vite build
ENV VITE_OPTIMIZATION_API_URL=$VITE_OPTIMIZATION_API_URL
ENV VITE_WORLDS_API_URL=$VITE_WORLDS_API_URL

# Copy UI package files
COPY ui/package*.json ./
RUN npm install

# Copy UI source
COPY ui/ ./

# Build UI
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy server build and package files
COPY --from=server-builder /app/dist ./dist
COPY --from=server-builder /app/package*.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy UI build to public directory
COPY --from=ui-builder /app/dist ./public

# Copy default env file
COPY .env.default ./

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Run server
CMD ["node", "dist/server/index.js"]
