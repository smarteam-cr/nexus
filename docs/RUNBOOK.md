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
| Locks en-proceso de watchdog / signals / partner refresh | `lib/cs/*` | Dos réplicas podrían correr el mismo sweep en paralelo |
| Guard 409 anti-doble-generación de BC (AgentRun RUNNING ≤5min) | `generate/route.ts` | Sigue funcionando (es contra DB) |

**Persistido en DB (sobrevive deploys, ya NO es in-memory):** el turno del
auto-sync de Google (`CronJobState`, key `google-auto-sync`: `lastRunAt` = «no correr antes de»,
`lastResult` = cómo terminó la última y cuántos fallos seguidos lleva) y el rate-limit de
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
2026-09-04). Antes solo imprimía el comando para que alguien lo copiara.

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
  declara y los dropea (ya se llevó `RoleProfile` una vez).
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

## Jobs del scheduler (`lib/jobs/defs.ts`)

Tick de 60 s, gated por `CRON_ENABLED=1` (solo prod; lo pone `docker-compose.yml`). Claims
por fecha en `CronJobState`: matar el contenedor a mitad de un job NO re-dispara ese día.
Cada corrida deja su resultado en `CronJobState.lastResult` y el **semáforo de
Integraciones** lo pinta (B-03); un fallo llega a Sentry con `tags.job` (B-02), y un job que no
toma el turno del día no anota nada, así que un rojo queda rojo hasta la corrida siguiente. Hasta el
2026-09-04 esta sección listaba 6 jobs; son 11 (`allJobs()`), más dos disparos por navegación:

| Job | Cuándo | Gate | Qué hace |
|---|---|---|---|
| `marketing-weekly` | cada tick; ventana propia (viernes 6:00 CR) + claim propio en `MarketingSettings` | — | delega a `tickMarketingCron` tal cual |
| `cs-signals-daily` | L–V ≥ 6:00 CR, una vez al día | `CS_WATCHDOG_ENABLED=1` | refresca las señales HubSpot de Éxito del cliente |
| `cs-partner-daily` | L–V ≥ 6:00 CR, una vez al día | `CS_WATCHDOG_ENABLED=1` | espeja Partner Clients (uso, licencias, MRR); degrada sin scope |
| `cs-watchdog-daily` | L–V ≥ 7:00 CR (después de las señales) | `CS_WATCHDOG_ENABLED=1` + `CsSettings.watchdogEnabled` | sweep del watchdog con pre-filtro determinístico |
| `cs-watchdog-debounce` | cada tick | `CS_WATCHDOG_ENABLED=1` | triage de eventos «quiesced» (>15 min), hasta 5 proyectos por tick |
| `maintenance-daily` | una vez al día, a cualquier hora (en la práctica, pasada la medianoche CR) | — | barre `PrintJobToken` expirados y `ExternalVerifyAttempt` sin actividad en 24 h, y refresca las alertas de cobranza: abre vencidos y promesas incumplidas, pone al día las filas vivas y cierra las que ya no aplican (`lib/cobranza/alertas-refresco.ts`). No guarda corte. Si el refresco falla, el job queda en rojo y no reintenta hasta el día siguiente |
| `cobranza-quincenal` | ≥ 7:00 CR en los días de corte (`esDiaDeCorte`) | `COBRANZA_CRON_ENABLED=1` | la tanda quincenal de cobranza: extiende las suscripciones, abre todas las alertas (falta facturar, cuentas sin datos, catch-ups) y guarda la foto de la quincena para Reportes. INV32 da rojo si el último corte tiene más de 17 días |
| `google-enrich-retry` | cada tick, hasta 20 sesiones | `GOOGLE_SERVICE_ACCOUNT_KEY` + `GOOGLE_ADMIN_EMAIL` | reintenta el enriquecimiento de Meet que falló (backoff y tope de intentos) |
| `ventas-ganadas-daily` | todos los días ≥ 6:00 CR (fines de semana incluidos) | — | espeja los tratos ganados del año en curso |
| `odoo-espejo-daily` | ≥ 6:00 CR, una vez al día | `ODOO_PASSWORD` (contraseña o clave de API), `ODOO_LOGIN` si la clave no es de `direct`, y `ODOO_SYNC_ENABLED` ≠ `0` | espeja las facturas de Odoo (Nexus solo lee). Si la corrida falla, el job FALLA (rojo + Sentry); un rechazo de credenciales retiene el turno hasta mañana (ver «El espejo de Odoo no corre»). INV31 da rojo si la última corrida buena tiene más de 20 h |
| `invariants-daily` | ≥ 7:00 CR, una vez al día (después de los espejos) | — | corre los 21 invariantes solo-base (`lib/invariantes/`, B-07); si alguno está en rojo el job FALLA a propósito: semáforo rojo + Sentry. Los que necesitan HubSpot o archivos siguen en `check-invariants.ts`, a mano |

⚠ Sin `CS_WATCHDOG_ENABLED` y `COBRANZA_CRON_ENABLED` en el `.env` cinco de estos no corren, y sin
`ODOO_PASSWORD` tampoco el espejo. Hasta el 2026-09-12 el semáforo los pintaba en gris («nunca
corrió»), igual que a un job que todavía no llegó a su hora; ahora dice **apagado** con el motivo, que
sale de la misma regla que usa `shouldRun` (`lib/jobs/requisitos.ts`).

**Dos disparos por navegación**, que no pasan por el scheduler:
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

### El espejo de Odoo no corre

Se ve en tres lugares: la línea de arriba de Cobranza › Odoo se pone en rojo, INV31 da rojo en
`invariants-daily` (y en `check-invariants.ts`), e Integraciones › Jobs del servidor dice si
`odoo-espejo-daily` está **apagado** y por qué, o si **falló** y con qué error. `/integrations/odoo`
lista cada corrida con su resultado. No hay botón para correr el sync desde la pantalla.

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
