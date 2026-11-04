# syntax=docker/dockerfile:1

# Imagen del dashboard SCRC. Tres etapas para que la imagen final lleve solo lo
# necesario para correr (sin node_modules de desarrollo ni código fuente).

# 1) Dependencias: capa aparte para reutilizar la caché mientras no cambie package-lock.json
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# 2) Compilación: next build con salida "standalone" (ver next.config.ts)
FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_OUTPUT=standalone
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# 3) Ejecución: usuario sin privilegios y sin secretos dentro de la imagen.
# POSTGRES_URL se entrega al arrancar el contenedor (nunca en el build).
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/salud || exit 1
CMD ["node", "server.js"]
