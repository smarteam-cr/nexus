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

⚠️ **«BUILD FALLO» con «JavaScript heap out of memory» en `npm run build`**: el chequeo de tipos de
`next build` se quedó sin heap. El tope del BUILD vive en el `Dockerfile` (`NODE_OPTIONS` de la etapa
builder, 6 GB desde el 2026-10-16, cuando el chequeo ya pedía 4,2 GB); no es el de 2 GB del contenedor que
corre. Medir cuánto pide hoy con `npx tsc --noEmit -p . --incremental false --extendedDiagnostics`
(«Memory used») y, si hace falta, subirlo mirando la memoria libre del VPS (`free -m`). Mientras tanto el
contenedor viejo sigue arriba: no hay nada que revertir. En la PC pasa lo mismo con `npx tsc --noEmit` (el tope de Node 24 ronda los 4 GB):
`NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p .` (PowerShell: `$env:NODE_OPTIONS="--max-old-space-size=8192"`).

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
2026-09-04 esta sección listaba 6 jobs; son 18 (`allJobs()`), más los disparos por navegación:

| Job | Cuándo | Gate | Qué hace |
|---|---|---|---|
| `marketing-weekly` | cada tick; ventana propia (viernes 6:00 CR) + claim propio en `MarketingSettings` | — | delega a `tickMarketingCron` tal cual |
| `cs-signals-daily` | L–V ≥ 6:00 CR, una vez al día | `CS_WATCHDOG_ENABLED=1` | refresca las señales HubSpot de Éxito del cliente |
| `cs-partner-daily` | L–V ≥ 6:00 CR, una vez al día | `CS_PARTNER_SYNC_ENABLED=1` o `CS_WATCHDOG_ENABLED=1` | espeja Partner Clients (uso, licencias, MRR); degrada sin scope. NO crea clientes nuevos salvo con `CS_PARTNER_CREA_CLIENTES=1` (separada del vigilante el 2026-10-24). La bandera es solo del job: el botón «Traer HubSpot Partner» del panel y `scripts/run-partner-sync.ts --apply` sí crean, a propósito, porque los aprieta una persona |
| `cs-watchdog-daily` | L–V ≥ 7:00 CR (después de las señales) | `CS_WATCHDOG_ENABLED=1` + `CsSettings.watchdogEnabled` | sweep del watchdog con pre-filtro determinístico |
| `cs-watchdog-debounce` | cada tick | `CS_WATCHDOG_ENABLED=1` | triage de eventos «quiesced» (>15 min), hasta 5 proyectos por tick |
| `maintenance-daily` | una vez al día, a cualquier hora (en la práctica, pasada la medianoche CR) | — | barre `PrintJobToken` expirados y `ExternalVerifyAttempt` sin actividad en 24 h, y refresca las alertas de cobranza: abre vencidos y promesas incumplidas, pone al día las filas vivas y cierra las que ya no aplican (`lib/cobranza/alertas-refresco.ts`). No guarda corte. Si el refresco falla, el job queda en rojo y no reintenta hasta el día siguiente |
| `cobranza-quincenal` | ≥ 7:00 CR en los días de corte (`esDiaDeCorte`) | `COBRANZA_CRON_ENABLED=1` | la tanda quincenal de cobranza: extiende las suscripciones, abre todas las alertas (falta facturar, cuentas sin datos, catch-ups) y guarda la foto de la quincena para Reportes. INV32 da rojo si el último corte tiene más de 17 días |
| `google-meet-sync` | cada tick LANZA la corrida sin esperarla; corre cada 10 min contados desde el fin de la anterior (U1, 2026-10-25) | `GOOGLE_MEET_SYNC_ENABLED` ≠ `0` (prendido por defecto) + `GOOGLE_SERVICE_ACCOUNT_KEY` + `GOOGLE_ADMIN_EMAIL` | la copia de Google Meet: los calendarios del dominio (30 días, con los cancelados), los invitados con su respuesta (`ParticipanteDeReunion`), el código de la reunión y la lectura de los Docs (`lib/google/copia-por-job.ts` → `autoSyncGoogleMeet`). Comparte el turno con el disparo al abrir la app (fila `google-auto-sync`): nunca a la vez. Anota su resultado al terminar (`lastRunAt` = cuándo arrancó). Un evento cancelado en todos los calendarios se marca (`canceladaEn`), nunca se borra. Con `0` vuelve el disparo al abrir la app. INV49 da rojo si la última copia buena tiene más de 1 h. Medido el 2026-10-24: unos 7 s por corrida |
| `google-enrich-retry` | cada tick, hasta 20 sesiones | `GOOGLE_SERVICE_ACCOUNT_KEY` + `GOOGLE_ADMIN_EMAIL` | reintenta el enriquecimiento de Meet que falló (backoff y tope de intentos) |
| `seguimiento-reuniones` | cada tick, 2 lecturas en paralelo (420 s de tope cada una: el tope CORTA la lectura) | `SEGUIMIENTO_REUNIONES_ENABLED` ≠ `0` (prendido por defecto) y el SQL `2026-10-10-lectura-de-seguimiento.sql` | la lectura de cada reunión con un cliente o un prospecto (no de puertas adentro), por la cola `LecturaDeReunion` (`lib/lecturas`): minuta, compromisos a propuestas de Tarea y pedidos fuera de alcance; después vincula a su proyecto las reuniones que la lectura no toma y, con `SEGUIMIENTO_HECHOS=1`, reintenta hasta 2 lecturas de hechos que fallaron o de reuniones que cambiaron de dueño (con la bandera prendida también entran las reuniones con solo notas). Sin presupuesto automático no toma nada; sin nada en la cola no anota. Una reunión que falla (o se cuelga) 3 veces queda en `error` y ese tick el job FALLA (rojo + Sentry). Ver «La lectura de cada reunión» |
| `ventas-ganadas-daily` | todos los días ≥ 6:00 CR (fines de semana incluidos) | — | espeja los tratos ganados del año en curso, con quién vendió cada uno, y después las metas comerciales de HubSpot (`MetaComercial`). Sin el permiso de metas lo dice en el log y sigue; se arregla reconectando HubSpot desde Integraciones |
| `tareas-hubspot` | cada 15 minutos de 6:00 a 21:00 CR | `TAREAS_HUBSPOT_ENABLED` ≠ `0` (prendido por defecto) | las tareas de HubSpot del equipo en Tareas internas, en los dos sentidos (`lib/tareas-hubspot`): trae las abiertas de cada persona del equipo (también las de secuencias) y las completadas esta semana; lo que cambió en HubSpot se aplica en Nexus y lo que cambió en Nexus se escribe en HubSpot (título, estado, vencimiento, prioridad, responsable; si los dos cambiaron, gana el último). Una tarea borrada en HubSpot o que pasó a alguien de afuera queda «Ya no se hará». Un candado: una copia a la vez. Carga inicial: `scripts/sync-tareas-de-hubspot.ts` (simulacro primero) |
| `tareas-sprint` | cada tick (con 10 minutos de espera por proceso) | — | las reuniones de sprint de cada equipo (`lib/tareas/fuentes-server.ts`): mira las series que configuró quien lidera cada sprint y pide la lectura de cada reunión nueva que terminó hace entre 15 minutos y 24 horas. Lee lo que ya sincronizó Meet; nunca corre la sync. La misma mirada corre al abrir Tareas. Sin nada que pedir no anota |
| `contactos-y-tickets` | cada hora de 6:00 a 20:00 CR, todos los días | — | copia los contactos y los tickets de HubSpot de las empresas de Nexus (clientes y prospectos con su empresa de HubSpot) a `ContactoDeHubspot` y `TicketDeHubspot` (`lib/contactos/copia-server.ts`). Solo lee HubSpot. Nunca borra: lo que la empresa deja de tener asociado queda `vigente = false`, y solo en un cliente que se leyó entero. Sin permiso (403), esa mitad no se toca. Un turno por hora; con el candado tomado, suelta el turno y reintenta. Después reintenta las notas de la cuenta que quedaron sin escribir en HubSpot (`lib/notas/escritura-server.ts`, hasta 25 por corrida y 5 intentos cada una). Carga inicial: `scripts/sync-contactos-y-tickets.ts` (simulacro primero) |
| `empresa-copia-de-hubspot` | cada hora de 6:00 a 20:00 CR, todos los días | `EMPRESA_HUBSPOT_COPIA=1` (apagado por defecto) | lo que cambió en la empresa de HubSpot vuelve a los datos de la empresa en Nexus (`lib/clients/copia-de-hubspot-server.ts`, R2): lee las empresas con empresa de HubSpot de a 100 y procesa las que cambiaron desde la corrida anterior. Cada valor pasa por la regla de quién manda (se aplica o queda como propuesta); lo que escribió Nexus no vuelve (eco), y lo que ya se propuso o se descartó no se vuelve a proponer. Lee HubSpot y, con `EMPRESA_HUBSPOT_ESCRITURA=1`, escribe allá lo que recalculó en Nexus (el TAM al cambiar los empleados). Una empresa fusionada en HubSpot se salta y queda anotada en el registro. Con el candado tomado, suelta el turno. A mano y en simulacro: `scripts/copiar-empresas-de-hubspot.ts --todas` |
| `comunicaciones-hubspot` | cada hora de 6:00 a 20:00 CR, todos los días | `COMUNICACIONES_HUBSPOT_ENABLED` ≠ `0` (prendido por defecto) y el SQL `2026-10-18-comunicaciones-de-hubspot.sql` | copia los correos, las notas y las llamadas de HubSpot de las empresas de Nexus (clientes y prospectos) y de sus contactos a `ComunicacionDeHubspot` (`lib/comunicaciones/copia-server.ts`), por la búsqueda de lo modificado y las asociaciones en lote, 120 días. Solo lee HubSpot. Una comunicación es de UN cliente: la de dos no se guarda. Nunca borra (`vigente = false`). Sin el permiso de correos, los correos dicen «sin permiso» y sigue con lo demás. Después, si queda presupuesto automático y `COMPROMISOS_DE_CORREOS_ENABLED` ≠ `0`, lee los compromisos de hasta 10 correos enviados (Haiku 4.5) y los deja como propuestas de tarea (`lib/comunicaciones/compromisos-server.ts`). Un turno por hora; con el candado tomado, suelta el turno. Carga inicial: `scripts/sync-comunicaciones-de-hubspot.ts` (simulacro primero). Ver «Los correos, las notas y las llamadas de HubSpot» |
| `indice-de-reuniones` | cada hora, todos los días | — | parte en turnos las transcripciones de las reuniones con clientes y prospectos de los últimos 180 días que todavía no se partieron o cambiaron (`lib/busqueda/indexar-server.ts`), de a 60, para la búsqueda en las reuniones y el resumen antes de cada reunión. Solo escribe `TurnoDeReunion` y `ReunionIndexada`. Carga inicial: `scripts/indexar-reuniones.ts` (simulacro primero) |
| `negocios-abiertos` | cada hora de 6:00 a 20:00 CR, todos los días | — | copia los negocios ABIERTOS de los tres pipelines de venta propia a `NegocioAbierto` (dueño, empresa, fecha de cierre, monto, probabilidad, siguiente paso y actividad de HubSpot) y el dueño de cada empresa de Nexus a `Client.hubspotOwnerEmail`. «Para ti» de Ventas sale de esta copia. Después copia también las metas comerciales de HubSpot (`MetaComercial`, solo lectura; si fallan, no tumba la corrida). Lee además el siguiente paso de cada equipo (`siguiente_paso_*`) de los negocios y las empresas: lo que alguien escribió en HubSpot entra como tarea del sprint de ese equipo (desde el 2026-10-16 el siguiente paso es una tarea). Lo único que escribe en HubSpot es el siguiente paso: el de las cuentas cuyas tareas cambiaron en las últimas dos horas (hasta 40 cuentas) y lo que quedó sin escribirse (hasta 25 por corrida, 5 intentos cada uno; `lib/siguiente-paso/escritura-server.ts`). Un turno por hora; si otra corrida tiene el candado o la búsqueda trae menos de la mitad de lo conocido, suelta el turno y reintenta. Carga inicial: `scripts/sync-negocios-abiertos.ts` (simulacro primero) |
| `odoo-espejo-daily` | cada hora de 6:00 a 19:00 CR, todos los días (desde el 2026-10-21; antes una vez al día). Pasadas las 19 corre una sola vez más si el día no tuvo ninguna | `ODOO_PASSWORD` (contraseña o clave de API), `ODOO_LOGIN` si la clave no es de `direct`, y `ODOO_SYNC_ENABLED` ≠ `0` | espeja las facturas de Odoo (Nexus solo lee). Si la corrida falla, el job FALLA (rojo + Sentry); un rechazo de credenciales o una corrida parcial retiene **el día entero**, no solo la hora (`lastRunDateKey` = `AAAA-MM-DD·retenido`): 13 intentos por día superarían el bloqueo por IP de Odoo, que salta a los 10 (ver «El espejo de Odoo no corre»). Un fallo de red suelta la hora y reintenta en el tick siguiente. INV31 da rojo si la última corrida buena tiene más de 20 h |
| `mercury-espejo-daily` | cada hora de 6:00 a 19:00 CR, todos los días (desde el 2026-10-21), igual que la de Odoo | `MERCURY_API_TOKEN` (token «Read Only» de Mercury) y `MERCURY_SYNC_ENABLED` ≠ `0` | copia las facturas, los clientes y los movimientos de Mercury (Nexus solo lee: el token no puede escribir). Si falla, el job FALLA (rojo + Sentry); un token rechazado o una corrida parcial retiene el día entero (ver «La copia de Mercury no corre») |
| `tipo-cambio-daily` | ≥ 6:00 CR, una vez al día | `TIPO_CAMBIO_SYNC_ENABLED` ≠ `0`; `BCCR_TOKEN` opcional | trae la venta y la compra de referencia del BCCR del día a `TipoCambioDia` (con `BCCR_TOKEN`, del servicio del BCCR; sin él, del API de Hacienda). Si falta el histórico desde 2023 lo intenta en la misma corrida. FALLA (rojo + Sentry) si no quedó la tasa de hoy; un fallo pasajero suelta el turno. Primera carga del histórico: `scripts/traer-tipo-de-cambio.ts --apply` |
| `rentabilidad-foto-mensual` | día 3 ≥ 7:00 CR, una vez por mes | — | guarda la foto del margen del mes que cerró (`FotoMargenMes`, `FotoMargenCuenta`, escritor único `lib/rentabilidad/foto-server.ts`); no pisa una que ya existe; si falla, reintenta a la hora. Los meses que ya pasaron se llenan con `scripts/fotografiar-meses-del-margen.ts` (simulacro primero) |
| `rentabilidad-lectura-mensual` | día 4 ≥ 8:00 CR, una vez por mes (después de la foto) | el SQL `2026-10-18-rentabilidad-conectada.sql` | la lectura de los números de Rentabilidad (`lib/rentabilidad/lectura/servidor.ts`): el código detecta lo que no progresa (la solvencia, el margen de una cuenta, las horas sin facturar, la meta) y, si hay señales y queda presupuesto automático, una llamada a Claude propone qué hacer y cuánto invertir. Lo propuesto queda pendiente en `PropuestaDeRentabilidad` hasta que dirección lo usa o lo desestima. Medido: `AgentRun` con agentSlug `rentabilidad-lectura`. Si falla, suelta el turno y reintenta a la hora. A mano: «Leer los números» en Rentabilidad |
| `planilla-quincena-daily` | ≥ 6:00 CR, una vez al día | — | se asegura de que la quincena de planilla de hoy exista en el libro, con el salario que rige (`completarQuincenas`, PENDIENTE: pagarla la marca una persona). Re-generar no duplica nada. Las quincenas atrasadas no las crea solo: eso es «Completar las que faltan» en el historial de planilla |
| `licencias-renovacion-daily` | ≥ 7:00 CR, una vez al día | — | a 90, 60 y 30 días de cada renovación de licencias (HubSpot Partner + lo cargado a mano en la información del cliente), una alerta de «Renovación» en Éxito del cliente; una por cliente, fecha y umbral, con todos los hubs que renuevan ese día (hasta el 2026-10-16, una por hub). Absorbe la renovación que el vigía ya tenía abierta. Sin IA (`lib/cs/avisos-de-renovacion.ts`) |
| `adopcion-recordatorios-daily` | ≥ 7:00 CR, una vez al día | — | recuerda revisar la adopción: a los 30 días del inicio de un proyecto de CS, en la semana antes de su entrega y en la primera semana de cada mes en las cuentas recurrentes. Un aviso de «Para ti» al CSE del proyecto y a quien lleva el frente de Customer Success, que lleva a la pestaña Adopción. Cada momento tiene una ventana de 7 días: no es retroactivo. Sin IA (`lib/cs/recordatorios-de-adopcion.ts`) |
| `tareas-semana-lunes` | lunes ≥ 6:00 CR | — | Tareas internas: vence las propuestas (tareas y proyectos) que nadie decidió en 14 días, pasa a «Por asignar» lo abierto de quien se dio de baja (lo privado no) y muda al sprint de casa lo de quien cambió de área. Todo como `sistema`, con su evento; correrlo dos veces no cambia nada. Con `TAREAS_CIERRE_AUTOMATICO=1` en el `.env` (apagado por defecto), antes revisa como `sistema` la semana pasada de quien no la revisó: lo abierto pasa a esta semana y la persona lo corrige desde Mis tareas (`cerrarSemanaPasadaComoSistema`) |
| `ia-lotes` | cada tick (manda cada 5 min, mira los lotes cada 3) | el SQL `2026-10-18-gasto-de-ia.sql` | los pedidos a Claude que van por la API Batch, a mitad de precio (`lib/ai/lotes-server.ts`, tabla `PedidoEnLote`): hoy, el barrido del vigía para los proyectos que entran solo por riesgo. Junta los pendientes y los manda en un lote si queda presupuesto automático; cuando el lote termina, anota cada llamada en `LlmCall` con `lote = true` y le pasa la respuesta a su manejador. Un pedido sin respuesta en 26 h queda vencido. Una respuesta que no se pudo aplicar, o un vencido, hace FALLAR el job (rojo + Sentry). Volver atrás: `VIGIA_BARRIDO_POR_LOTE = false` en `lib/ai/ahorro.ts` |
| `titulos-cortos` | cada 10 minutos, todos los días | el SQL `2026-10-20-titulo-corto-de-la-tarea.sql` | el nombre corto de las tareas abiertas que no lo tienen o cuyo título cambió (`lib/tareas/ia/titulo-corto-server.ts`), de a 40 por pedido a Haiku y como mucho 5 pedidos por corrida; con eso «Para ti» y el calendario las nombran «Cayalá – Enviar propuesta a Marta \| Espacio interno». Escribe solo `Tarea.tituloCorto` y `tituloCortoDe` con SQL crudo (no toca `updatedAt` ni la `version`, para no despertar la sincronización con HubSpot) y deja un `AgentRun` por pedido. Sin nada que nombrar no llama a Claude; sin presupuesto automático espera; sin el SQL avisa en el log y no hace nada |
| `lo-pagado-daily` | cada hora de 7:00 a 19:00 CR (desde el 2026-10-21), después de las dos copias de esa hora (van antes en `allJobs()`, en el mismo tick); espera a una copia que no corrió bien hoy hasta las 10:00. También corre cuando alguien aprieta «Actualizar» en Conciliación, Cobranza › Odoo, Cobranza › Mercury, Integraciones o el punto de equilibrio, con el mismo candado (`lo-pagado-candado`, vence a los 10 minutos): nunca dos a la vez | `COBRO_SOLO_ENABLED` ≠ `0` y `ODOO_PASSWORD` o `MERCURY_API_TOKEN` | cobra solo lo que Odoo (`paid`) y Mercury (`Paid`, con su entrada de plata atada por el nombre) dan por pagado y conciliado con el banco, con el día real del pago, firmado `sistema:odoo` o `sistema:mercury` y con su bitácora (`lib/cobranza/libro`). Lo que no es seguro queda en Conciliación › «Lo pagado» con su porqué. FALLA (rojo + Sentry) si una copia no corrió bien hoy, si Odoo no dijo el día de los pagos o si una cuota no se pudo escribir; retiene esa hora y la siguiente vuelve a mirar (ver «Lo pagado no se cobró solo») |
| `invariants-daily` | ≥ 7:00 CR, una vez al día (después de los espejos) | — | corre los 37 invariantes solo-base (`lib/invariantes/`, B-07; INV38–43 son de Tareas internas; INV44, la lectura de cada reunión; INV45, los hechos de las reuniones; INV46, los pedidos fuera de alcance de una reunión de otro cliente; INV47, ninguna reunión de los últimos 14 días con texto y gente de fuera sin empresa más de 48 horas (no bloquea hasta su primer verde); INV49, que la última copia buena de Google Meet tenga menos de una hora); si alguno está en rojo el job FALLA a propósito: semáforo rojo + Sentry. Los que necesitan HubSpot o archivos siguen en `check-invariants.ts`, a mano |

⚠ Sin `CS_WATCHDOG_ENABLED` y `COBRANZA_CRON_ENABLED` en el `.env` cinco de estos no corren, y sin
`ODOO_PASSWORD` tampoco el espejo. Hasta el 2026-09-12 el semáforo los pintaba en gris («nunca
corrió»), igual que a un job que todavía no llegó a su hora; ahora dice **apagado** con el motivo, que
sale de la misma regla que usa `shouldRun` (`lib/jobs/requisitos.ts`).

⚠ **Desde el 2026-10-18 los jobs que gastan Claude miran el presupuesto automático del día antes de arrancar** (`quedaPresupuestoAutomatico`, 10 USD por día): el barrido y el debounce del vigía, marketing, `google-enrich-retry`, `tareas-sprint`, `seguimiento-reuniones` y el envío de `ia-lotes`. Sin presupuesto devuelven SIN_TURNO y lo intenta el tick siguiente (pasada la medianoche de Costa Rica, el día nuevo). Para destrabar un día: subir `PRESUPUESTO_IA_AUTOMATICO_USD_DIA` en el `.env` y `bash scripts/deploy.sh`. El gasto, el tope sugerido y los días que lo pasaron están en /integrations/gasto-ia.

**Disparos por navegación**, que no pasan por el scheduler:
- **Auto-sync de Google Meet** (desde U1, 2026-10-25, la VUELTA ATRÁS del job `google-meet-sync`: solo corre donde
  el job no corre — las PCs, o producción con `GOOGLE_MEET_SYNC_ENABLED=0`; donde el job corre, responde
  `{ skipped: true, reason: "job" }` sin tocar nada): `POST /api/integrations/google/auto-sync` al cargar el shell
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
- **Calendario de la exploración al abrir** (desde la etapa A de la memoria de la cuenta): al abrir el lienzo de una
  exploración, como mucho cada 10 minutos por exploración (el sello va en la foto de la exploración, como el de las
  reuniones de HubSpot), relee hasta 5 eventos de Google Calendar unidos a sus sesiones, de los que empiezan entre ayer
  y dentro de 6 semanas (`events.get`, solo lectura, con el permiso de siempre: `calendar.readonly`). Lee el calendario
  de quien unió cada sesión (el servidor lo fija al unirla: la pantalla no lo puede cambiar). Si un evento se movió, la
  sesión toma la fecha nueva; si se canceló, lo marca. Solo escribe lo de un evento que sigue teniendo a alguien de la
  empresa invitado. Nunca
  corre la sincronización de Meet ni le ensancha el `timeMax`.

### La lectura de cada reunión (memoria de la cuenta, desde la etapa 2)

> **Estado (2026-10-10): en el código, SIN desplegar y con el SQL sin aplicar.** Hasta el deploy, en producción cada
> reunión la sigue leyendo el post-proceso de antes, que dispara y olvida y escribe `ActionItem`.

El enriquecimiento de Meet solo encola cada reunión con un cliente o un prospecto (de 14 días o menos, con
transcripción y que no es de puertas adentro), y el job `seguimiento-reuniones` la lee (`lib/lecturas`, DECISIONS «La
lectura de cada reunión es durable…»): cada tick toma 2 lecturas con un update condicional, con 420 s de tope cada una;
el tope corta la lectura (si no terminó ni 60 s después, la fila queda `leyendo` y la rescata la regla de colgada). Una
colgada más de 15 min vuelve a la cola, y un error se reintenta a los 5 y a los 30 minutos y a la tercera queda en
`error` (también la tercera vez que se cuelga): ese tick el job falla (rojo + Sentry, con el id de la reunión). Sin
presupuesto automático no toma nada, aunque la guardia esté solo en aviso. ⚠ Un tick con una lectura larga traba al
scheduler hasta 8 minutos (corre los jobs en serie). La cola es `LecturaDeReunion`, la misma fila que usa Tareas, con
su propio estado en `seguimientoEstado` (`en_espera`, `leyendo`, `lista`, `sin_texto`, `copia`, `error`, `omitida`).
Después de sus lecturas, el job vincula a su proyecto las reuniones que la lectura no toma (el clasificador; una que no
se pudo vincular no se reintenta en 24 h). INV44 da rojo si una reunión de 14 días o menos con transcripción no tiene su
lectura (o su minuta) a las 24 h; INV46, si un pedido fuera de alcance quedó en un cliente que no es el dueño de su
reunión. «Generar minuta» (en la minuta del proyecto) y «Leer esta reunión» (en la página de una reunión sin minuta)
leen YA por la misma cola (409 si ya se está leyendo), y «Leer una reunión» de Tareas también, si la reunión espera en
la cola.

- **Antes del deploy que la trae:** el SQL de la lectura de seguimiento, después del de Tareas:
  `$env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-10-lectura-de-seguimiento.sql; Remove-Item Env:ALLOW_PROD_WRITE`,
  después `npx prisma generate` y `npm run check:esquema` en verde. Sin el SQL, `/api/health` responde 503 y el deploy
  se revierte solo.
- **Lo recomendado: correr el ensayo de abajo ANTES del deploy y desplegarla prendida.** ⚠ Con
  `SEGUIMIENTO_REUNIONES_ENABLED=0` el deploy NO deja todo como antes: el post-proceso de antes escribe `ActionItem`,
  pero los «Pendientes» del Resumen, «Para ti», la página de la reunión y el vigía ya leen Tareas, así que los
  compromisos de las reuniones nuevas no se ven en ninguna pantalla hasta prenderla (la minuta sí se ve). Desplegar con
  la bandera en 0 solo sirve como retroceso de emergencia (ver «Para volver atrás»), no como paso previo.
- **Antes de prenderla:** `npx tsx scripts/comparar-lectura-de-reuniones.ts`, desde una PC. Solo lee la base (la
  conexión nace de solo lectura), llama a Claude unas 20 veces (≈US$1,6) y compara las minutas nuevas con las viejas,
  con las citas verificadas y descartadas. Prenderla = sacar la variable del `.env` y `bash scripts/deploy.sh`.
- **Justo después del deploy:** las reuniones frescas que se enriquecieron ANTES de que existiera la cola no tienen fila
  e INV44 las reclama (medido el 2026-10-10: 6 de 92 sin minuta). Desde una PC: `npx tsx
  scripts/encolar-lecturas-pendientes.ts` (en seco: lista lo que encolaría y por qué no entra el resto) y después
  `$env:ALLOW_PROD_WRITE="1"; npx tsx scripts/encolar-lecturas-pendientes.ts --apply; Remove-Item Env:ALLOW_PROD_WRITE`
  (respalda `LecturaDeReunion` con pg_dump; sin pg_dump, `SIN_RESPALDO=1`). Solo encola: las lee el job, de a 2 por
  minuto y con presupuesto automático.
- **Después:** el semáforo de Integraciones con «La lectura de cada reunión» en verde, INV44 en verde cuando el job
  terminó lo encolado (con presupuesto, de a 2 por minuto), y el costo por reunión en `LlmCall`: las llamadas de cada
  reunión llevan `origen = "reunion:<sessionId> › <sitio>"` (sumar por reunión con `split_part(origen, ' ', 1)`).
- **Las reuniones con solo notas de Gemini (T2, 2026-10-24):** se leen enteras, como una transcripción (minuta,
  compromisos y pedidos; la corrida guarda `fuente: "notas"`). `SEGUIMIENTO_SOLO_NOTAS=0` es la vuelta atrás (vuelven a
  dejar solo sus hechos). Justo después del deploy que lo trae, las frescas que ya quedaron `sin_texto` se vuelven a
  encolar con el mismo `scripts/encolar-lecturas-pendientes.ts` (en seco primero; medido el 2026-10-24: 39). ⚠ Desde el
  deploy hasta que el job las lea, INV44 da rojo con esas reuniones (ahora también espera las de solo notas): es esperado.
- **Lo atrasado, el modo de recuperación (T2):** las reuniones de MÁS de 14 días con texto y sin minuta se leen por
  lote (API Batch, mitad de precio): minuta y temas, sin propuestas de Tarea, pedidos fuera de alcance ni lo que sigue,
  y sin tocar `LecturaDeReunion`. Fuera del presupuesto automático: el gasto se anota a nombre de quien la corre y cuenta en el presupuesto HUMANO del día (el que comparte todo el equipo, US$20). En seco primero:
  `npx tsx scripts/encolar-lecturas-pendientes.ts --recuperacion --desde 2026-07-26 --limite 10` (lista y costo
  estimado); después, `$env:ALLOW_PROD_WRITE="1"; npx tsx scripts/encolar-lecturas-pendientes.ts --recuperacion --desde
  2026-07-26 --limite 10 --por <correo> --desplegado --apply; Remove-Item Env:ALLOW_PROD_WRITE` (respalda `PedidoEnLote`).
  ⚠ SOLO después del deploy que la trae (por eso `--desplegado`): con el código viejo, el job `ia-lotes` mandaría los
  pedidos contra el presupuesto automático y los tiraría al volver, pagados. `--por` tiene que ser alguien del equipo. Una
  reunión cuyo pedido volvió sin minuta se puede volver a mandar en otra corrida; a los 3 intentos, no. Tope: 100
  por corrida. El job `ia-lotes` las manda a los 5 minutos y deja cada minuta cuando Anthropic responde. Se mide en
  `PedidoEnLote` (`tipo = 'lectura-recuperacion'`, por `estado`) y en `LlmCall` (`origen = 'lotes › lectura-recuperacion'`,
  `lote = true`). Vuelta atrás: `LECTURA_DE_RECUPERACION=0` en el `.env` del servidor (lo que espera no se manda; lo
  leído queda).
- **Una reunión en `error`:** el error queda en `LecturaDeReunion.seguimientoError`; se vuelve a leer con «Leer esta
  reunión» en su página (`/sessions/<id>`, si no tiene minuta), o con `scripts/encolar-lecturas-pendientes.ts --sesion
  <id>` (sin el corte de 14 días). Varias a la vez: `--tambien-errores`. No hace falta tocar la base a mano.
- **Si a una reunión ya leída le cambian el dueño:** no se vuelve a leer. Lo que dejó para el dueño anterior se corrige
  a mano: las propuestas de Tarea las muestra INV42 (se desestiman o se cambia su cliente desde Tareas) y los pedidos
  fuera de alcance, INV46 (se descartan en «Fuera de alcance» del cliente equivocado). Sus HECHOS vivos (etapa 6) se
  retiran solos, firmados por el sistema con «La reunión cambió de dueño»: lo pendiente queda desestimado, la alerta de
  queja que sostenían se cierra, los campos que la reunión propuso salen de la propuesta de la ficha y la etapa
  sugerida que salió de ella se borra. El job vuelve a pedir los hechos en el cliente nuevo. Lo que no se pudo retirar
  sigue vivo y lo muestra INV45 (remedio: `scripts/hechos-fuera-de-su-cliente.ts`, abajo). Lo usado no se toca.
- **Para volver atrás:** `SEGUIMIENTO_REUNIONES_ENABLED=0` en el `.env` del VPS y `bash scripts/deploy.sh` (recrea el
  contenedor con el `.env` nuevo). Vuelve al post-proceso viejo (`lib/sessions/post-process-viejo.ts`), que dispara y
  olvida y escribe `ActionItem`. Es un retroceso de emergencia: los «Pendientes» del Resumen, «Para ti», la página de
  la reunión y el vigía leen Tareas (la segunda parte de la etapa 2), así que las `ActionItem` que se creen en ese modo
  no se ven en ninguna pantalla. Las filas que quedaron en la cola esperan hasta que se vuelva a prender.
- **`ActionItem`, lo histórico:** nada lo crea (lo vigila `lib/sessions/action-item-retirado.test.ts`); `POST
  /api/action-items` responde 410 y la copia de pendientes de `/analyze` no escribe. Las filas viejas siguen en la base,
  sin borrar; PATCH y DELETE de `/api/action-items/[id]` se quedan para ellas.

### El sondeo de hechos y la bandera `SEGUIMIENTO_HECHOS` (memoria de la cuenta, etapas 5 y 6)

> **Estado (2026-10-10): el sondeo (etapa 5) ya está en el código y nadie lo corrió todavía. La etapa 6 entera (la
> lectura de hechos, el enrutador, el detector de la queja, INV45 y las novedades en pantalla) está en el código,
> APAGADA, con su SQL sin aplicar.**

- **El sondeo no se despliega.** Se corre desde una PC con
  `npx tsx scripts/sondeo-de-hechos.ts --por <tu correo>` (sin `--por` no arranca), sin `ALLOW_PROD_WRITE`: elige las
  reuniones con una conexión de solo lectura y no escribe en la base. Lee unas 30 reuniones recientes de clientes con
  transcripción (sin Wherex, internas ni aliadas; como mucho 3 por cliente; `--notas N` y `--prospectos N` suman
  reuniones con solo notas y de prospectos) y llama a Claude contra el presupuesto humano, con el correo de `--por`
  (≈US$3,5); la única fila que queda es la telemetría de `LlmCall`. Con `--solo-elegir` muestra la lista sin llamar a
  Claude. El resultado queda en `backups/<fecha>-sondeo-de-hechos/`: un `.md` por reunión con cada hecho, su cita y su
  destino, un `resumen.md` (el costo de cada variante, la proyección al mes y las citas descartadas) y un `sondeo.json`.
  ⚠ Lleva citas de reuniones de clientes: no sale de la PC. Con eso se eligen la variante y el modelo (DECISIONS
  «Hechos, enrutador y novedades»).
- **La bandera `SEGUIMIENTO_HECHOS` está apagada por defecto**: sin la variable (o con cualquier valor que no sea
  `1`), la lectura de hechos no corre y la lectura de cada reunión sigue exactamente como antes (su avance, su ficha y su
  etapa de siempre). La etapa 6 se despliega así y se prende después de mirar el sondeo.
- **⚠ El SQL va ANTES del deploy que trae el modelo, aunque la bandera quede apagada:** el cliente de Prisma ya conoce
  `HechoDeReunion`, y sin la tabla `/api/health` responde 503 y el deploy se revierte solo. Va después de
  `2026-10-09-tareas.sql` (la FK a `LecturaDeReunion`); no depende de `2026-10-10-lectura-de-seguimiento.sql`, así que
  sirve el orden en que los lista `npm run check:esquema` (por nombre: este primero):
  `$env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-10-hechos-de-reunion.sql; Remove-Item Env:ALLOW_PROD_WRITE`,
  y `npm run check:esquema` en verde.
- **Para prenderla:** con el SQL aplicado y el código desplegado, `SEGUIMIENTO_HECHOS=1` en el `.env` del VPS y
  `bash scripts/deploy.sh` (recrea el contenedor con el `.env` nuevo). Sin la tabla, aunque la bandera esté prendida,
  nada corre (`hechosDisponible`).
- **Qué cambia al prenderla:** cada reunión leída deja sus hechos (`HechoDeReunion`, corrida «seguimiento-hechos», unos
  US$0,03–0,06 por reunión con Sonnet 4.6); la ficha se propone desde los hechos (no relee la reunión); el avance y la
  etapa corren solo con una señal (el avance, para cada proyecto vinculado que cumple `linkFeedsAvance`); la queja que
  dijo el cliente (comprobado por su turno en la transcripción) levanta una alerta, y el riesgo y la queja sin comprobar
  van al vigía, que suma la sección «Riesgos de reuniones recientes sin alerta» y toma esos proyectos en el barrido; se
  leen también las reuniones con solo notas; los hechos entran a la memoria interna de los agentes; y aparecen las
  novedades: el número en el riel, la franja arriba del documento, el renglón en «Qué sigue», los hechos en la tarjeta
  de la reunión, el aviso «Volver a mapear» en Procesos y su cuenta en «Lo que dejaron tus reuniones» de «Para ti».
  «Uso de Nexus» los cuenta leyendo la tabla: si después se apaga la bandera, sigue contando los que ya se escribieron.
  Apagada, nada de eso se ve ni le llega a ningún agente (ni hace
  un pedido de más: el listado de piezas trae 0 novedades y la pantalla no pide el detalle).
- **Una lectura de hechos que falla** queda en su corrida (`AgentRun` con `agentSlug = 'seguimiento-hechos'`, en
  ERROR); el job `seguimiento-reuniones` la reintenta (2 por tick, hasta 3 veces por reunión y dueño; los dueños se
  miran en una sola consulta por tick). Si la lectura de hechos no queda lista (falla o se omite), el avance, la ficha y
  la etapa de esa reunión corren por el camino de siempre; si después el reintento la lee, los vuelve a proponer.
- **Una reunión leída solo con las notas que después recibe su transcripción** se vuelve a leer con la transcripción
  (lo vivo de la lectura de las notas queda desestimado con «Se volvió a leer con la transcripción»).
- **INV45 en rojo** (un hecho vivo que no es del cliente de su reunión): revisar el dueño de la reunión en /sessions y
  corregirlo si está mal (al cambiar de dueño los hechos se retiran solos). Si está bien, desde una PC:
  `npx tsx scripts/hechos-fuera-de-su-cliente.ts` (simulacro, solo lee) y, revisado,
  `$env:ALLOW_PROD_WRITE="1"; npx tsx scripts/hechos-fuera-de-su-cliente.ts --apply; Remove-Item Env:ALLOW_PROD_WRITE`:
  retira esos hechos de su módulo (la alerta, la propuesta de la ficha, la etapa) y los desestima con la nota de por
  qué. Respalda antes `HechoDeReunion`, `CsAlert`, `Client` y `Project` (pide `pg_dump`).
- **Para apagarla otra vez:** sacar la variable (o `SEGUIMIENTO_HECHOS=0`) y `bash scripts/deploy.sh`. Los hechos que ya
  se escribieron quedan en la base, pero dejan de verse y de llegarle a los agentes (la memoria y el vigía); nada nuevo
  los escribe. Un cambio de dueño los sigue corrigiendo aunque la bandera esté apagada.

### Los correos, las notas y las llamadas de HubSpot (iniciativa B, 2026-10-18)

La copia de solo lectura de los correos, las notas y las llamadas de las empresas de Nexus (`ComunicacionDeHubspot`,
job `comunicaciones-hubspot`) y la lectura de los compromisos de los correos enviados (DECISIONS «Los correos y el
timeline de HubSpot, en el contexto de la cuenta»; plan en docs/correos-en-el-contexto-plan.md).

1. **Antes del deploy**, desde una PC: `$env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-18-comunicaciones-de-hubspot.sql; Remove-Item Env:ALLOW_PROD_WRITE`
   y `npm run check:esquema` en verde. Sin el SQL, `/api/health` responde 503 y el deploy se revierte solo.
2. **Simulacro** (solo lee, no necesita el SQL): `npx tsx scripts/sync-comunicaciones-de-hubspot.ts`. Dice cuántas
   comunicaciones quedarían por cliente (sin Wherex), cuántas son de dos clientes (no se guardan) y cuánto costaría leer
   los compromisos al mes.
3. **Carga inicial** (después del SQL): `$env:ALLOW_PROD_WRITE="1"; npx tsx scripts/sync-comunicaciones-de-hubspot.ts --apply; Remove-Item Env:ALLOW_PROD_WRITE`.
   Respalda `ComunicacionDeHubspot` y `CronJobState`. De ahí en adelante, el job cada hora.
4. **Los correos dicen «sin permiso»**: la app de HubSpot no tiene `sales-email-read`. Para leerlos: declarar
   `sales-email-read` y `crm.objects.emails.read` como «Opcional» en la app pública, sumarlos a
   `HUBSPOT_SCOPES_OPCIONALES_EXTRA` en el `.env`, `bash scripts/deploy.sh` y reconectar HubSpot desde Integraciones. La
   corrida siguiente trae los correos de 120 días.
5. **Apagar**: `COMUNICACIONES_HUBSPOT_ENABLED=0` apaga la copia (y con ella todo); `COMPROMISOS_DE_CORREOS_ENABLED=0`
   apaga solo la lectura de compromisos (sin IA). Las dos piden `bash scripts/deploy.sh` para que el contenedor lea el
   `.env` nuevo.
6. **Un correo en `error`**: el job lo reintenta hasta 3 veces (`ComunicacionDeHubspot.compromisosError` dice por qué).
   Para volver a leerlo: `compromisosEstado = 'pendiente'` y `compromisosIntentos = 0` en esa fila (escritura a
   producción: la hace una persona). Una lectura colgada más de 15 minutos vuelve sola a la cola.
7. **El punto de partida** vive en `CronJobState` («comunicaciones-hubspot-cursor», ms por tipo). Para releer los 120
   días: borrar esa fila (la corrida siguiente vuelve a leer todo; no duplica nada: el único es por tipo e id de HubSpot).

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
  (hasta 5 por tick), que **gastan API de Anthropic**. Desde el 2026-10-24 esta bandera ya NO hace que la
  copia de Partner cree clientes: eso pide su propia bandera, `CS_PARTNER_CREA_CLIENTES=1`
  (`partnerCreaClientes`), apagada también en producción (crear clientes solo es lo que en julio rompió la
  atribución de reuniones, D-07). El vigía se apaga sin deploy con `CsSettings.watchdogEnabled`.
  Desde el 2026-10-10 el vigía lee además la memoria de la cuenta y del proyecto (la ficha, los procesos,
  la historia, lo fuera de alcance, la preventa, la auditoría, las desviaciones y los hechos): como mucho
  unos 9.000 caracteres más por proyecto en cada corrida, con fichas sin confirmar mucho menos.

El permiso `crm.objects.partner-clients.read` ya está concedido. Al día siguiente, Integraciones › Jobs
del servidor tiene que mostrar los jobs en verde; si dicen **apagado**, nombran la variable que falta.
Para no esperar a las 6:00: «Actualizar partner» y «Actualizar señales» en Éxito del cliente.

### Cerrar las alertas sueltas (fase 1.2, una vez, 2026-10-16)

Desde ese deploy el vigía tiene UNA alerta por cuenta (o proyecto) y categoría, y la ficha del cliente muestra la lectura
de la cuenta (DECISIONS «Nexus, el sistema de trabajo de cada cuenta», fase 1.2). Las abiertas de antes se cierran en
bloque, firmadas por el sistema: lo que el vigía siga viendo lo vuelve a abrir, ya con la llave nueva.

1. Con el deploy de la fase 1.2 ya en producción: antes, el vigía las volvería a crear con la llave vieja.
2. Desde una PC, en simulacro (solo lee): `npx tsx scripts/cerrar-alertas-sueltas.ts`. Dice cuántas se cierran, por
   categoría y por cuenta, y cuántas quedan (los avisos de renovación de la regla, lo de la lectura de reuniones y las
   quejas y los retrasos con la frase verificada). Medido el 2026-10-16: 131 de 155, en 27 cuentas.
3. Aplicar: `$env:ALLOW_PROD_WRITE="1"; npx tsx scripts/cerrar-alertas-sueltas.ts --apply; Remove-Item Env:ALLOW_PROD_WRITE`.
   Respalda antes `CsAlert` (pg_dump en el PATH o `SIN_RESPALDO=1` a sabiendas). Correrlo otra vez no cambia nada.
4. Los avisos de renovación por hub los cierra la regla en su corrida siguiente (≥ 7:00 CR) y deja uno por fecha.
5. Deshacer: las cerradas llevan la nota «Se cerró al pasar a la lectura de la cuenta (2026-10-16)…»; volver a abrir
   esas filas (`status` OPEN, sin `resolvedAt`, `resolvedByEmail` ni `resolutionNote`) o restaurar el respaldo.

### Preguntas sobre la cuenta (2026-10-13)

Al entrar a un cliente, Nexus le pregunta a cada CSE y CSL si el cliente tiene apertura a la asesoría (DECISIONS
«Preguntas sobre la cuenta»). Nace activa. Antes del deploy que la trae, desde una PC:
`$env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-13-preguntas-sobre-la-cuenta.sql; Remove-Item Env:ALLOW_PROD_WRITE`
y `npm run check:esquema` en verde (sin el SQL, `/api/health` responde 503 y el deploy se revierte). Se pausa sin deploy
desde Feedback › Encuestas › Sobre los clientes; ahí mismo se descargan todas las respuestas en CSV.

### Cuándo se presenta cada documento (2026-10-14)

La pregunta «¿Cuándo lo presentas?» del kickoff, el diagnóstico, la planificación y la entrega (DECISIONS «Cuándo se
presenta cada documento»). El SQL `scripts/sql/2026-10-14-presentaciones-de-documentos.sql` ya está aplicado en
producción (2026-10-14; `npm run check:esquema` en verde). Después del deploy, desde una PC, pasar a la tabla lo que haya
quedado en el Json viejo del diagnóstico (el código de antes lo siguió escribiendo hasta el deploy):
`npx tsx scripts/migrar-presentacion-del-diagnostico.ts` (simulacro) y, si lista algo,
`$env:ALLOW_PROD_WRITE="1"; npx tsx scripts/migrar-presentacion-del-diagnostico.ts --apply; Remove-Item Env:ALLOW_PROD_WRITE`
(respalda `PresentacionDeDocumento`; sin pg_dump, `SIN_RESPALDO=1`). Correrlo dos veces no duplica.

### Migrar «CSE Encargado» en HubSpot (una vez, 2026-10-09)

Desde el 2026-10-09 el espejo de proyectos lee primero «CSE Encargado» (`cse_encargado`) y, si está vacío,
«CSL Encargado» (`csl_encargado`), que es donde vivía el CSE (DECISIONS §La cartera de la CSL). La migración
lo deja como decidió Elías: «CSE Encargado» = el CSE, «CSL Encargado» = la CSL, en los proyectos de
implementación, sus empresas y sus contactos. Escribe solo en HubSpot.

1. Con el deploy que trae la lectura nueva ya en producción.
2. Alguien con acceso de administrador revisa en HubSpot si algún workflow, reporte o vista usa «CSL
   Encargado» de los proyectos: después de migrar dice la CSL, no el CSE.
3. Desde una PC, en seco (solo lee): `npx tsx scripts/migrar-cse-encargado.ts`. Tiene que decir que ningún
   proyecto cambia de encargado (si alguno cambiaría, el script no escribe nada).
4. Con `--apply`: `$env:ALLOW_PROD_WRITE="1"; npx tsx scripts/migrar-cse-encargado.ts --apply`.
5. El sync de proyectos de cada cliente lo trae a Nexus (al abrir la ficha, o el automático).

### Congelar los handoffs que ya existían (etapa 3b, una vez)

El handoff se congela solo la primera vez que se aplica el cronograma que propone, o con «Congelar» (DECISIONS «El
handoff se congela»). Los handoffs de antes quedan sin congelar hasta que Elías decida. Sin SQL: usa las tablas del
estado del documento (`scripts/sql/2026-10-02-estado-del-documento.sql`, ya aplicado; `npm run check:esquema` lo dice).

1. Con el deploy que trae el congelado ya en producción: el código de antes no lee el hito y seguiría regenerando
   esos handoffs.
2. Desde una PC, en simulacro (solo lee): `npx tsx scripts/congelar-handoffs-aplicados.ts`. Lista el grupo A (con una
   propuesta del handoff aplicada) y el B (el cronograma lo creó el handoff directo), y lo que queda fuera (Wherex, ya
   congelados, sin documento, sin cronograma del handoff).
3. Para congelar el grupo A: `$env:ALLOW_PROD_WRITE="1"; npx tsx scripts/congelar-handoffs-aplicados.ts --apply`. Con
   `--tambien-creados` suma el B. Respalda antes `HitoDeDocumento` y `VersionDeDocumento` (pg_dump en el PATH o
   `SIN_RESPALDO=1` a sabiendas). Correrlo otra vez no cambia nada.
4. Deshacer un congelado: no hay botón. El hito es una fila de `HitoDeDocumento` (tipo «congelado», con el texto
   «Al ordenar los handoffs que ya tenían su cronograma aplicado»); borrarla deja el handoff sin congelar. La foto
   protegida puede quedarse.

### Migrar las reuniones de los documentos (etapa 7, una vez, 2026-10-10)

Desde la etapa 7 los seis documentos del proyecto leen solo las reuniones elegidas, y nadie eligió nunca: sin esto,
regenerar un documento lo deja sin reuniones (DECISIONS «Los documentos leen la memoria y solo las reuniones elegidas»
› «La migración (2026-10-10)»). El script elige, en cada documento que ya tiene contenido, las 6 reuniones más
recientes que leía con la regla de antes y que tienen algo que leer (solo donde nadie decidió nada), y pasa a sesión,
en las exploraciones de un proyecto y en las preventas de clientes, las reuniones de Meet que el agente ya leyó. El
kickoff y las integraciones generados antes del 2026-10-07 no se migran: entonces no leían reuniones. Sin SQL propio.

**Cuándo:** una sola ventana, justo después de aplicar los SQL de la memoria de la cuenta y antes del deploy, antes de
que alguien regenere un documento. Las sesiones nuevas de la parte B solo se ven con el código de la etapa A
desplegado; la parte A sirve igual con el código viejo (que lee también lo sugerido).

⚠ **Lo que congela:** un `true` le pone el candado a la reunión entera: el clasificador ya no la reasigna a un
proyecto nuevo del cliente. El simulacro dice cuántas reuniones quedan así antes de escribir (el 10-oct, 36).

1. Desde una PC, en simulacro (solo lee): `npx tsx scripts/migrar-reuniones-de-los-documentos.ts`. Imprime, por
   documento, cuántas reuniones leía, cuántas se eligen, cuántas quedan para sugerir y cuántas se saltaron por vacías;
   el total de vínculos, cuántas reuniones dejan de reclasificarse y, por exploración, qué reunión pasa a sesión y por
   qué no las demás. `--proyecto <id>` para uno solo; `--tambien-los-que-no-leian` incluye el kickoff y las
   integraciones de antes del 2026-10-07 (solo si Elías lo decide).
2. Aplicar: `$env:ALLOW_PROD_WRITE="1"; npx tsx scripts/migrar-reuniones-de-los-documentos.ts --apply --firma tu@smarteamcr.com; Remove-Item Env:ALLOW_PROD_WRITE`.
   Respalda antes `SessionProject`, `ExploracionDeVenta` y `CronJobState` (pg_dump en el PATH o `SIN_RESPALDO=1` a
   sabiendas) y deja las filas que toca en `backups/<fecha>-migrar-reuniones-de-los-documentos/antes.<hora>.json`. Lo
   migrado queda anotado en `CronJobState` («migrar-reuniones-de-los-documentos»): una corrida siguiente no vuelve a
   tocar ese documento ni esa exploración, aunque alguien lo haya deshecho en el medio.
3. Deshacer: el JSON «antes» lista cada vínculo y en qué columnas se escribió `true`; volver esas columnas a `null`
   (solo las de ese JSON). Las sesiones nuevas de una exploración se sacan desde su página de inicio («Sacar»), o se
   devuelve la fila del JSON: `contenido`, `propuesta`, `areas`, `edicion`, `perfilCierre`, `perfilDespues` y
   `responsableEmail` (la mutación reescribe todas, normalizadas). Si se deshace para volver a migrar, borrar también
   la fila `migrar-reuniones-de-los-documentos` de `CronJobState` (o devolverle `marcaAntes` del JSON).

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
- ⭐ Desde el **2026-10-21** el botón, después de copiar, **cobra lo pagado** (lo mismo que `lo-pagado-daily`, firmado
  por el sistema) y el aviso dice cuántas cuotas quedaron cobradas. Antes solo copiaba y «parecía no funcionar»: la
  factura conciliada llegaba pagada y la cuota seguía sin cobrar hasta el día siguiente.

**Cuánto pesa correr cada hora** (2026-10-21): la copia de Odoo tarda ~8 s, la de Mercury ~3 s y el cobro ~6 s en
simulacro (39 s medidos en la corrida de las 7:00 del 21 oct). Corren dentro del tick del único proceso (Invariante
#1), uno detrás de otro y con el pool de la app: no abren conexiones aparte ni suman slots del pooler (Invariante #3).
Son 14 copias de cada una por día; Odoo y Mercury no cobran por llamada.

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
   - **Esperar**: la corrida de mañana, desde las 6:00 CR, lo toma sola. Desde que corre cada hora (2026-10-21) el
     retenido cierra el día entero: la fila dice `lastRunDateKey = 'AAAA-MM-DD·retenido'`.
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

### Lo pagado no se cobró solo

Desde el 2026-10-18 el job `lo-pagado-daily` cobra lo pagado y conciliado (DECISIONS «Lo pagado se cobra solo»); desde
el 2026-10-21, cada hora de 7:00 a 19:00 y cada vez que alguien aprieta «Actualizar» (DECISIONS «Lo conciliado en Odoo
se ve en la hora»). Integraciones › Jobs del servidor dice si está **apagado** o si **falló**, con el motivo.

0. **«Lo pagado ya se estaba cobrando en este momento»** durante más de un minuto: el proceso murió con el candado
   puesto, y **vence solo a los 10 minutos**. Para no esperar (escritura a producción; la hace una persona):
   `UPDATE "CronJobState" SET "lastRunAt" = NULL WHERE id = 'lo-pagado-candado';`
1. **«la copia de Odoo (o Mercury) no corrió bien hoy»**: lo de esa copia no se cobró. Arreglar la copia (ver arriba);
   la hora siguiente el job lo cobra. Para no esperar, «Actualizar desde Odoo y Mercury» en Conciliación copia y cobra.
2. **«Odoo no contestó al pedirle el día de los pagos»**: lo de Odoo queda para la hora siguiente; lo de Mercury se cobró.
3. **Una cuota «no se pudo escribir»**: el motivo lo dice (un número de factura que ya está en otra cuenta, INV33). Se
   arregla en Cobranza y se confirma a mano en «Lo pagado».
4. **Para ver qué cobraría hoy, sin escribir:** `npx tsx scripts/cobrar-lo-pagado.ts` (simulacro, solo lectura).
5. **Para apagarlo:** `COBRO_SOLO_ENABLED=0` en el `.env` del VPS y `bash scripts/deploy.sh`. Lo pagado vuelve a
   confirmarse a mano.
6. **Si cobró algo que no entró:** abrir el cobro en Cobranza y «Sacar de Cobrado» con el motivo. El sistema no lo vuelve
   a cobrar solo. INV25 avisa si un cobro firmado por el sistema ya no tiene su factura pagada en la copia.

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

**Cuándo NO fusiona** (lo dice el simulacro y no escribe nada): si las dos tienen una exploración de venta abierta (se
archiva una); si las dos tienen cuenta de HubSpot propia y la de la absorbida tiene conocimiento o auditorías colgados
(borrarla se los llevaría: se decide a mano a qué cuenta pasan); y si una solicitud fuera de alcance que choca está
decidida en las dos fichas (se elige a mano con cuál se queda).

**Lo que choca con un único** (notas de etapa, asignaciones, solicitudes fuera de alcance, licencias): queda la de la que
sigue, salvo donde hay una decisión humana. Una solicitud que alguien decidió en la absorbida (confirmada, cotizada,
descartada…) le gana a una sin decidir de la que sigue; una licencia de la que sigue toma de la otra lo que le falta
(plan, fechas, monto, moneda) y junta las notas, y si un dato es distinto en las dos queda el de la que sigue y el
simulacro lo avisa. La clasificación de la cartera se pliega igual: la que sigue toma de la otra lo que no tiene
confirmado. Las correcciones del color se mudan enteras: el estado es el último evento de cada clase, así que una
corrección o un «en espera» de la absorbida más nuevo le gana a la de la que sigue (regla pendiente de confirmar con
Elías).

**Tareas:** las tareas, sus proyectos y sus vínculos se mudan; la foto de cada semana (`ResultadoDeSemana.fotoCliente`)
se queda con el id de la absorbida a propósito (el pasado no cambia), así que lo hecho de la absorbida no aparece en
«Tareas internas por cliente» de la que sigue. El simulacro cuenta cuántas fotos quedan así.

**Deshacer.** El JSON «antes» tiene las dos fichas y las dos cuentas enteras, lo que se borra entero (las notas de etapa,
asignaciones, solicitudes y licencias que chocaban, con su fila de la que sigue cuando se reemplazó o se completó, lo uno
a uno que ya tenía la que sigue, con la clasificación de la absorbida) y el id de cada fila que se mudó; el «despues», qué quedó.

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


### Después del deploy de la primera tanda (17 oct: fichas A, B y C)

Los SQL ya están aplicados (`2026-10-17-ficha-a-sprints.sql` y `2026-10-17-ficha-b-versiones-de-la-escala.sql`). Desde
una PC, en este orden, cada script primero en simulacro:

1. `npx tsx scripts/medir-transcripciones-faltantes.ts`: cuántas reuniones no tienen transcripción y por qué (solo lee).
2. `npx tsx scripts/limpiar-analisis-de-otra-reunion.ts`, y con `ALLOW_PROD_WRITE=1 … --apply --ya-desplegado`: vacía
   los textos de otra reunión y borra lo que dejaron. Respalda antes.
3. Regenerar los handoffs que lista la sección C del simulacro (RC Inmobiliaria, AMC, DISTELSA, Grupo Printer, REMPRO,
   Teamnet): si están congelados, «Rehacer desde cero» con el motivo «Leyó el texto de otra reunión».
4. `npx tsx scripts/recuperar-transcripts-meet.ts --solo-antes-de-terminar`, y con
   `--apply --deploy-confirmado --solo-antes-de-terminar --limit 300`: vuelve a leer las reuniones que Nexus leyó antes
   de que terminaran.
5. `npx tsx scripts/guardar-primera-version-de-la-escala.ts`, y con `--apply`: la primera versión de la escala de cada
   exploración con niveles confirmados (7 el 17 oct).

### Después del deploy de la segunda tanda (17 oct: fichas D a H)

Los cinco SQL ya están aplicados. Además:

1. La primera sync de Meet después del deploy guarda la descripción de la invitación en las reuniones de los últimos 30
   días que la tengan (un UPDATE por reunión, una sola vez).
2. SmartLoop: con el plan de FACO pasado a JSON (la forma está en `scripts/data/propuesta-smartloop.ejemplo.json`),
   `npx tsx scripts/cargar-propuesta-en-ciclo.ts --proyecto <id de «FACO · SmartLoop (prueba)»> --archivo <faco.json> --por <correo>`
   en simulacro, y con `ALLOW_PROD_WRITE=1 … --apply`. Se niega si el proyecto ya tiene historia.
