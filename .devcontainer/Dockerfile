# Legal MCP Server - Development Container

FROM node:22-alpine3.20

# Install system dependencies and security updates
RUN apk update && apk upgrade && \
    apk add --no-cache \
    git \
    openssh \
    curl \
    ca-certificates \
    tzdata \
    && rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Set working directory
WORKDIR /workspace

# Change ownership to non-root user
RUN chown -R nextjs:nodejs /workspace

# Switch to non-root user
USER nextjs

# Install global development tools
RUN npm install -g \
    typescript \
    @modelcontextprotocol/inspector \
    nodemon \
    pnpm

# Copy package files
COPY package*.json ./
COPY pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install

# Copy project files
COPY . .

# Expose ports for development
EXPOSE 3001 6274 9229

# Set development environment
ENV NODE_ENV=development
ENV LOG_LEVEL=debug

# Default command for development
CMD ["npm", "run", "dev"]
