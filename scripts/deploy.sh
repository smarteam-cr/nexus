#!/usr/bin/env bash
###############################################################################
# deploy.sh — deploy de producción de Nexus. UN comando, SIEMPRE igual:
#
#   cd /opt/smartflow/Nexus && bash scripts/deploy.sh
#
# Regla de oro: SIEMPRE rebuild. La causa #1 de la ola de errores de julio 2026
# (prisma.roleProfile undefined ×558, PrismaClientValidationError en 5 rutas,
# chunks stale) fue re-levantar un contenedor VIEJO contra una base cuyo schema
# ya se había adelantado desde dev. Acá no hay juicio humano: se rebuildéa
# siempre, y el smoke final verifica que lo que CORRE es lo que se bajó.
#
# Si algo falla, el contenedor anterior queda intacto o el script imprime el
# rollback exacto. Nunca deja el sistema peor de lo que estaba.
###############################################################################
set -Eeuo pipefail

APP_DIR="/opt/smartflow/Nexus"
HEALTH_URL="http://localhost:3004/api/health"

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }

cd "$APP_DIR"

# ── 0) Pre-flight: el checkout del VPS debe estar limpio ─────────────────────
if [ -n "$(git status --porcelain)" ]; then
  red "ABORT: hay cambios locales en $APP_DIR. El VPS debe estar limpio (git status)."
  exit 1
fi
PREV_SHA="$(git rev-parse --short HEAD)"

# ── 1) Código nuevo. ff-only: si main divergió, algo anda MAL → frenar ───────
git fetch origin main
git merge --ff-only origin/main
SHA="$(git rev-parse --short HEAD)"
echo "Deploy: ${PREV_SHA} -> ${SHA}"

# ── 2) Snapshot de la imagen actual para rollback instantáneo ────────────────
docker tag nexus:latest nexus:prev 2>/dev/null || true

# ── 3) Build SIEMPRE. Si falla, el contenedor viejo sigue corriendo intacto ──
export GIT_SHA="$SHA"
if ! docker compose build app; then
  red "BUILD FALLO. El contenedor viejo (${PREV_SHA}) sigue corriendo. Nada cambio."
  exit 1
fi

# ── 4) Swap + esperar healthy (healthcheck del compose = /api/health) ────────
if ! docker compose up -d --wait --wait-timeout 120 app; then
  red "El contenedor nuevo NO llego a healthy en 120s. Ultimos logs:"
  docker logs nexus --tail 80 || true
  red "ROLLBACK: docker tag nexus:prev nexus:latest && docker compose up -d --no-build app"
  exit 1
fi

# ── 5) Smoke: lo que CORRE es el commit que acabamos de bajar ────────────────
sleep 2
if ! BODY="$(curl -fsS --max-time 10 "$HEALTH_URL")"; then
  red "SMOKE FALLO: $HEALTH_URL no responde."
  red "ROLLBACK: docker tag nexus:prev nexus:latest && docker compose up -d --no-build app"
  exit 1
fi
RUNNING_SHA="$(echo "$BODY" | grep -o '"sha":"[^"]*"' | cut -d'"' -f4)"
OK="$(echo "$BODY" | grep -o '"ok":[a-z]*' | cut -d: -f2)"

if [ "$OK" != "true" ] || [ "$RUNNING_SHA" != "$SHA" ]; then
  red "SMOKE FALLO: ok=${OK} sha_corriendo=${RUNNING_SHA} esperado=${SHA}"
  echo "$BODY"
  if [ "$RUNNING_SHA" != "$SHA" ]; then
    red "SHA distinto = el contenedor sirve una imagen VIEJA (deploy mixto)."
  fi
  red "ROLLBACK: docker tag nexus:prev nexus:latest && docker compose up -d --no-build app"
  exit 1
fi

green "DEPLOY OK — ${SHA} corriendo y healthy."
echo "$BODY"
docker image prune -f >/dev/null || true
