# Legal MCP Server - Production Dockerfile
FROM node:22-alpine3.20

# Install security updates and necessary packages
RUN apk update && apk upgrade && \
    apk add --no-cache \
    curl \
    ca-certificates \
    tzdata \
    && rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /app

# Create non-root user first
RUN addgroup -g 1001 -S mcp && \
    adduser -S mcp -u 1001

# Install dependencies first (for better caching)
COPY package*.json ./
RUN npm ci --include=dev && npm cache clean --force

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Remove dev dependencies to reduce size
RUN npm prune --production

# Change ownership of app directory to non-root user
RUN chown -R mcp:mcp /app
USER mcp

# Expose health check port and HTTP transport port
EXPOSE 3001 3002

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Set default environment variables
ENV NODE_ENV=production \
    CACHE_ENABLED=true \
    LOG_LEVEL=info \
    LOG_FORMAT=json \
    METRICS_ENABLED=true \
    METRICS_PORT=3001 \
    TRANSPORT=stdio \
    MCP_HTTP_PORT=3002 \
    MCP_HTTP_HOST=0.0.0.0

# Start the server (default: stdio mode)
# For HTTP transport mode, set TRANSPORT=http or use: CMD ["node", "dist/index.js", "--http"]
CMD ["node", "dist/index.js"]