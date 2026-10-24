#!/usr/bin/env bash
#
# Un wizard te lleva paso a paso por un procedimiento que haces a mano.
# Lo genera la skill /wizard (.claude/skills/wizard).
#
# Todo lo que está arriba de la marca "ETAPAS" es la librería del wizard: no se
# edita a mano. Las etapas de cada procedimiento van debajo de la marca.
#
# Se corre desde la raíz del repo, en Git Bash:  bash scripts/wizards/<nombre>.sh

set -euo pipefail

# ──────────────────────────────────────────────────────────────────────────
# Librería del wizard: la misma en todos, para que se usen igual.
# ──────────────────────────────────────────────────────────────────────────

if [[ -t 1 ]] && command -v tput >/dev/null 2>&1 && [[ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]]; then
  BOLD=$(tput bold); DIM=$(tput dim); RESET=$(tput sgr0)
  BLUE=$(tput setaf 4); GREEN=$(tput setaf 2); YELLOW=$(tput setaf 3)
else
  BOLD=""; DIM=""; RESET=""; BLUE=""; GREEN=""; YELLOW=""
fi

# Quien escribe el wizard lo fija al principio de las etapas.
TOTAL_ETAPAS=0

_ETAPA=0
ENV_FILE="${ENV_FILE:-.env}"
ESCRITO_ENV=()   # claves escritas en ENV_FILE en esta corrida
EN_PROD=()       # comandos que escribieron en producción en esta corrida
SALTEADO=()      # lo que no se hizo y queda para hacer a mano

# _limpiar borra la terminal para que solo se vea el paso actual. No hace nada
# si la salida no es una terminal, así un log redirigido se sigue leyendo.
_limpiar() {
  [[ -t 1 ]] || return 0
  if command -v tput >/dev/null 2>&1 && tput clear 2>/dev/null; then return 0; fi
  printf '\033[2J\033[3J\033[H'
}

# portada "Título" muestra qué hace este wizard.
portada() {
  _limpiar
  printf '\n%s%s  %s%s\n' "$BOLD" "$BLUE" "$1" "$RESET"
  printf '%s  %s etapas%s\n\n' "$DIM" "$TOTAL_ETAPAS" "$RESET"
  printf '%s  Tú haces lo que pide cada paso; el wizard te dice exactamente qué hacer,\n' "$DIM"
  printf '  corre los comandos y guarda los valores que pegues. Puedes cortar con\n'
  printf '  Ctrl-C y volver a correrlo: recuerda lo que ya guardaste.%s\n' "$RESET"
  pausa "¿Empezamos? (Enter)"
}

# etapa "Nombre" limpia la pantalla, anuncia la etapa y muestra el avance.
etapa() {
  _limpiar
  _ETAPA=$((_ETAPA + 1))
  printf '\n%s%s▸ Etapa %s/%s · %s%s\n' \
    "$BOLD" "$BLUE" "$_ETAPA" "$TOTAL_ETAPAS" "$1" "$RESET"
}

# decir "..." es una línea de instrucción.
decir() { printf '  %s\n' "$1"; }
# paso "..." es una acción que haces tú (en el navegador, en el VPS…).
paso()  { printf '  %s•%s %s\n' "$BLUE" "$RESET" "$1"; }
nota()  { printf '  %s%s%s\n' "$DIM" "$1" "$RESET"; }
aviso() { printf '  %s⚠ %s%s\n' "$YELLOW" "$1" "$RESET"; }

# abrir_url URL la abre en tu navegador (Windows, WSL, Linux o Mac).
abrir_url() {
  local url="$1"
  printf '  %s↗ abriendo%s %s\n' "$GREEN" "$RESET" "$url"
  { if   command -v wslview      >/dev/null 2>&1; then wslview "$url"
    elif command -v explorer.exe >/dev/null 2>&1; then explorer.exe "$url"
    elif command -v start        >/dev/null 2>&1; then start "" "$url"
    elif command -v xdg-open     >/dev/null 2>&1; then xdg-open "$url"
    elif command -v open         >/dev/null 2>&1; then open "$url"
    else false; fi
  } >/dev/null 2>&1 || aviso "no pude abrir el navegador; entra a mano: $url"
}

# pausa "mensaje" espera a que confirmes que hiciste la parte manual.
pausa() {
  printf '  %s%s%s ' "$DIM" "${1:-Enter para seguir}" "$RESET"
  read -r _ || true
}

# confirmar "pregunta" es una compuerta s/N; devuelve éxito con sí.
confirmar() {
  local respuesta=""
  printf '  %s? %s [s/N]%s ' "$YELLOW" "$1" "$RESET"
  read -r respuesta || true
  [[ "$respuesta" =~ ^[SsYy] ]]
}

# _actual CLAVE: el valor de CLAVE en ENV_FILE, si lo hay, sin las comillas
# simples de escribir_env ni las dobles de un valor dotenv común.
_actual() {
  [[ -f "$ENV_FILE" ]] || return 1
  local linea valor sq="'\\''"; linea=$(grep -E "^${1}=" "$ENV_FILE" | tail -n1) || return 1
  valor="${linea#*=}"
  if [[ "$valor" == \'*\' ]]; then valor="${valor:1:${#valor}-2}"; valor="${valor//"$sq"/\'}"
  elif [[ "$valor" == \"*\" ]]; then
    valor="${valor:1:${#valor}-2}"
    [[ "$valor" == *[\\\$\"]* ]] && return 1   # escapes, $ o ": no se decodifica seguro; se vuelve a pedir
  fi
  printf '%s' "$valor"
}

# preguntar CLAVE "Pregunta" lee un valor en $CLAVE. Si ENV_FILE ya lo tiene,
# lo ofrece como valor por defecto (Enter lo conserva). Se ve lo que escribes.
preguntar() {
  local clave="$1" pregunta="$2" actual entrada s=$'\001' e=$'\002' p rc=0
  actual=$(_actual "$clave" || true)
  # Readline necesita los colores envueltos en \001..\002 para ubicar el cursor.
  p="  $s$BOLD$e$pregunta$s$RESET$e "
  [[ -n "$actual" ]] && p+="$s$DIM$e[Enter conserva el actual]$s$RESET$e "
  read -e -r -p "$p" entrada || rc=1
  if (( rc )) && [[ -z "$entrada" ]]; then return 1; fi
  [[ -z "$entrada" && -n "$actual" ]] && entrada="$actual"
  printf -v "$clave" '%s' "$entrada"
}

# preguntar_secreto CLAVE "Pregunta" es como preguntar, pero no se ve lo que escribes.
preguntar_secreto() {
  local clave="$1" pregunta="$2" actual entrada rc=0
  actual=$(_actual "$clave" || true)
  if [[ -n "$actual" ]]; then
    printf '  %s%s%s %s[Enter conserva el actual]%s ' "$BOLD" "$pregunta" "$RESET" "$DIM" "$RESET"
  else
    printf '  %s%s%s ' "$BOLD" "$pregunta" "$RESET"
  fi
  read -rs entrada || rc=1
  printf '\n'
  if (( rc )) && [[ -z "$entrada" ]]; then return 1; fi
  [[ -z "$entrada" && -n "$actual" ]] && entrada="$actual"
  printf -v "$clave" '%s' "$entrada"
}

# escribir_env CLAVE VALOR deja CLAVE='VALOR' en ENV_FILE (reemplaza la línea
# que hubiera) y fija $CLAVE. Correrlo dos veces no duplica nada. Crea ENV_FILE
# con permisos 0600; respeta los permisos de un archivo que ya existe.
# ⛔ Nunca ALLOW_PROD_WRITE: fija en el .env, el guard aborta todo script de escritura.
escribir_env() {
  local clave="$1" valor="$2" tmp sq="'\\''"
  if [[ "$clave" == "ALLOW_PROD_WRITE" ]]; then
    aviso "ALLOW_PROD_WRITE no va en el .env: se pone por comando (correr_en_prod)."
    exit 1
  fi
  [[ -e "$ENV_FILE" ]] || (umask 077 && : > "$ENV_FILE")
  tmp=$(mktemp)
  grep -vE "^${clave}=" "$ENV_FILE" > "$tmp" || true
  printf "%s='%s'\n" "$clave" "${valor//\'/$sq}" >> "$tmp"
  cat "$tmp" > "$ENV_FILE"
  rm -f "$tmp"
  printf -v "$clave" '%s' "$valor"
  ESCRITO_ENV+=("$clave")
  printf '  %s✓ guardado%s %s → %s\n' "$GREEN" "$RESET" "$clave" "$ENV_FILE"
}

# correr "comando" muestra el comando y lo corre. Si falla, el wizard se detiene
# ahí: se arregla y se vuelve a correr.
correr() {
  local comando="$1"
  printf '  %s$ %s%s\n' "$DIM" "$comando" "$RESET"
  if ! bash -c "$comando"; then
    aviso "falló: $comando"
    aviso "El wizard se detiene acá. Arréglalo y vuelve a correrlo."
    exit 1
  fi
}

# correr_en_prod "comando" ESCRIBE en producción: pide confirmación y le pone
# ALLOW_PROD_WRITE=1 solo a ese comando. Si dices que no, queda en el resumen.
correr_en_prod() {
  local comando="$1"
  aviso "Esto ESCRIBE en producción:"
  nota "  $comando"
  if confirmar "¿Lo corro?"; then
    if ! ( export ALLOW_PROD_WRITE=1; correr "$comando" ); then exit 1; fi
    EN_PROD+=("$comando")
  else
    SALTEADO+=("$comando")
    nota "No se corrió."
  fi
}

# terminar limpia la pantalla y muestra el resumen de lo que se hizo.
terminar() {
  _limpiar
  printf '\n%s%s  ✓ Listo%s\n' "$BOLD" "$GREEN" "$RESET"
  (( ${#ESCRITO_ENV[@]} )) && nota "Guardado en $ENV_FILE: ${ESCRITO_ENV[*]}"
  if (( ${#EN_PROD[@]} )); then
    nota "Escrito en producción:"
    for c in "${EN_PROD[@]}"; do nota "  - $c"; done
  fi
  if (( ${#SALTEADO[@]} )); then
    printf '\n'; aviso "Queda para hacer a mano:"
    for s in "${SALTEADO[@]}"; do nota "  - $s"; done
  fi
  printf '\n'
}

# ──────────────────────────────────────────────────────────────────────────
# ETAPAS: esta parte se escribe. Una etapa() por cada paso.
# Reemplaza el ejemplo y fija TOTAL_ETAPAS en la cantidad de etapas.
# Todas las etapas van dentro de correr_wizard y la última línea queda como
# está: así bash lee el archivo entero antes de la primera pregunta, y editarlo
# a mitad de una corrida no la rompe.
# ──────────────────────────────────────────────────────────────────────────


correr_wizard() {

TOTAL_ETAPAS=8
PROYECTO="nexus-493705"
CLIENTE_DWD="116193133255615342954"
CUENTA_SERVICIO="nexus-dwd@nexus-493705.iam.gserviceaccount.com"

portada "Permisos para el contexto inicial: Google y HubSpot"

etapa "Google Cloud: encender las APIs"
decir "En el proyecto de Nexus (${PROYECTO}) hay que habilitar tres APIs. Se abre una por una:"
decir "en cada página, botón «Habilitar» (si dice «Administrar», ya estaba)."
abrir_url "https://console.cloud.google.com/apis/library/meet.googleapis.com?project=${PROYECTO}"
pausa "Google Meet REST API habilitada (Enter)"
abrir_url "https://console.cloud.google.com/apis/library/workspaceevents.googleapis.com?project=${PROYECTO}"
pausa "Google Workspace Events API habilitada (Enter)"
abrir_url "https://console.cloud.google.com/apis/library/pubsub.googleapis.com?project=${PROYECTO}"
pausa "Cloud Pub/Sub API habilitada (Enter)"
nota "Speech-to-Text (para las reuniones presenciales) queda para cuando elijamos el servicio."

etapa "Google Admin: el permiso nuevo en la delegación de dominio"
decir "La cuenta de servicio de Nexus lee con permisos que tú le diste. Hay que SUMAR uno."
abrir_url "https://admin.google.com/ac/owl/domainwidedelegation"
paso "Busca el cliente con ID ${CLIENTE_DWD} (nexus-dwd) y toca «Editar»."
paso "AGREGA al final de la lista, separado por coma, este permiso (no borres los que ya están):"
nota "    https://www.googleapis.com/auth/meetings.space.readonly"
aviso "Si borras uno de los de antes, Nexus deja de leer Meet, Drive o Calendar. Solo se suma."
nota "La lista completa debería quedar con estos (en cualquier orden):"
nota "    https://www.googleapis.com/auth/drive.readonly"
nota "    https://www.googleapis.com/auth/documents.readonly"
nota "    https://www.googleapis.com/auth/calendar.readonly"
nota "    https://www.googleapis.com/auth/admin.directory.user.readonly"
nota "    https://www.googleapis.com/auth/calendar.events.owned"
nota "    https://www.googleapis.com/auth/meetings.space.readonly"
paso "Toca «Autorizar»."
if ! confirmar "¿Quedó guardado con el permiso nuevo?"; then
  SALTEADO+=("delegación de dominio: sumar meetings.space.readonly al cliente ${CLIENTE_DWD}")
fi

etapa "Pub/Sub: el canal por donde Google avisa de cada reunión"
decir "Es el buzón donde Google deja «terminó una reunión» o «la transcripción está lista»."
abrir_url "https://console.cloud.google.com/cloudpubsub/topic/list?project=${PROYECTO}"
paso "«Crear tema». ID del tema:  nexus-meet-eventos   (deja marcada la suscripción predeterminada: NO)."
paso "Abre el tema creado → pestaña «Permisos» (o el panel de la derecha) → «Agregar principal»:"
nota "    principal:  meet-api-event-push@system.gserviceaccount.com"
nota "    rol:        Publicador de Pub/Sub  (Pub/Sub Publisher)"
paso "Guarda."
pausa "Tema creado y con el publicador de Meet (Enter)"
abrir_url "https://console.cloud.google.com/cloudpubsub/subscription/list?project=${PROYECTO}"
paso "«Crear suscripción». ID:  nexus-meet-eventos-pull   ·   tema: nexus-meet-eventos   ·   tipo: Pull."
paso "Deja lo demás como viene y crea."
paso "Abre la suscripción → «Permisos» → «Agregar principal»:"
nota "    principal:  ${CUENTA_SERVICIO}"
nota "    rol:        Suscriptor de Pub/Sub  (Pub/Sub Subscriber)"
if ! confirmar "¿Quedaron el tema, la suscripción y los dos permisos?"; then
  SALTEADO+=("Pub/Sub: tema nexus-meet-eventos, suscripción pull nexus-meet-eventos-pull y sus dos permisos")
fi

etapa "Google Admin: que las reuniones dejen texto"
decir "Esto es lo que más rinde: en 90 días, 239 reuniones con clientes solo dejaron notas"
decir "porque nadie activó «Transcribir», y 177 no se grabaron."
abrir_url "https://admin.google.com/ac/appslist/core"
paso "Entra a «Google Meet» → «Configuración de video de Meet» (o «Grabación y transcripción»)."
paso "Que estén permitidas las transcripciones y la toma de notas con Gemini para todo el equipo."
paso "Si ves una opción para que la transcripción o las notas se activen solas al empezar la reunión, actívala."
nota "Los nombres de las opciones cambian seguido: si no las encuentras, dime qué ves y lo buscamos."
if ! confirmar "¿Quedaron permitidas (y automáticas, si estaba la opción)?"; then
  SALTEADO+=("Google Admin › Meet: permitir transcripción y notas con Gemini, y que se activen solas")
fi

etapa "HubSpot: declarar los permisos nuevos en la app de Nexus"
decir "La app pública de Nexus (id 36930623) tiene que declarar estos permisos como «Opcional»"
decir "antes de que Nexus los pida; si no, HubSpot rechaza la conexión."
abrir_url "https://developers.hubspot.com/"
paso "Entra a tu cuenta de desarrollador → Apps → la app de Nexus → «Auth» → «Scopes»."
paso "Agrega como OPCIONALES (si alguno no aparece con ese nombre exacto, búscalo por la palabra y dime cómo sale):"
nota "    sales-email-read                          (los correos con la empresa)"
nota "    crm.objects.leads.read                    (los leads)"
nota "    crm.extensions_calling_transcripts.read   (las transcripciones de llamadas y reuniones)"
paso "Guarda los cambios de la app."
if ! confirmar "¿Quedaron los tres declarados como opcionales?"; then
  SALTEADO+=("HubSpot: declarar sales-email-read, crm.objects.leads.read y crm.extensions_calling_transcripts.read como opcionales")
fi

etapa "Nexus: pedir los permisos nuevos"
decir "Nexus pide los opcionales extra desde la variable HUBSPOT_SCOPES_OPCIONALES_EXTRA."
escribir_env HUBSPOT_SCOPES_OPCIONALES_EXTRA "crm.objects.goals.read sales-email-read crm.objects.leads.read crm.extensions_calling_transcripts.read"
paso "En el VPS, edita /opt/smartflow/Nexus/.env y deja esta línea (reemplaza la que haya):"
nota "    HUBSPOT_SCOPES_OPCIONALES_EXTRA='crm.objects.goals.read sales-email-read crm.objects.leads.read crm.extensions_calling_transcripts.read'"
paso "Después, en el VPS:  cd /opt/smartflow/Nexus && bash scripts/deploy.sh"
paso "Espera el «DEPLOY OK»."
if ! confirmar "¿Línea puesta en el VPS y DEPLOY OK?"; then
  SALTEADO+=("VPS: HUBSPOT_SCOPES_OPCIONALES_EXTRA en el .env y deploy")
fi

etapa "Reconectar HubSpot en producción"
decir "Con la línea nueva, reconectar le pide a HubSpot los permisos nuevos."
abrir_url "https://nexus.smarteamcr.com/integrations"
paso "En la tarjeta de HubSpot, «Reconectar» (la conexión del sistema)."
paso "En HubSpot, acepta los permisos (deberían aparecer los correos, los leads y las transcripciones)."
if ! confirmar "¿Reconectado y aceptado?"; then
  SALTEADO+=("Nexus › Integraciones › HubSpot › Reconectar")
fi

etapa "Avisarme"
decir "Listo de tu lado. Dime «permisos listos» en el chat y yo compruebo, solo leyendo:"
paso "que la cuenta de servicio ya puede leer una reunión con la API de Meet (la prueba de un día, U2);"
paso "que el token de HubSpot trae los permisos nuevos y que ya se leen correos."
pausa "Enter para ver el resumen"

terminar
}

correr_wizard "$@"; exit
