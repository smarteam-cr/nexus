# RUNBOOK — Nexus en producción

Operación del deploy real (VPS + Docker Compose) y las **invariantes** que el
código asume. Si alguna de estas condiciones cambia (segunda réplica, otro
orquestador, DB separada), revisá la sección correspondiente ANTES de migrar.

## Invariante #1 — INSTANCIA ÚNICA

La app corre como **un (1) contenedor** (`docker compose up -d`, servicio `app`).
Varios mecanismos usan estado **en memoria del proceso** y son correctos SOLO
bajo esa condición:

| Mecanismo | Dónde | Qué pasa con 2+ réplicas |
|---|---|---|
| Semáforo de export PDF (máx 2 Chromium + cola de 4) | `lib/print/pdf-runner.ts (cap ÚNICO para todos los tipos del registro de impresión)` | El cap sería POR réplica (2×N Chromiums) |
| Guard `running` del auto-sync de Google, y corrida única de la sync de Meet (el botón «Sincronizar» recibe la que está en vuelo) | `lib/google/auto-sync.ts`, `lib/google/meet-sync.ts` | El auto-sync queda cubierto por el turno en DB (CronJobState); el botón manual de otra réplica podría correr en paralelo |
| Locks en-proceso de watchdog / signals / partner refresh, y el candado por cliente del vigía (al entrar y a mano) | `lib/cs/*`, `lib/cs/vigia-por-cliente.ts` | Dos réplicas podrían correr el mismo sweep en paralelo. El vigía por cliente además mira la corrida RUNNING en la base: entre réplicas solo queda la ventana de segundos entre leer y crear la corrida |
| Guard 409 anti-doble-generación de BC (AgentRun RUNNING ≤5min) | `generate/route.ts` | Sigue funcionando (es contra DB) |

**Persistido en DB (sobrevive deploys, ya NO es in-memory):** el turno del
auto-sync de Google (`CronJobState`, key `google-auto-sync`: `lastRunAt` = «no correr antes de»,
`lastResult` = cómo terminó la última y cuántos fallos seguidos lleva, más la marca `noAntesDe`
= `lastRunAt` que dice que la fila la escribió el código nuevo; ⚠ sin esa marca, `lastRunAt` es el
ARRANQUE de una corrida del código anterior al 2026-09-21 —la imagen previa, un `dev:prod` sin
pull— y se respetan sus 20 min; el turno se toma comparando con lo leído) y el rate-limit de
verify-access externo (`ExternalVerifyAttempt`, helper
`lib/external/verify-rate-limit.ts`).

Si algún día hay más de una réplica: mover el semáforo de PDF y los locks de CS
a claims en DB (mismo patrón `CronJobState`/`claimDateKey` que ya usan los jobs).

## Invariante #2 — DB COMPARTIDA ENTRE 2 PCs (dual-PC)

La misma Supabase Postgres la usan las dos máquinas de desarrollo Y producción.
**El guard del CLI lo hace cumplir desde el 2026-09-04 (B-01):** `prisma db push`,
`migrate reset` y `migrate dev` contra un host Supabase abortan SIEMPRE, sin variable que
los destrabe — es un candado, no un semáforo. `db execute` (SQL aditivo) sigue exigiendo
`ALLOW_PROD_WRITE=1` POR COMANDO; si la variable queda FIJA en el `.env`, todo script de
escritura aborta hasta sacarla.
**`prisma db push` está PROHIBIDO en cualquier forma** (ver "Lo que deploy.sh NO
hace" más abajo — ya se llevó `RoleProfile` una vez; hasta el 2026-08-01 esta
sección regulaba cómo usarlo "bien" y contradecía la prohibición del mismo
archivo). Reglas duras vigentes:

1. **Schema SOLO aditivo** — nunca drop/rename/reorder de columnas o valores de
   enum existentes. El DDL va por `.sql` a mano en `scripts/sql/` (flujo completo:
   ARCHITECTURE Parte 0 · cap. D), gateado por `ALLOW_PROD_WRITE=1`.
2. **`git pull` SIEMPRE antes de aplicar DDL** (así el schema local incluye lo de
   la otra PC) y `prisma migrate diff --from-config-datasource --to-schema
   prisma/schema.prisma --script` como detector de drift ajeno ANTES de aplicar.
3. Avisar a la otra PC tras aplicar un `.sql` + pushear el schema.
4. Para flags/overrides nuevos, preferir un campo Json YA existente antes que
   una columna nueva sin coordinar (ej.: los briefs viven en
   `ProjectCanvas.sections`).
5. **DDL JAMÁS contra el puerto `:6543`** (transaction pooling): DDL a través del
   pooler en transaction mode produce bugs sutiles. Siempre contra el host
   directo `:5432` — que es lo que las PCs de dev ya usan.

## Invariante #3 — PRESUPUESTO DE CONEXIONES (pooler compartido)

El pooler de Supabase da ~15 slots que COMPARTEN producción + las 2 PCs de dev +
cualquier script corriendo. Post-mortem jul-2026: `EMAXCONNSESSION` (147 eventos)
por aritmética — prod (max 10) + 2 devs (max 10 c/u) + scripts sin tope.

- El pool de la app (`lib/db/prisma.ts`): **prod 10 · dev 4** (override
  `DB_POOL_MAX`). `/api/health` expone `pool: {total,idle,waiting}`.
- **Scripts**: usar `scripts/lib/db.ts` (`createScriptDb`/`createScriptPool`,
  `max: 2`) — nunca `new Pool()` pelado (default 10). `check-invariants` (INV6)
  lo bloquea en runtime (lib/, app/) y lo advierte en scripts/ legacy.

## Deploy

```bash
cd /opt/smartflow/Nexus && bash scripts/deploy.sh
```

UNA línea, sin decisiones. El script hace: pull ff-only → **rebuild SIEMPRE** →
swap esperando healthy (healthcheck del compose = `/api/health`) → smoke
(`ok:true` **y** el SHA corriendo == HEAD del checkout). Si algo falla, el
contenedor viejo queda intacto (build fallido) o el script **EJECUTA el rollback**: vuelve a
la imagen anterior (`nexus:prev`), re-verifica `/api/health` y dice si quedó healthy (B-04,
2026-09-04). Antes solo imprimía el comando para que alguien lo copiara. Desde el
2026-09-30 eso incluye el **esquema atrasado**: código que usa una columna cuyo SQL no se
corrió ya no queda arriba (ver «Esquema atrasado», abajo).

⚠️ **`deploy.sh` se reescribe a sí mismo** (`git merge --ff-only` en su paso 1): el deploy
que trae un cambio en `deploy.sh` corre con la versión VIEJA del script. Para ese deploy,
primero `git pull --ff-only` a mano y después `bash scripts/deploy.sh`.

⚠️ **NUNCA `docker compose up -d` a mano sin `--build` después de un pull.**
Eso re-levanta la imagen VIEJA contra la base con schema nuevo = el "deploy
mixto" que generó la ola de errores de julio 2026 (`prisma.roleProfile`
undefined ×558, `PrismaClientValidationError` en 5 rutas, chunks stale). El
detector es `/api/health`: expone el `sha` horneado en la imagen + un canario
del cliente Prisma (`roleProfile.count()`).

- `.env` de esa carpeta = runtime (DATABASE_URL, keys, `CRON_ENABLED=1`,
  `CS_WATCHDOG_ENABLED=1`, `SENTRY_DSN`). **`GIT_SHA` NO va acá** — lo exporta
  deploy.sh y se hornea en la imagen; si viniera del .env reflejaría el
  checkout y no la imagen corriendo.
- Las `NEXT_PUBLIC_*` se INLINEAN en build → viven como build-args en
  `docker-compose.yml` y también deben estar en ese `.env` (compose las
  interpola): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `NEXT_PUBLIC_SENTRY_DSN`.

### Lo que `deploy.sh` NO hace: migraciones y seeds

El script mueve **código**. La base y los prompts de los agentes NO se tocan solos, y son
dos pasos manuales distintos que se olvidan por separado.

- **Migraciones (SQL directo, nunca `prisma db push`).** Los `.sql` viven en
  `scripts/sql/AAAA-MM-DD-*.sql` y se corren **contra la base compartida, ANTES de deployar
  el código que los necesita** — si el código llega primero, la app queda pidiendo una
  columna que no existe. `db push` está prohibido: la base tiene objetos que el schema no
  declara y los dropea (ya se llevó `RoleProfile` una vez). Qué falta correr lo dice
  `npm run check:esquema` desde la PC, en un par de segundos y en solo lectura; si igual se
  escapa, el deploy se revierte solo (ver «Esquema atrasado»).
- **Seeds de agentes (`scripts/seed-*.ts`) se corren DESDE UNA PC DE DESARROLLO, no desde
  el VPS.** El checkout del servidor **no tiene `node_modules`** —la app vive en Docker—,
  así que ahí `npx tsx scripts/seed-*.ts` falla con `Cannot find module 'pg'`. Como la base
  es la misma, correrlos desde dev tiene exactamente el mismo efecto. (Pasó en el deploy
  del 2026-07-26: el deploy salió bien y los tres seeds fallaron ahí mismo.)
- **Un seed re-siembra el prompt COMPLETO.** Si alguien editó ese agente a mano desde
  `/agents`, el seed le pasa por encima. Antes de correr uno con `--force`, mirar si el
  prompt en la base fue tocado.
- **El orden importa cuando el prompt nuevo describe secciones nuevas**: primero el deploy
  del código (que trae las secciones), después el re-seed del prompt. Al revés, el agente
  escribe secciones que la versión corriendo todavía no sabe pintar.

Checklist corto para un deploy que trae los tres (el guard anti-prod exige
`ALLOW_PROD_WRITE=1` en los pasos 1 y 3 — sin la variable abortan; en PowerShell es
`$env:ALLOW_PROD_WRITE="1"`):

```bash
npm run check:esquema                                          # 0) desde dev: ¿qué SQL falta? (solo lectura)
```
```bash
ALLOW_PROD_WRITE=1 npx prisma db execute --file scripts/sql/AAAA-MM-DD-loquesea.sql  # 1) desde dev, ANTES
```
```bash
cd /opt/smartflow/Nexus && bash scripts/deploy.sh              # 2) en el VPS
```
```bash
ALLOW_PROD_WRITE=1 npx tsx scripts/seed-EL-AGENTE.ts           # 3) desde dev, después
```

(El `psql "$DATABASE_URL" -f` que estaba acá se retiró a propósito: era el único camino de
escritura que ningún guard podía interceptar. `db execute` pasa por `prisma.config.ts`, que
es donde vive el guard del CLI.)

### Esquema atrasado: el deploy se revierte solo (2026-09-30)

Hasta ese día, desplegar código cuyo SQL no se había corrido daba «DEPLOY OK»: `/api/health`
solo probaba `SELECT 1` y el canario, y las pantallas que leían la columna nueva reventaban
con P2022. Ahora la salud compara lo que espera el cliente Prisma de la imagen (tablas,
columnas y valores de enum) contra el catálogo de la base (`lib/db/salud-del-esquema.ts`) y,
si falta algo, responde 503 con `checks.esquema: "faltan N en la base: …"`.

Lo que se ve en el deploy: el contenedor nuevo no llega a healthy, `deploy.sh` imprime «El
contenedor nuevo NO llego a healthy en 120s», los últimos 80 logs —ahí está la lista entera,
en las líneas `[esquema]`— y vuelve a la imagen anterior (ROLLBACK OK). Qué hacer: correr
desde la PC los SQL que faltan (`npm run check:esquema` dice cuáles) y volver a desplegar.

⚠ Hay un camino en el que el motivo NO se imprime: si el primer chequeo no pudo leer el
catálogo («sin verificar», da 200), Docker da por sano el contenedor, y el atraso aparece recién
en el smoke. Ahí `deploy.sh` dice «SMOKE FALLO: … no responde» (el `curl -f` descarta el cuerpo
del 503) y la reversión recrea el contenedor, con lo que sus logs se pierden. Ante un SMOKE
FALLO sin otra explicación, `npm run check:esquema` desde la PC dice si fue el esquema.

- ⚠ Mientras Docker decide (entre 75 y 90 s: cuatro chequeos fallidos después del arranque),
  el contenedor nuevo YA atiende, con las pantallas que usan lo que falta en error. Por eso
  el chequeo va antes del deploy: la reversión es la red, no el paso.
- En verde no vuelve a consultar el catálogo en toda la vida del proceso. Con la base
  atrasada vuelve a mirar cada 30 s: si el SQL se corre con el contenedor arriba, la salud se
  pone en verde sola.
- Solo falla con prueba: si el catálogo no se pudo leer o tardó más de 3 s dice «sin
  verificar» y NO apaga la salud (un corte de red no revierte un deploy).
- No cuenta lo que la base tiene de más (`KnowledgeEmbedding.embedding`, los índices creados
  por SQL, las tablas de una tanda cuyo código todavía no salió), ni el tipo ni si una columna
  admite nulos.
- **Si alguna vez frena un deploy sin razón** (dice que falta algo que está): cargar
  `ESQUEMA_NO_BLOQUEA=1` en el `.env` del VPS y volver a desplegar; la salud lo sigue
  diciendo en `checks.esquema`, pero no bloquea. Sacarla en el deploy siguiente. La salida
  definitiva es revertir el commit que trajo el chequeo; no hay SQL ni datos que deshacer.

## Sentry (observabilidad)

Activación 100% por env — sin las vars, cero cambio de comportamiento:

- **`SENTRY_DSN`** (server): captura errores de rutas/RSC/server actions vía el
  hook `onRequestError` de `instrumentation.ts`.
- **`NEXT_PUBLIC_SENTRY_DSN`** (browser): normalmente el MISMO DSN; requiere
  **rebuild** (`--build`) porque se inlinea. Captura `reportClientError` (todos
  los `toast.error`) y el `global-error.tsx`.
- Solo errores (`tracesSampleRate: 0`) — sin performance ni replay.
- Smoke test post-activación: forzar un error (p.ej. URL de API inexistente
  desde la UI) y verificar que aparece en el proyecto de Sentry.

## Incidente de memoria o CPU (el contenedor se congela)

El 2026-09-21 el proceso se comió la CPU del VPS (docker stats: 821 %, 1,13 GiB) y quedó congelado:
horas de demoras de 15–25 s y después 502 en nginx. ⚠ El VPS tiene solo 4 núcleos y lo comparten ~15
apps; el 2026-09-22, con Nexus quieto, la carga promedio seguía en 85–93 por otras (mongodb-4,
smartflow-app, sicop). Desde entonces el contenedor tiene tope en `docker-compose.yml` (2 núcleos,
3 GB sin swap, heap de 2 GB):
si se vuelve a llenar, Node muere con «JavaScript heap out of memory» y Docker lo levanta solo
(`restart: unless-stopped`), en vez de quedar colgado. ⚠ Docker NO reinicia un contenedor
«unhealthy»: un proceso trabado sin llegar al tope sigue necesitando a una persona.

**1. Mirar antes de tocar.** Reiniciar borra la evidencia de memoria y de hilos.

```bash
curl -s localhost:3004/api/health        # memoriaMb y atrasoHiloMs, si todavía responde
docker stats --no-stream nexus
docker logs nexus --since 6h 2>&1 | grep '\[medidor\]' | tail -20     # desde cuándo se degrada
docker logs nexus --since 6h 2>&1 | grep -iE 'heap out of memory|mark-compact|allocation failed' | tail
docker inspect -f '{{.RestartCount}} reinicios · OOMKilled={{.State.OOMKilled}} · desde {{.State.StartedAt}}' nexus
```

- `[medidor] <fecha> ⚠ hilo atrasado N ms`: el hilo de JS se trabó más de 2 s. `heap al NN % del
  tope`: la memoria se está llenando. Sale como mucho una por minuto
  (`lib/observability/medidor-proceso.ts`). Las líneas de alrededor dicen qué estaba corriendo
  (por ejemplo `[google/sync]`). ⚠ Si el hilo queda trabado del todo, la línea sale recién cuando
  se destraba.
- `OOMKilled=true`: lo mató el kernel por pasar los 3 GB con memoria que no es del heap (Chrome de
  los PDF, buffers). Si el que muere es Node, el log dice «heap out of memory».
- Referencia: el rss normal medido el 2026-09-21 es de unos 200 MB.

**2. Guardar los logs y detener sin perderlos.**

```bash
docker logs nexus --since 24h > ~/nexus-$(date +%F-%H%M).log 2>&1
docker compose stop app       # detiene; el contenedor queda, con sus logs y su /tmp
docker compose start app      # vuelve a levantar EL MISMO contenedor
```

⛔ Nunca `docker compose down` ni `docker rm` en un incidente: borran el contenedor y, con él, sus
logs y su `/tmp` (donde queda la foto de memoria). Un deploy o un `--force-recreate` también lo
recrean: guardar los logs antes.

**3. Sacar una foto de memoria (heap snapshot).** No está prendida de fábrica: escribirla congela
el proceso varios segundos y pide tanta memoria como el heap. Se prende para atrapar la próxima vez
que se llene:

1. En el `.env` del VPS (`/opt/smartflow/Nexus/.env`):
   ```
   NODE_DIAG_OPTIONS=--max-old-space-size=1536 --heapsnapshot-near-heap-limit=1 --diagnostic-dir=/tmp
   ```
   El compose la suma a `NODE_OPTIONS`. El tope baja a 1,5 GB a propósito: escribir la foto pide
   otro tanto de memoria y el contenedor tiene 3 GB. ⚠ Ocupa ~1,5 GB de disco por foto.
2. Guardar los logs (paso 2) y recrear el contenedor con la MISMA imagen:
   `docker compose up -d --no-build --force-recreate app`. ⚠ Solo si no hubo un `git pull` sin
   deploy en el medio (sería el «deploy mixto», ver Deploy).
3. Cuando el heap se acerque al tope, Node escribe `/tmp/Heap.<fecha>.<hora>.<pid>…heapsnapshot` y
   muere; Docker lo levanta en el mismo contenedor, sin borrar `/tmp`.
4. Llevársela: `docker exec nexus sh -c 'ls -la /tmp/*.heapsnapshot'` y
   `docker cp nexus:/tmp/<archivo>.heapsnapshot ~/`. Se abre en Chrome → DevTools → Memory → Load;
   la vista «Summary» ordenada por «Retained Size» dice qué llenó la memoria.
5. Sacar `NODE_DIAG_OPTIONS` del `.env` y recrear otra vez (paso 2). ⚠ Que no quede puesta: cada
   vez que el heap se acerque al tope congela el proceso y escribe gigas al disco.

⚠ `NODE_OPTIONS` en el `.env` NO sirve: el `environment` del compose le gana al `env_file`. Si
quedó una del incidente, sacarla para no confundir. Lo mismo con un `docker update --cpus/--memory`
hecho a mano: se pierde al recrear el contenedor; los límites viven en `docker-compose.yml`.

## Jobs del scheduler (`lib/jobs/defs.ts`)

Tick de 60 s, gated por `CRON_ENABLED=1` (solo prod; lo pone `docker-compose.yml`). Claims
por fecha en `CronJobState`: matar el contenedor a mitad de un job NO re-dispara ese día.
Cada corrida deja su resultado en `CronJobState.lastResult` y el **semáforo de
Integraciones** lo pinta (B-03); un fallo llega a Sentry con `tags.job` (B-02), y un job que no
toma el turno del día no anota nada, así que un rojo queda rojo hasta la corrida siguiente. Hasta el
2026-09-04 esta sección listaba 6 jobs; son 13 (`allJobs()`), más tres disparos por navegación:

| Job | Cuándo | Gate | Qué hace |
|---|---|---|---|
| `marketing-weekly` | cada tick; ventana propia (viernes 6:00 CR) + claim propio en `MarketingSettings` | — | delega a `tickMarketingCron` tal cual |
| `cs-signals-daily` | L–V ≥ 6:00 CR, una vez al día | `CS_WATCHDOG_ENABLED=1` | refresca las señales HubSpot de Éxito del cliente |
| `cs-partner-daily` | L–V ≥ 6:00 CR, una vez al día | `CS_PARTNER_SYNC_ENABLED=1` o `CS_WATCHDOG_ENABLED=1` | espeja Partner Clients (uso, licencias, MRR); degrada sin scope. Prendido solo por `CS_PARTNER_SYNC_ENABLED` NO crea clientes nuevos (2026-10-02): las licencias del cliente lo necesitan sin el vigilante |
| `cs-watchdog-daily` | L–V ≥ 7:00 CR (después de las señales) | `CS_WATCHDOG_ENABLED=1` + `CsSettings.watchdogEnabled` | sweep del watchdog con pre-filtro determinístico |
| `cs-watchdog-debounce` | cada tick | `CS_WATCHDOG_ENABLED=1` | triage de eventos «quiesced» (>15 min), hasta 5 proyectos por tick |
| `maintenance-daily` | una vez al día, a cualquier hora (en la práctica, pasada la medianoche CR) | — | barre `PrintJobToken` expirados y `ExternalVerifyAttempt` sin actividad en 24 h, y refresca las alertas de cobranza: abre vencidos y promesas incumplidas, pone al día las filas vivas y cierra las que ya no aplican (`lib/cobranza/alertas-refresco.ts`). No guarda corte. Si el refresco falla, el job queda en rojo y no reintenta hasta el día siguiente |
| `cobranza-quincenal` | ≥ 7:00 CR en los días de corte (`esDiaDeCorte`) | `COBRANZA_CRON_ENABLED=1` | la tanda quincenal de cobranza: extiende las suscripciones, abre todas las alertas (falta facturar, cuentas sin datos, catch-ups) y guarda la foto de la quincena para Reportes. INV32 da rojo si el último corte tiene más de 17 días |
| `google-enrich-retry` | cada tick, hasta 20 sesiones | `GOOGLE_SERVICE_ACCOUNT_KEY` + `GOOGLE_ADMIN_EMAIL` | reintenta el enriquecimiento de Meet que falló (backoff y tope de intentos) |
| `ventas-ganadas-daily` | todos los días ≥ 6:00 CR (fines de semana incluidos) | — | espeja los tratos ganados del año en curso |
| `odoo-espejo-daily` | ≥ 6:00 CR, una vez al día | `ODOO_PASSWORD` (contraseña o clave de API), `ODOO_LOGIN` si la clave no es de `direct`, y `ODOO_SYNC_ENABLED` ≠ `0` | espeja las facturas de Odoo (Nexus solo lee). Si la corrida falla, el job FALLA (rojo + Sentry); un rechazo de credenciales retiene el turno hasta mañana (ver «El espejo de Odoo no corre»). INV31 da rojo si la última corrida buena tiene más de 20 h |
| `mercury-espejo-daily` | ≥ 6:00 CR, una vez al día | `MERCURY_API_TOKEN` (token «Read Only» de Mercury) y `MERCURY_SYNC_ENABLED` ≠ `0` | copia las facturas, los clientes y los movimientos de Mercury (Nexus solo lee: el token no puede escribir). Si falla, el job FALLA (rojo + Sentry); un token rechazado retiene el turno hasta mañana (ver «La copia de Mercury no corre») |
| `tipo-cambio-daily` | ≥ 6:00 CR, una vez al día | `TIPO_CAMBIO_SYNC_ENABLED` ≠ `0`; `BCCR_TOKEN` opcional | trae la venta y la compra de referencia del BCCR del día a `TipoCambioDia` (con `BCCR_TOKEN`, del servicio del BCCR; sin él, del API de Hacienda). Si falta el histórico desde 2023 lo intenta en la misma corrida. FALLA (rojo + Sentry) si no quedó la tasa de hoy; un fallo pasajero suelta el turno. Primera carga del histórico: `scripts/traer-tipo-de-cambio.ts --apply` |
| `planilla-quincena-daily` | ≥ 6:00 CR, una vez al día | — | se asegura de que la quincena de planilla de hoy exista en el libro, con el salario que rige (`completarQuincenas`, PENDIENTE: pagarla la marca una persona). Re-generar no duplica nada. Las quincenas atrasadas no las crea solo: eso es «Completar las que faltan» en el historial de planilla |
| `licencias-renovacion-daily` | ≥ 7:00 CR, una vez al día | — | a 90, 60 y 30 días de cada renovación de licencias (HubSpot Partner + lo cargado a mano en la información del cliente), una alerta de «Renovación» en Éxito del cliente; una por cliente, hub, fecha y umbral. Sin IA (`lib/cs/avisos-de-renovacion.ts`) |
| `invariants-daily` | ≥ 7:00 CR, una vez al día (después de los espejos) | — | corre los 21 invariantes solo-base (`lib/invariantes/`, B-07); si alguno está en rojo el job FALLA a propósito: semáforo rojo + Sentry. Los que necesitan HubSpot o archivos siguen en `check-invariants.ts`, a mano |

⚠ Sin `CS_WATCHDOG_ENABLED` y `COBRANZA_CRON_ENABLED` en el `.env` cinco de estos no corren, y sin
`ODOO_PASSWORD` tampoco el espejo. Hasta el 2026-09-12 el semáforo los pintaba en gris («nunca
corrió»), igual que a un job que todavía no llegó a su hora; ahora dice **apagado** con el motivo, que
sale de la misma regla que usa `shouldRun` (`lib/jobs/requisitos.ts`).

**Tres disparos por navegación**, que no pasan por el scheduler:
- **Auto-sync de Google Meet**: `POST /api/integrations/google/auto-sync` al cargar el shell
  (`components/layout/SidebarShell.tsx`) y la pantalla de sesiones
  (`app/(shell)/sessions/SessionsClient.tsx`), con freno en el servidor desde el 2026-09-21
  (incidente de 821 % de CPU): 20 min de espera contados desde el FIN de la corrida, espera
  creciente tras un fallo (5, 10, 20, 40, hasta 60 min), un turno que vence a la hora si el proceso
  muere a mitad, y nunca dos corridas a la vez. Mira 30 días hacia atrás (`GOOGLE_MEET_DAYS_BACK`
  lo cambia) y solo escribe las reuniones que cambiaron. Para traer algo YA, el botón «Sincronizar»
  de Integraciones corre la sync sin esperar el turno; el backfill de un año está en
  `lib/google/meet-sync-cambios.ts` (`diasHaciaAtras`).
- **Espejo de proyectos de HubSpot**: `POST /api/clients/[id]/sync-projects` al abrir la ficha de
  un cliente (`app/(shell)/clients/[id]/WorkspaceClient.tsx`), con cooldown en el servidor.
- **Agente vigía al entrar a un cliente** (desde el 2026-10-05): `POST /api/cs/watchdog/al-entrar`
  al abrir la ficha del cliente o su cuenta en Éxito del cliente (`components/cs/DisparoDelVigia.tsx`).
  Corre para los proyectos de cartera activos del cliente SOLO si el vigía no corrió para ninguno en
  48 h; una revisión a la vez por cliente, una hora de espera tras un fallo
  (`lib/cs/vigia-por-cliente.ts`). NO depende de `CS_WATCHDOG_ENABLED`: lo frena
  `CsSettings.watchdogEnabled`, que desde ese día frena también la corrida a mano. Llama a Claude
  (una vez por proyecto) aunque el cron del vigía esté apagado.

### Prender la copia diaria de Éxito del cliente

Sin estas banderas, Éxito del cliente muestra datos viejos (la copia de Partner en producción está parada
desde julio de 2026) y la columna «De dónde salen los datos» lo dice. Dos niveles, en el `.env` del VPS
(`/opt/smartflow/Nexus/.env`), y después `bash scripts/deploy.sh` (el deploy recrea el contenedor con
el `.env` nuevo; sin SQL):

- **Solo los datos de Partner** (uso, licencias, renovaciones, MRR): `CS_PARTNER_SYNC_ENABLED=1`. Corre
  `cs-partner-daily` (L–V desde las 6:00 CR). No usa IA y no crea clientes: solo actualiza los que ya
  existen.
- **Todo, con el vigía**: `CS_WATCHDOG_ENABLED=1`. Suma `cs-signals-daily` (tickets, actividad y las
  personas de cada empresa), `cs-watchdog-daily` (hasta 10 proyectos por día) y `cs-watchdog-debounce`
  (hasta 5 por tick), que **gastan API de Anthropic**. ⚠ Con esta bandera la copia de Partner también
  CREA clientes para los registros de Partner que no encuentra (`partnerCreaClientes`): mirar la lista
  de clientes los días siguientes. El vigía se apaga sin deploy con `CsSettings.watchdogEnabled`.

El permiso `crm.objects.partner-clients.read` ya está concedido. Al día siguiente, Integraciones › Jobs
del servidor tiene que mostrar los jobs en verde; si dicen **apagado**, nombran la variable que falta.
Para no esperar a las 6:00: «Actualizar partner» y «Actualizar señales» en Éxito del cliente.

### El espejo de Odoo no corre

Se ve en tres lugares: la línea de arriba de Cobranza › Odoo se pone en rojo, INV31 da rojo en
`invariants-daily` (y en `check-invariants.ts`), e Integraciones › Jobs del servidor dice si
`odoo-espejo-daily` está **apagado** y por qué, o si **falló** y con qué error. `/integrations/odoo`
lista cada corrida con su resultado.

⭐ Desde el **2026-09-29** hay botón: **«Actualizar desde Odoo»**, arriba de las pestañas de Cobranza › Odoo
(y «Actualizar» en Finanzas › Punto de equilibrio, que además trae las ventas de HubSpot). Hace la misma
copia que el job, firmada por quien la pidió, y es la salida más corta para los casos 2 y 3 de abajo una vez
arreglada la causa: no hace falta liberar el turno ni correr un script.
- **Nunca corren dos copias a la vez**: la copia toma un candado (`CronJobState`, fila `odoo-espejo-candado`).
  Si el botón contesta «ya hay una copia en curso» durante más de un minuto, el proceso murió con el candado
  puesto: **vence solo a los 10 minutos**. Para no esperar (escritura a producción; la hace una persona):
  `UPDATE "CronJobState" SET "lastRunAt" = NULL WHERE id = 'odoo-espejo-candado';`
- Con una copia de hace menos de 30 segundos el botón no vuelve a leer Odoo: recarga la pantalla y lo dice.
- La copia trae también **la lista de clientes de Odoo**, para «Emparejar». Si Odoo deja de permitir leer los
  clientes (`res.partner`), falla la copia entera, con ese error a la vista.

1. **Apagado, «falta ODOO_PASSWORD»**: cargar `ODOO_LOGIN` y `ODOO_PASSWORD` en el `.env` del VPS y
   hacer deploy; el job corre en el tick siguiente si ya son las 6:00 CR. Desde el **2026-09-13** la
   credencial es una **clave de API del usuario `egonzalez@smarteamcr.com`** (Odoo acepta la clave en
   el casillero de contraseña). ⚠ Sin `ODOO_LOGIN`, Nexus usa `direct` con esa clave y Odoo la rechaza.
   El SQL de la etapa 4 (`scripts/sql/2026-09-12-4-espejo-odoo-moneda-del-documento.sql`) ya está
   aplicado en producción, igual que los de las etapas 7, 10 y 12 (verificados el 2026-09-13).
2. **Falló por credenciales** (`AUTENTICACION` en el error): el job **retiene el turno del día** y no
   reintenta hasta mañana. Es a propósito: cada intento con la clave rechazada suma al bloqueo del
   usuario en Odoo, y reintentar cada minuto lo sostendría. Primero se arregla la causa en Odoo
   (clave de API vencida o revocada, usuario archivado o con el login cambiado, verificación en dos
   pasos —con eso la contraseña ya no entra por la API, solo una clave—, o el bloqueo de 60 s). ⭐ Un
   rechazo **rápido**, sin los cientos de ms que tarda el hash de la contraseña, descarta que la
   contraseña haya cambiado: Odoo ni la miró. Así fue el del 2026-09-02 con `direct`.
   Después, tres salidas:
   - **Esperar**: la corrida de mañana, desde las 6:00 CR, lo toma sola.
   - **Liberar el turno de hoy** (escritura a producción; la hace una persona):
     `UPDATE "CronJobState" SET "lastRunDateKey" = NULL WHERE id = 'odoo-espejo-daily';`, corrido
     como cualquier SQL de `scripts/sql/` (`ALLOW_PROD_WRITE=1 npx prisma db execute --file <archivo>
     --schema prisma/schema.prisma`). El scheduler lo retoma en el tick siguiente.
   - **Correr el sync a mano**: `npx tsx scripts/odoo-sync-manual.ts`, desde una PC de desarrollo
     con `ODOO_LOGIN` y `ODOO_PASSWORD` buenos en su `.env` (la base es la misma que la de producción). ⚠ **No se
     puede dentro del contenedor**: la imagen es la salida standalone de Next y no lleva `scripts/` ni
     `tsx` (`Dockerfile`). Tampoco desde el checkout del VPS, que no tiene `node_modules` (ver «Lo que
     `deploy.sh` NO hace»). ⚠ Odoo bloquea 60 s después de varios fallos seguidos desde la misma IP: un intento
     suelto no bloquea nada, pero no lo pongas en un bucle.
3. **Falló por red** (`RED`): el job libera el turno y reintenta en el tick siguiente; Sentry descarta
   el evento idéntico al anterior. Si dura horas, es el servidor de Odoo o la red del VPS.
4. **Corrida parcial, `PERMISO` o `PROTOCOLO`**: retiene el turno. Reintentar no lo arregla: el error
   de `/integrations/odoo` dice qué mirar.

### La copia de Mercury no corre

Mismo molde que la de Odoo (2026-10-02, `lib/cobranza/mercury/`). Cada corrida queda en `SyncMercuryCorrida` con su
error, Integraciones › Jobs del servidor dice si `mercury-espejo-daily` está **apagado** y por qué o si **falló**, y
Cobranza › Mercury lo dice arriba, con el botón «Actualizar desde Mercury». Nunca corren dos copias a la vez (candado
`mercury-espejo-candado` en `CronJobState`, vence solo a los 10 minutos).

1. **Apagado, «falta MERCURY_API_TOKEN»**: el token es «Read Only», lo crea un administrador de Mercury en
   Settings › Tokens, sin IP fija. Se carga en el `.env` del VPS **sin que pase por un chat**, y deploy.
2. **Falló con `TOKEN`**: Mercury no reconoce el token —revocado, borrado por Mercury tras **45 días sin uso**, o mal
   copiado—. El job retiene el turno hasta mañana. Se crea uno nuevo y se reemplaza en el `.env`.
3. **`RED` o `LIMITE`**: libera el turno y reintenta en el tick siguiente.
4. **Parcial, `PERMISO` o `PROTOCOLO`**: retiene el turno; el error de la corrida dice qué mirar.

A mano, desde una PC con el token en su `.env` (la base es la de producción): `npx tsx scripts/mercury-sync-manual.ts`.

## Cobranza

### Aplicar el Excel de Alexander

El Excel de cobranza de Alex («Asientos Contables Mercury Bank & Odoo Oficial.xlsx») es el medio para
poner Nexus al día; lo que después no cuadra entre Nexus y Odoo se ve en Cobranza › Odoo › «Lo que no
cuadra». `scripts/aplicar-excel-de-alexander.ts` hace en una corrida lo que en Cobranza › Importar son
cuatro pantallas, con las mismas funciones y la misma bitácora y firma. El plan es puro y tiene pruebas
(`lib/cobranza/libro-alex-carga-completa.ts`).

**1. Simulacro (siempre primero).** No escribe nada, ni el lote: lee el Excel en memoria y la base en
solo lectura, imprime por grupo qué cambiaría (cantidad y plata por moneda, nunca sumadas), lo que queda
para una persona y si una segunda corrida cambiaría algo.

```powershell
npx tsx scripts/aplicar-excel-de-alexander.ts "C:\Users\...\Asientos Contables Mercury Bank & Odoo Oficial.xlsx"
# con los cobrados que se registrarían:
npx tsx scripts/aplicar-excel-de-alexander.ts "<ruta>.xlsx" --cobrar-con-firma=aarrieta@smarteamcr.com
```

**2. Aplicar.** Exige las cuatro cosas en el mismo comando: `--apply`, `--firma=<correo de alguien del
equipo>`, `--respaldo=<carpeta fuera del repo>` y `ALLOW_PROD_WRITE=1`. El guard respalda además las
tablas con `pg_dump` (sin `pg_dump` en el PATH aborta; `SIN_RESPALDO=1` lo salta a sabiendas).

```powershell
$env:ALLOW_PROD_WRITE="1"; npx tsx scripts/aplicar-excel-de-alexander.ts "<ruta>.xlsx" --apply --firma=aarrieta@smarteamcr.com --respaldo="C:\respaldos\excel-alex"
```

Orden, releyendo la base antes de cada paso y guardando antes en `--respaldo` un JSON con las filas que
ese paso toca:
0. guarda el lote del Excel (o usa el que ya tiene las mismas filas);
1. devuelve a por cobrar las tres facturas que decidió Alex (FAC/2026/0206, 0295 y 0302), con motivo y con la fecha
   de emisión de su factura; si ya estaban por cobrar con otra fecha, corrige solo la fecha (paso 1b, con su línea en la
   bitácora);
2. anota los números de factura que dice el Excel en su cuota («Es esta»);
3. carga por cobrar, con número, las facturas que Nexus no tiene y escribe las anotaciones («Aplicar»);
4. registra las promesas de pago que traen fecha;
5. solo con `--cobrar-con-firma=<correo>`: registra cobradas las que el Excel da pagadas, con la fecha de
   pago del Excel y esa firma en la bitácora. Sin ese argumento se listan y no se tocan.

**Lo que no hace, a propósito.** No toca montos (neto contra IVA no es diferencia), no saca de Cobrado
nada fuera de las tres de Alex, no carga Insider, Kaizen, JCB, QuickBooks ni No inscritos, no elige
cuentas por parecido, no empareja clientes de Odoo, no decide el IVA de una factura de Odoo que la copia
no tiene, y no carga una factura que puede ser una cuota que Nexus ya tiene en otro mes o en otra cuenta.
Todo eso sale al final como «Queda para una persona», con el porqué.

**Correrlo dos veces no cambia nada la segunda.** Si al final dice que quedan cambios, algún paso se
rechazó (la lista de rechazos dice cuál y por qué). ⛔ Nexus nunca escribe en Odoo.

**Deshacer.** Los JSON de `--respaldo` tienen las filas de `Cobro` antes de cada paso (y los servicios
y el lote antes de la carga); el respaldo de `pg_dump` del guard queda en `backups/`. Las facturas
cargadas se reconocen por el servicio «Facturación importada del libro de Alex (moneda)».

### Odoo › «Lo que no cuadra»: traspasar las marcas de las notas y reabrir las facturas cerradas sin motivo

Una sola vez, con el deploy que trae «Está en Mercury» y «Está bien así» fila por fila (2026-09-25). Son dos decisiones
de Elías: la marca de grupo de las **15 notas de crédito** pasa a una marca por nota, con el mismo motivo, persona y
fecha; y las **4 facturas soltadas** que se cerraron con «Ya está anulada» sin motivo (Wherex cuotas 2 y 3, Honda Costa
Rica cuota 5 y KAIZEN KAPITAL cuota 1, US$26.251) vuelven a pendientes. El porqué de cada regla está en
`docs/odoo-decisiones.md`. ⛔ Ninguno de los dos toca Odoo ni un cobro.

**El orden: SQL → deploy → scripts.**

1. **SQL, desde una PC de desarrollo, ANTES del deploy.** Con el código nuevo, sin la tabla de marcas «Lo que no
   cuadra» da error, y sin las columnas de la vía de cobro abrir una cuenta da error.
   ```powershell
   $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-09-25-1-via-de-cobro-firmada.sql
   $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-09-25-2-marcas-por-fila.sql
   Remove-Item Env:ALLOW_PROD_WRITE
   ```
   ⚠ Sin `--schema`: en Prisma 7 `db execute` lo rechaza («unknown or unexpected option: --schema») antes de tocar
   la base; la conexión sale de `prisma.config.ts` (el `DATABASE_URL` del `.env`, host directo `:5432`). Cada archivo
   trae al final su consulta de verificación, pero `db execute` no muestra filas: la confirmación práctica es el
   simulacro del paso 3, que deja de decir «La tabla de marcas todavía no existe».
2. **Deploy**, en el VPS: `bash scripts/deploy.sh`. ⚠ Desde aquí la pantalla ya no lee la marca de grupo: las 15 notas
   vuelven a la lista hasta el paso 3. Córrelo enseguida.
3. **Los dos scripts, desde una PC de desarrollo con el MISMO commit que quedó en producción** (`git pull` y
   `npx prisma generate` antes: sin el cliente regenerado el script no conoce la tabla de marcas): el
   script arma las filas con el motor de su checkout, y una marca solo vale si sus números son los que calcula la
   pantalla. Cada uno, primero en simulacro —solo lee, con la conexión en solo lectura— y después con `--apply`:
   ```powershell
   npx tsx scripts/odoo-traspasar-marcas-de-notas.ts
   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/odoo-traspasar-marcas-de-notas.ts --apply; Remove-Item Env:ALLOW_PROD_WRITE

   npx tsx scripts/odoo-reabrir-liberadas-sin-motivo.ts
   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/odoo-reabrir-liberadas-sin-motivo.ts --apply; Remove-Item Env:ALLOW_PROD_WRITE
   ```

**Qué tiene que decir el simulacro** (medido el 2026-09-25, en solo lectura):
- Traspaso: «15 nota(s) a marcar», US$27.577,66 + ₡889, «0 cambiaron». Si alguna nota cambió desde que se marcó (se
  aplicó en parte, Odoo renombró al cliente), esa **no** se marca: aparece en «Cambiaron…» y queda en la lista para que
  alguien la mire. Las demás pasan igual.
- Reapertura: «4 a reabrir», US$26.251, y que vuelven a «facturas soltadas sin número de documento». Si aparece otra
  cerrada sin motivo, sale como «fuera de la decisión de Elías» y **no** se toca.

**Por qué los scripts van después del deploy.** Los dos escriben en la tabla de marcas, así que necesitan el SQL. La
reapertura, además, tiene que ir con la pantalla nueva: con la vieja, «Ya está anulada» no pide motivo y una factura
reabierta se podía volver a cerrar igual que antes. El traspaso no depende del deploy, pero correrlo enseguida acorta el
rato en que las 15 notas están en la lista.

**Correrlos dos veces no escribe nada la segunda.** El traspaso reconoce sus marcas por el motivo, la persona y la fecha
de la marca de grupo —estén vigentes o deshechas—, así que tampoco vuelve a marcar una nota que alguien deshizo. La
reapertura toca solo las 4 decididas, por id, y una ya abierta no está cerrada.

**Sin `pg_dump` en el PATH el guard aborta** antes de escribir (`SIN_RESPALDO=1` lo salta, a sabiendas). Con `--apply`
cada script aborta también si falta la tabla de marcas.

**Deshacer.** Una nota traspasada se deshace desde la pantalla: «Marcadas» › «Deshacer», que firma quién y cuándo. Una
factura reabierta se vuelve a cerrar con «Ya está anulada», que ahora pide motivo. La marca de grupo sigue en
`DiferenciaOdooAceptada`, como historia. Los respaldos quedan en `backups/<fecha>-<script>/`: el `pg_dump` del guard y
un JSON con lo que había y lo que se escribió.

### Cargar una empresa con lo que Odoo ya le facturó (kölbi, 2026-09-30)

Para una empresa que factura por Odoo y no tiene cuenta en Nexus (o no tiene sus facturas del año como cobros):
abre la cuenta si falta, vincula sus clientes de Odoo y carga un cobro por cada factura viva del año. Qué entra lo
decide `lib/cobranza/carga-desde-odoo.ts` (puro, con pruebas); el porqué, en `docs/odoo-decisiones.md`. ⛔ No escribe en
Odoo. **En tu PC**, PowerShell, en `D:\Proyectos\nexus`, con `git pull` hecho. Primero el simulacro (solo lee):

```powershell
npx tsx scripts/cargar-cuenta-desde-odoo.ts --empresa=kölbi "--fichas=75,168,44" --anio=2026 --firma=egonzalez@smarteamcr.com --cobrar-con-firma=egonzalez@smarteamcr.com
```

⚠ `--fichas` va entre comillas: sin ellas PowerShell parte la lista por las comas y el script dice que falta.

**Qué tiene que decir el simulacro para kölbi** (medido el 2026-09-30): «Cobros que se cargan: 16 · US$121 275 +
₡69 247 499,8», 9 cobrados con el día del banco y 7 por cobrar (0211, 0223, 0308, 0320 en dólares; 0343, 0344, 0345 en
colones); aparte, la **FAC/2026/0210** «parece anulada por la nota FAC/2026/0246» (hay que conciliarlas en Odoo); y no
entran las 3 de 2025 ni las revertidas 0229 y 0232.

Después, el mismo comando con `--apply`. En esta PC no hay `pg_dump`, así que el guard pide decidir a sabiendas que
se escribe sin su respaldo (`SIN_RESPALDO=1`); el script deja igual su respaldo propio en
`backups/<fecha>-cargar-cuenta-desde-odoo/`:

```powershell
$env:ALLOW_PROD_WRITE="1"; $env:SIN_RESPALDO="1"; npx tsx scripts/cargar-cuenta-desde-odoo.ts --empresa=kölbi "--fichas=75,168,44" --anio=2026 --firma=egonzalez@smarteamcr.com --cobrar-con-firma=egonzalez@smarteamcr.com --apply; Remove-Item Env:ALLOW_PROD_WRITE; Remove-Item Env:SIN_RESPALDO
```

Tiene que terminar en «✓ Aplicado. Correrlo de nuevo no cambia nada.» Correrlo dos veces no duplica: un número que ya
tiene cobro no se vuelve a cargar.

**Deshacer.** El JSON «antes» tiene los vínculos de esas fichas y la cuenta de cada una de sus facturas; el «despues»,
la cuenta y los cobros creados. Si la cuenta la creó la carga, borrarla se lleva sus servicios, cobros, alertas y
bitácora; los vínculos y `FacturaOdoo.cuentaId` vuelven a lo que dice «antes».

### Fusionar dos fichas que son la misma empresa (Librería Internacional, 2026-10-01)

Cuando la misma empresa está dos veces en Nexus —y casi siempre también en HubSpot—: primero se fusionan en HubSpot,
después en Nexus con `scripts/merge-duplicate-clients.ts`. A la ficha que sigue le pasa TODO lo de la otra (proyectos,
reuniones, handoffs, tareas, ventas, la cuenta de cobro con sus servicios, cobros, bitácora, clientes de Odoo y
facturas), suma los dominios, junta las notas, apunta a la empresa de HubSpot viva y borra la otra, ya vacía, en UNA
transacción. Las reglas están en `lib/clients/fusion-de-empresas.ts` (puro, con pruebas). Sigue la que tiene más
reuniones y proyectos; el script se niega al revés.

**En tu PC**, PowerShell, en `D:\Proyectos\nexus`. Primero el simulacro (solo lee la base y HubSpot):

```powershell
npx tsx scripts/merge-duplicate-clients.ts --canonico cmtum4orn00bd07lg0if1q51q --dup cmrf4wzfv00aq7gij2fbv1c59 --nombre "Librería Internacional"
```

**Qué tiene que decir para Librería** (medido el 2026-10-01): pasan 2 proyectos, 1 handoff, 3 reuniones, 12 tareas y 2
ventas; la cuenta de dólares entrega a la de colones su servicio, su cobro, su bitácora, el cliente de Odoo #48 y sus 4
facturas; «⚠ moneda: queda CRC»; y HubSpot «28872445070 → 58805575479», la empresa en que quedaron fusionadas las seis.

Después, el mismo comando con `--firma` y `--apply` (sin `pg_dump` en esta PC: `SIN_RESPALDO=1`; el script deja su
respaldo propio en `backups/<fecha>-merge-duplicate-clients/`):

```powershell
$env:ALLOW_PROD_WRITE="1"; $env:SIN_RESPALDO="1"; npx tsx scripts/merge-duplicate-clients.ts --canonico cmtum4orn00bd07lg0if1q51q --dup cmrf4wzfv00aq7gij2fbv1c59 --nombre "Librería Internacional" --firma egonzalez@smarteamcr.com --apply; Remove-Item Env:ALLOW_PROD_WRITE; Remove-Item Env:SIN_RESPALDO
```

Tiene que terminar en «✓ 1/1 pares fusionados». Después: `npm run check:invariants` y
`npx tsx scripts/backfill-resolved-client.ts` (simulacro → changed=0). La lista de empresas tarda hasta un minuto en
mostrar una sola.

**Deshacer.** El JSON «antes» tiene las dos fichas y las dos cuentas enteras, lo que se borra entero (las notas de etapa
que chocaban, lo uno a uno que ya tenía la que sigue) y el id de cada fila que se mudó; el «despues», qué quedó.

## Respaldo y restauración (Supabase)

La base de Nexus es UNA Supabase Postgres (plan Pro) compartida por producción y las dos PCs
(inv. #2). Hasta el 2026-09-04 nadie en el repo sabía qué respaldo existe ni cómo se restaura
(auditoría 2026-09-03): esta sección lo escribe y deja marcados los huecos que solo se cierran
mirando el panel.

**Lo que hace Supabase Pro por su cuenta** (confirmar en el panel — ver huecos):
- Respaldo diario automático de la base entera, con **7 días** de retención en el plan Pro.
- Point-in-Time Recovery (restaurar a un instante exacto) es un **add-on pago**; sin él se
  restaura al respaldo diario más cercano y se pierde lo del día.
- Dónde mirar: panel de Supabase → proyecto → **Database → Backups**.

**Huecos que solo se cierran desde el panel** (Elías):
- [[Elías: ¿PITR está contratado? Si no, el peor caso es perder hasta 24 h de datos.]]
- [[Elías: retención real que muestra el panel (7 días es el default del plan Pro).]]
- [[Elías: fecha del último simulacro de restauración — nunca se hizo uno; hacerlo ANTES de necesitarlo.]]

**Cómo restaurar** (el respaldo de Supabase restaura la base ENTERA — no hay restauración por tabla):
1. Que nada escriba mientras tanto: en el VPS, `docker compose stop app`; avisar a las dos PCs
   que no corran scripts con `--apply`.
2. Panel de Supabase → Database → Backups → elegir el respaldo (o el instante, con PITR) →
   **Restore**. Se restaura sobre el mismo proyecto; tarda minutos y la base queda inaccesible.
3. Volver a levantar: `docker compose up -d --wait app` y verificar `/api/health` (`ok:true`).
4. Desde una PC, `npx tsx scripts/check-invariants.ts` (solo lectura) y revisar INV2 e INV7.
5. Anotar acá qué se restauró, a qué instante y qué se perdió.

**Antes de una escritura arriesgada, un respaldo propio** (B-06, 2026-09-04): todo script con
`--apply` que declare sus tablas —`resolverApply({ tablas: ["SessionProject"] })`— las respalda
con `pg_dump` a `backups/<fecha>-<script>/<Tabla>.<hora>.sql` ANTES de escribir, y si el respaldo
falla no escribe. Exige `pg_dump` en el PATH de la PC que corre el script (herramientas cliente
de PostgreSQL); `SIN_RESPALDO=1` lo salta por comando, a sabiendas. Los scripts que todavía no
declaran tablas están congelados en `lib/db/guard-de-escritura.test.ts` (la lista solo encoge).
Un `pg_dump` de una tabla es la única restauración PARCIAL que existe: Supabase restaura todo o
nada. Restaurar: `psql "$DATABASE_URL" -f backups/<fecha>-<script>/<Tabla>.<hora>.sql`.

## Reconstruir el VPS desde cero

Derivado de `docker-compose.yml`, `Dockerfile` y `scripts/deploy.sh` (2026-09-04). Si el VPS
desaparece, esto es todo lo que hay que rehacer — la base vive en Supabase y no se pierde con él.

1. **Máquina**: Linux con Docker + Docker Compose v2, `git` y `bash`. nginx delante (TLS; también
   `X-Forwarded-For`, que alimenta el rate-limit por IP de verify-access, y HSTS). ⚠ El CPU tiene
   que correr el Chrome for Testing que baja el Dockerfile: el `chromium` de Debian crashea con
   SIGILL en el CPU virtualizado del VPS actual (ver «Export PDF»).
2. **Checkout**: `git clone <origin> /opt/smartflow/Nexus` — `deploy.sh` asume esa ruta
   (`APP_DIR`) y un checkout limpio.
3. **`.env` en esa carpeta** (no está en git; referencia completa en `.env.example`):
   - build-args, se inlinean en el bundle: `NEXT_PUBLIC_SUPABASE_URL`,
     `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SENTRY_DSN`.
   - runtime (`env_file`): `DATABASE_URL` (⚠ el pooler, puerto 6543 — inv. #3), `SUPABASE_URL`
     y `SUPABASE_SECRET_KEY`/`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, las de HubSpot
     (`HUBSPOT_CLIENT_SECRET` y compañía), `GOOGLE_SERVICE_ACCOUNT_KEY` + `GOOGLE_ADMIN_EMAIL`,
     `SENTRY_DSN`, `APP_URL`, `CS_WATCHDOG_ENABLED=1`, `COBRANZA_CRON_ENABLED=1` (sin ella INV32 da
     rojo a los 17 días), Odoo (`ODOO_PASSWORD`…; sin ella INV31 da rojo a las 20 h) y el Data Lake.
     `CRON_ENABLED=1` y `PORT` los pone el compose. Si falta una bandera de un job, Integraciones ›
     Jobs del servidor lo dice con el nombre de la variable.
   - ⛔ `ALLOW_PROD_WRITE` NUNCA fija en el `.env` (el guard aborta, B-01).
   - [[Elías: de dónde se recupera el .env del VPS si se pierde — gestor de contraseñas o copia cifrada. Hoy no hay copia declarada.]]
4. **Primer arranque**: `cd /opt/smartflow/Nexus && bash scripts/deploy.sh`. Hace pull ff-only,
   build (baja Chrome for Testing, `prisma generate`, salida standalone), levanta con healthcheck
   (`/api/health`) y smoke del sha. Puerto `3004` en el host.
5. **Después**: reconectar HubSpot del sistema desde Integraciones si hace falta (el token vive
   en la base, así que suele sobrevivir), mirar el semáforo de jobs en Integraciones al día
   siguiente, y `npx tsx scripts/check-invariants.ts` desde una PC.

## Export PDF (Chromium)

- Binario: **Chrome for Testing de Google** bajado en el build →
  `/usr/local/bin/chrome-pdf` (symlink). El `chromium` de Debian está instalado
  SOLO por sus librerías de sistema — su binario crashea con SIGILL en el CPU
  virtualizado de este VPS (ver historia en el commit `dabfc20`).
- Dev local Windows: `PUPPETEER_EXECUTABLE_PATH` en `.env.local` → chrome.exe.
- Concurrencia: máx 2 simultáneos + cola de 4 → después 429.

## Marketing → Borrador social en HubSpot (API DEPRECADA — at-risk)

"Enviar a HubSpot" (en las ideas **Aprobadas** de `/marketing/contenido`) crea un
post como **BORRADOR** en el compositor social de HubSpot (LinkedIn/FB/IG), vía el
**API LEGACY de broadcast** (`/broadcast/v1`). `lib/hubspot/social-broadcast.ts`.

⚠️ **HubSpot marcó el API de Social como DEPRECADO** (sin sucesor). Funciona hoy y
soporte confirmó a un usuario que no lo apagan "como excepción", pero **no hay SLA**
— puede cortarse sin aviso. Por eso:

- El scope OAuth **`social` está marcado OPCIONAL** en la app pública Y como
  `optional_scope` en `app/api/auth/hubspot/route.ts` — si HubSpot lo elimina, NO
  rompe el resto de la conexión (CRM/tickets/proyectos).
- Todo degrada con **403 → `{ supported: false }`** (patrón `ticketsSupported`): sin
  el scope, el botón "Enviar a HubSpot" simplemente NO aparece.
- Requiere que los canales sociales estén **conectados en el Social de HubSpot**
  (LinkedIn/FB/IG de Smarteam). El endpoint `/api/marketing/social-channels` los lista.
- Diagnóstico/validación manual: `npx tsx scripts/spike-hubspot-social.ts`
  (Fase A read-only: scopes + canales; `--create-draft --channel=<key>` crea un
  borrador de prueba — acordate de borrarlo del compositor).
- Los `broadcastGuid` creados se guardan en `ContentIdea.hubspotDraftGuids`.

Si algún día HubSpot corta el API: el botón devuelve 403/error humano y se puede
retirar la feature sin tocar el resto (es aditiva y aislada).
