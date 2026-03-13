# ── Stage 1: Build ─────────────────────────────────────────────────────────
FROM node:20.19.0-alpine AS builder

WORKDIR /app

# Copiar package files primero — aprovecha cache de Docker
COPY package*.json ./
COPY tsconfig.json ./

# Instalar TODAS las dependencias (incluyendo devDependencies para compilar)
RUN npm ci

# Copiar código fuente
COPY src ./src

# Compilar TypeScript
RUN npm run build

# ── Stage 2: Production ────────────────────────────────────────────────────
FROM node:20.19.0-alpine AS production

WORKDIR /app

# Crear usuario no-root por seguridad
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copiar package files
COPY package*.json ./

# Instalar SOLO dependencias de producción
RUN npm ci --omit=dev && npm cache clean --force

# Copiar build desde stage anterior
COPY --from=builder /app/dist ./dist

# Cambiar ownership al usuario no-root
RUN chown -R nodejs:nodejs /app

USER nodejs

# Exponer puerto
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Arrancar servidor
CMD ["node", "dist/server.js"]

