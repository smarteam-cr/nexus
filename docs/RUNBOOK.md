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
| Semáforo de export PDF (máx 2 Chromium + cola de 4) | `app/api/business-cases/[id]/export-pdf/route.ts` | El cap sería POR réplica (2×N Chromiums) |
| Guard `running` del auto-sync de Google | `lib/google/auto-sync.ts` | Cubierto igual por el claim en DB (CronJobState) |
| Locks en-proceso de watchdog / signals / partner refresh | `lib/cs/*` | Dos réplicas podrían correr el mismo sweep en paralelo |
| Guard 409 anti-doble-generación de BC (AgentRun RUNNING ≤5min) | `generate/route.ts` | Sigue funcionando (es contra DB) |

**Persistido en DB (sobrevive deploys, ya NO es in-memory):** el cooldown del
auto-sync de Google (`CronJobState`, key `google-auto-sync`) y el rate-limit de
verify-access externo (`ExternalVerifyAttempt`, helper
`lib/external/verify-rate-limit.ts`).

Si algún día hay más de una réplica: mover el semáforo de PDF y los locks de CS
a claims en DB (mismo patrón `CronJobState`/`claimDateKey` que ya usan los jobs).

## Invariante #2 — DB COMPARTIDA ENTRE 2 PCs (dual-PC)

La misma Supabase Postgres la usan las dos máquinas de desarrollo Y producción.
Reglas duras:

1. **Schema SOLO aditivo** — nunca drop/rename/reorder de columnas o valores de
   enum existentes. Un `db push` con un schema desactualizado DROPEA lo que la
   otra PC agregó.
2. **`git pull` SIEMPRE antes de `prisma db push`** (así el schema local incluye
   lo de la otra PC).
3. Un solo `db push` por fase de trabajo; avisar a la otra PC tras pushear schema.
4. Para flags/overrides nuevos, preferir un campo Json YA existente antes que
   una columna nueva sin coordinar (ej.: los briefs viven en
   `ProjectCanvas.sections`).
5. **`prisma db push` JAMÁS contra el puerto `:6543`** (transaction pooling):
   DDL a través del pooler en transaction mode produce bugs sutiles. Siempre
   contra el host directo `:5432` — que es lo que las PCs de dev ya usan.

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
contenedor viejo queda intacto o el script imprime el rollback exacto:
`docker tag nexus:prev nexus:latest && docker compose up -d --no-build app`.

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

Tick de 60s, gated por `CRON_ENABLED=1` (solo prod). Claims por fecha en
`CronJobState` — matar el contenedor a mitad de un job NO re-dispara ese día
(salvo los que liberan claim en fallo transitorio). Jobs: marketing-weekly,
cs-signals-daily, cs-partner-daily, cs-watchdog-daily, cs-watchdog-debounce,
**maintenance-daily** (barre `PrintJobToken` expirados y filas viejas de
`ExternalVerifyAttempt`).

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
