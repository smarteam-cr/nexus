---
name: wizard
description: Arma un wizard en bash que lleva a Elías paso a paso por lo que solo él puede hacer. Úsala para un despliegue con SQL y scripts en orden, un script con --apply, credenciales nuevas en el .env, o un panel de un tercero (HubSpot, Google, Odoo, Mercury). No para pasos que el agente puede hacer solo.
---

# Wizard

Un **wizard** es un script de bash que lleva a Elías, paso a paso, por un procedimiento manual que es tedioso de hacer a mano y de volver a explicarle a una IA cada vez. Abre cada URL, dice exactamente qué hacer, corre los comandos, guarda los valores donde van, pide confirmación antes de escribir en producción y muestra cuántas etapas faltan. En Nexus el caso típico es un despliegue: SQL antes del código, `npm run check:esquema`, el deploy en el VPS, después scripts en simulacro y con `--apply`, en ese orden.

La experiencia ya está resuelta en [`plantilla.sh`](plantilla.sh): avance por etapas, compuertas de confirmación, abrir URLs en Windows, entrada oculta para secretos, `.env` sin duplicados, comandos que cortan al fallar y un resumen al final. **Tu trabajo es solo delimitar el procedimiento y escribir sus etapas.** La librería de arriba de la marca `ETAPAS` es la misma en todos los wizards: no se edita a mano.

Un wizard es de una sola vez por defecto: va a `scripts/wizards/<nombre>.sh` y se borra cuando terminó el trabajo. Se commitea solo si Elías quiere un procedimiento repetible.

## Proceso

### 1. Delimita el procedimiento

Lista cada paso manual y cada valor que se captura en el camino. Lee el repo antes de preguntar:

- Para un despliegue: `npm run check:esquema` (qué SQL falta y qué archivo lo crea), los `.sql` de `scripts/sql/`, `docs/RUNBOOK.md` (orden de deploy, migraciones y seeds) y la sección «Para desplegar» del plan que corresponda en `docs/`.
- Para credenciales: `.env.example` (toda variable que el código lee está ahí), `lib/jobs/requisitos.ts` (qué variable prende cada job) y el RUNBOOK.
- Para una migración de datos: el estado actual, el que se busca y los pasos irreversibles entre los dos.

Muéstrale a Elías la lista de etapas en orden y los valores que produce cada una, y confirma: puede sumar, sacar o reordenar.

**Terminado cuando** cada etapa tiene nombre y orden, y de cada valor capturado sabes (a) de dónde lo saca Elías, (b) dónde se escribe (el `.env` local, el `.env` del VPS, o ninguno: hay etapas que son solo acciones) y (c) si es secreto (entrada oculta) o no.

### 2. Traza el camino de cada etapa

Escribe el recorrido exacto: qué URL abrir, qué hacer ahí, dónde aparece el valor y a qué variable va («HubSpot → Configuración → Integraciones → Apps privadas → copiar el token»). Si no conoces la pantalla actual o el comando exacto, dilo y pregunta o mira la documentación: nunca inventes pasos que quizás no existen.

**Terminado cuando** cada etapa se traduce en instrucciones que alguien que nunca lo hizo podría seguir.

### 3. Escribe el wizard

Copia `plantilla.sh` a `scripts/wizards/<nombre>.sh`. Reemplaza el ejemplo con una `etapa` por paso, en orden de dependencias, con los helpers de la librería: `etapa`, `decir`/`paso`/`nota`/`aviso`, `abrir_url`, `preguntar`/`preguntar_secreto`, `escribir_env`, `correr`, `correr_en_prod`, `pausa`/`confirmar`. Fija `TOTAL_ETAPAS` en la cantidad de etapas.

La vara de la plantilla, más lo propio de Nexus:

- Abre la URL antes de pedir su valor, y `preguntar_secreto` para todo lo secreto.
- **Todo lo que escribe en producción va con `correr_en_prod`**, que pide confirmación y le pone `ALLOW_PROD_WRITE=1` solo a ese comando. El `.env` local apunta a producción, así que «local» no quiere decir inofensivo.
- **Simulacro primero**: cada script con `--apply` lleva antes su corrida en seco con `correr`, y una `pausa` para leer la salida.
- **El SQL va antes del deploy** que trae el código que lo usa, y después `npm run check:esquema` tiene que dar verde.
- El deploy corre en el VPS (`cd /opt/smartflow/Nexus && bash scripts/deploy.sh`): el wizard lo dice con `paso` y espera con `confirmar`. Si el deploy trae un cambio en `deploy.sh`, antes va `git pull --ff-only` a mano en el VPS.
- `escribir_env` solo para valores del `.env` local. Lo del `.env` del VPS se edita allá: el wizard dice qué línea poner. Toda variable nueva que lea el código va también a `.env.example`, con el valor vacío: agrégala tú al escribir el wizard, no desde el wizard.
- Cada `etapa` limpia la pantalla y deja a la vista solo el paso actual: una etapa, una tarea.

### 4. Verifica y entrega

- `bash -n scripts/wizards/<nombre>.sh`, y `shellcheck` si está instalado.
- No lo corras de punta a punta: abre el navegador, espera a Elías y escribe en producción. Recórrelo leyendo: cada valor del paso 1 se captura y termina donde dijo el paso 1, cada escritura en producción pasa por `correr_en_prod`, y cada `--apply` tiene su simulacro antes.
- Dile a Elías cómo correrlo, desde la raíz del repo en Git Bash: `bash scripts/wizards/<nombre>.sh`. Desde PowerShell, `bash` puede abrir el de WSL: ahí es `& "C:\Program Files\Git\bin\bash.exe" scripts/wizards/<nombre>.sh`.
