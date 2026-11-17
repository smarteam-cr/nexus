#!/usr/bin/env bash
# scripts/acceso-remoto.sh — LO ÚNICO que puede hacer en el VPS la llave SSH del agente (2026-11-17).
#
# La llave entra en ~/.ssh/authorized_keys con `command="/usr/local/bin/nexus-remoto",no-pty,...`: sshd ignora el
# comando que pide el cliente y corre ESTE script, con lo pedido en $SSH_ORIGINAL_COMMAND. Nada se evalúa con la
# shell: se parte en palabras y se compara contra la lista de abajo. Sin consola, sin túneles, sin otra cosa.
#
# Se instala COPIÁNDOLO fuera del repo (no enlazándolo): así un push no puede ampliar en silencio lo que la llave
# hace. Para cambiarlo, se vuelve a copiar a mano:
#   sudo install -m 755 /opt/smartflow/Nexus/scripts/acceso-remoto.sh /usr/local/bin/nexus-remoto
#
# Uso desde la PC:  ssh nexus-vps deploy | pull-y-deploy | estado | logs [N] [texto] | rollback

set -uo pipefail

APP_DIR="/opt/smartflow/Nexus"
HEALTH_URL="http://localhost:3004/api/health"

read -r -a ARGS <<< "${SSH_ORIGINAL_COMMAND:-}"
CMD="${ARGS[0]:-ayuda}"

salud() {
  curl -fsS --max-time 10 "$HEALTH_URL" 2>/dev/null || echo "(sin respuesta de /api/health)"
  echo
}

case "$CMD" in
  deploy)
    cd "$APP_DIR" && exec bash scripts/deploy.sh
    ;;
  pull-y-deploy)
    # Cuando el deploy trae un cambio en deploy.sh, que se reescribe a sí mismo (RUNBOOK › Deploy).
    cd "$APP_DIR" && git pull --ff-only && exec bash scripts/deploy.sh
    ;;
  estado)
    docker ps --filter name=nexus --format '{{.Names}}  {{.Status}}  {{.Image}}'
    cd "$APP_DIR" && git log --oneline -1
    docker image inspect nexus:prev --format 'nexus:prev creada {{.Created}}' 2>/dev/null || echo "sin nexus:prev"
    salud
    ;;
  logs)
    N="${ARGS[1]:-200}"
    if ! [[ "$N" =~ ^[0-9]+$ ]] || (( N > 5000 )); then
      echo "Uso: logs [N hasta 5000] [texto a buscar]"
      exit 2
    fi
    if [ -n "${ARGS[2]:-}" ]; then
      docker logs --timestamps --tail "$N" nexus 2>&1 | grep -F -i -- "${ARGS[*]:2}"
    else
      docker logs --timestamps --tail "$N" nexus 2>&1
    fi
    ;;
  rollback)
    # Lo mismo que hace deploy.sh cuando falla: vuelve a la imagen anterior. Un solo paso atrás (cada deploy pisa
    # nexus:prev). El checkout queda adelante: el próximo deploy vuelve a subir lo que se revirtió.
    if ! docker image inspect nexus:prev >/dev/null 2>&1; then
      echo "No hay imagen nexus:prev: no hay a qué volver."
      exit 1
    fi
    docker tag nexus:prev nexus:latest
    cd "$APP_DIR" && docker compose up -d --no-build app || exit 1
    FIN=$((SECONDS + 120))
    while [ "$SECONDS" -lt "$FIN" ]; do
      if curl -fsS --max-time 10 "$HEALTH_URL" 2>/dev/null | grep -q '"ok":true'; then
        echo "ROLLBACK OK"
        salud
        exit 0
      fi
      sleep 5
    done
    echo "ROLLBACK: /api/health no respondió ok en 120 s. Mira: logs 300"
    exit 1
    ;;
  *)
    echo "Comandos: deploy | pull-y-deploy | estado | logs [N] [texto] | rollback"
    exit 2
    ;;
esac
