# syntax=docker/dockerfile:1

###############################################################################
# Nexus — Next.js 16 (App Router) + Prisma 7 (adapter-pg) → Supabase Postgres
#
# Imagen de producción "standalone" (chica). La base de datos es Supabase
# (externa, gestionada): este contenedor levanta SOLO la app, no Postgres.
#
# Build:  docker compose build
# Run:    docker compose up -d
###############################################################################

# Debian slim (glibc) en lugar de Alpine (musl): más seguro para módulos NATIVOS
# (bcrypt) y para el motor de Prisma (OpenSSL 3).
ARG NODE_IMAGE=node:22-bookworm-slim

# ── 1) deps — instala TODAS las dependencias (incl. dev: las necesita next build)
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
# Toolchain por si bcrypt compila desde fuente + openssl/ca-certificates para Prisma.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# ── 2) builder — genera el cliente Prisma y compila Next ──────────────────────
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
# unzip: extrae el .zip de Chrome for Testing (ver el download de abajo).
RUN apt-get update && apt-get install -y --no-install-recommends openssl unzip \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules

# Chrome for Testing (Google), el binario OFICIAL que Puppeteer soporta. El
# `chromium` de Debian (apt) crashea con SIGILL al arrancar en el CPU virtualizado
# de ciertos VPS/hipervisores (usa instrucciones que la VM no ejecuta aunque
# /proc/cpuinfo las anuncie) — confirmado en producción con strace/--privileged:
# el binario de Google corre y el de Debian no. Se baja acá con @puppeteer/browsers
# (ya es dep de puppeteer-core), versión pineada = ruta determinista, y se copia
# al runner. `unzip` (arriba) lo extrae.
ARG CHROME_BUILD_ID=150.0.7871.24
RUN node -e "require('@puppeteer/browsers').install({browser:'chrome',buildId:'${CHROME_BUILD_ID}',cacheDir:'/opt/chrome'}).then(r=>console.log('Chrome for Testing:',r.executablePath))"

COPY . .

# NEXT_PUBLIC_* se INLINEAN en el bundle del navegador en build-time → hay que
# pasarlas como build args (son públicas; la anon key es segura de exponer).
ARG NEXT_PUBLIC_SUPABASE_URL=""
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=""
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}

# Placeholder solo para que el build no truene si algún módulo lee la URL al
# evaluarse. La conexión REAL ocurre en runtime con la env del contenedor — este
# valor NO se hornea en la imagen final (la etapa builder se descarta).
ARG DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV DATABASE_URL=${DATABASE_URL}
ENV NEXT_TELEMETRY_DISABLED=1

RUN npx prisma generate
RUN npm run build

# ── 3) runner — imagen final mínima ──────────────────────────────────────────
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# openssl + ca-certificates: requeridos por Prisma y por el TLS hacia Supabase.
# El paquete `chromium` se instala por sus LIBRERÍAS de sistema (nss, atk, gbm,
# gtk, pango, cairo, x11… vía sus dependencias transitivas — el set COMPLETO que
# un browser Chromium-based necesita en Debian). Chrome for Testing (el que sí
# usamos, ver el COPY /opt/chrome de abajo) usa exactamente ese mismo set. El
# BINARIO de Debian NO se usa (crashea con SIGILL en el CPU virtualizado); se
# instala el paquete solo para garantizar la cobertura de libs sin enumerarlas
# a mano y arriesgar que falte una.
RUN apt-get update && apt-get install -y --no-install-recommends \
      openssl ca-certificates chromium fonts-liberation \
      libasound2 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdbus-1-3 \
      libgbm1 libgtk-3-0 libnss3 libxss1 libxrandr2 libxkbcommon0 xdg-utils \
  && rm -rf /var/lib/apt/lists/*

# Salida standalone de Next (server.js + node_modules trazado).
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
# Cliente + motor de Prisma generados. El trazado standalone a veces NO copia el
# binario del engine — lo copiamos explícito para evitar errores en runtime.
COPY --from=builder --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=node:node /app/node_modules/@prisma ./node_modules/@prisma

# Chrome for Testing (bajado en el builder) + symlink ESTABLE → el endpoint de
# export-pdf lo usa vía PUPPETEER_EXECUTABLE_PATH. El symlink por `find` evita
# hardcodear el número de versión acá (queda pineado en un solo lugar: el ARG
# CHROME_BUILD_ID del builder). El ENV lo consume export-pdf/route.ts.
COPY --from=builder --chown=node:node /opt/chrome /opt/chrome
RUN ln -sf "$(find /opt/chrome -type f -name chrome -path '*chrome-linux64*' | head -1)" /usr/local/bin/chrome-pdf
ENV PUPPETEER_EXECUTABLE_PATH=/usr/local/bin/chrome-pdf

USER node
EXPOSE 3000
CMD ["node", "server.js"]
