# ── Build stage ──────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json ./

# Install all dependencies (including devDeps for build)
RUN npm ci

# ── Production stage ─────────────────────────────────────────
FROM node:20-slim

WORKDIR /app

# Create a non-root user for security
RUN groupadd -r nemo && useradd -r -g nemo -d /app -s /sbin/nologin nemo

# Copy production dependencies from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application source
COPY package.json package-lock.json ./
COPY src/ ./src/

# Set ownership
RUN chown -R nemo:nemo /app

USER nemo

# Use tini for proper signal handling
# Expose is informational — the bot only needs DISCORD_TOKEN to connect to Discord
# The bot listens for Discord gateway events, no HTTP port required
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "process.exit(0)" || exit 1

CMD ["node", "src/index.js"]
