# Nexus — Constitución arquitectónica

> Este documento es **la fuente de verdad** sobre cómo se construye y evoluciona Nexus. Cualquier cambio importante debe poder defenderse contra estas reglas. Si una regla deja de tener sentido, el documento se cambia *antes* del código.

## Parte 0 · Referencia rápida (operativa)

> Los capítulos A–F responden lo que un recién llegado (humano o agente) necesita ANTES de
> tocar código. Los números marcados con `<!-- sync:... -->` los verifica
> `lib/docs/doc-sync.test.ts` contra package.json / node_modules / el filesystem — si
> divergen, la suite falla: este bloque no puede volver a mentir en silencio. Las secciones
> numeradas (§0–§13) de abajo son la CONSTITUCIÓN; su numeración NO se cambia (la citan
> ~31 archivos de código y docs — los capítulos nuevos entran con letra o al final).

### A. Stack (versiones reales instaladas)

Next.js 16.1.6<!-- sync:next --> (App Router, `output: "standalone"`) · React
19.2.3<!-- sync:react --> · TypeScript 5.9.3<!-- sync:typescript --> · Prisma
7.4.2<!-- sync:prisma --> (`@prisma/client` + `@prisma/adapter-pg` sobre `pg`
8.20.0<!-- sync:pg -->) contra Supabase Postgres · Tailwind 4.2.1<!-- sync:tailwindcss -->
(CSS-first: **no existe tailwind.config** — la config vive en `app/globals.css`) · Zod
4.3.6<!-- sync:zod --> · `@anthropic-ai/sdk` 0.78.0<!-- sync:anthropic-sdk --> · vitest
4.1.9<!-- sync:vitest --> · npm (lockfile v3).

- **Auth**: Supabase Auth, una sola identidad (`AppUser` INTERNAL/EXTERNAL — §4).
- **IA**: modelos vivos `claude-sonnet-4-6` (el default), `claude-haiku-4-5` (resúmenes) y un
  `claude-sonnet-4-5` rezagado en audits/insights.
- **Integraciones**: HubSpot (`lib/hubspot/`) · Google Workspace (`lib/google/` — Meet es LA
  fuente de sesiones; Fireflies se eliminó el 2026-06-04 y solo sobrevive el nombre del modelo
  `FirefliesSession`) · Apify (marketing) · Sentry (instalado, inerte sin DSN).
- **Node**: hoy conviven 24 (local y CI) y 22 (imagen Docker de PROD) sin pin — alinearlos a 24
  es deuda declarada (§12, ítem 25). No hay `engines` ni `.nvmrc` todavía.

### B. Mapa real del repo

Monolito App Router, sin `src/`:

| Carpeta | Qué vive ahí |
|---|---|
| `app/` | 67 `page.tsx` + ~252 `route.ts` en SEIS superficies con reglas de auth DISTINTAS: `(shell)/` (interna: sidebar + sesión), `api/`, `external/` (pública por token), `print/` (render PDF, bypass `?pdfToken=`), `portal/`, `auth/`, más la raíz pública (login). El criterio vive en `middleware.ts` (PUBLIC_PATHS / PUBLIC_PREFIXES) |
| `lib/` | 42 módulos de dominio (forma ideal: vertical slice, §1) + infra compartida (`lib/db/`, `lib/auth/`, `lib/anthropic.ts`) |
| `components/` | React por módulo; `components/ui` = el vocabulario del §1-UI; `components/landing` = el motor de documentos del §1-WEB |
| `scripts/` | ~158 `.ts` de operación (dry-run-first + guard anti-prod, ver cap. D) + `scripts/sql/` (los DDL a mano) + `scripts/archive/` (one-offs históricos, no son catálogo) + `deploy.sh` |
| `prisma/` | `schema.prisma` (93 modelos, 79 enums) + `migrations/0_init` (baseline, cap. D) + `migrations-archive/` + `policies.sql` (RLS idempotente) + 3 seeds |
| `docs/` | `DECISIONS` (el porqué, no re-litigar) · `GLOSSARY` · `RUNBOOK` (operación de PROD) · `KNOWN-ERRORS` · `CHANGELOG` |
| `hooks/` | 3 hooks React globales (hay 1 más en `lib/hooks/` — deuda de consolidación) |

### C. Correr en local

```bash
npm install          # NO hay postinstall: el cliente Prisma no se genera solo
npx prisma generate
npm run dev          # → http://localhost:3005  (base LOCAL — el default)
npm run dev:prod     # → http://localhost:3004  (base de PRODUCCIÓN — con aviso en rojo)
```

**El default es la base LOCAL** (2026-08-01): el trabajo diario en esta máquina es escribir
código nuevo, y la validación con datos REALES ocurre en producción, con Customer Success.
Desarrollar contra la base de los clientes era el defecto histórico que este plan cerró (un
`db push` ya se llevó `RoleProfile` una vez). `npm run dev:prod` (3004) queda para MIRAR
datos reales, y avisa en rojo al arrancar.

**Por qué la de PRODUCCIÓN está en el 3004** (2026-08-02, corrige el reparto original): el
`.env` tiene el puerto escrito adentro en dos lugares que gobiernan OAuth —
`APP_URL="http://localhost:3004"` y `HUBSPOT_REDIRECT_URI=".../3004/api/auth/callback"` — así
que con la instancia de prod en otro puerto el login de Google rebotaba al 3004 y, peor,
reconectar HubSpot mandaba el callback al 3004 → el token terminaba escrito en la base LOCAL.
Alinear el puerto con lo que el `.env` ya declara sale gratis y no exige tocar el registro de
la URL de callback en HubSpot. De paso la paridad con el contenedor de producción
(`docker-compose`: `PORT: "3004"`) queda donde significa algo: la instancia que habla con
datos reales corre en el mismo puerto que producción. Las dos instancias conviven porque
difieren en puerto, en `DATABASE_URL` (inyectada por `scripts/dev-local.ts`; el `.env` del
disco NO se toca — sigue siendo la fuente para los scripts de operación y el CLI de Prisma,
que legítimamente apuntan a prod bajo `ALLOW_PROD_WRITE`) y en `distDir` (`.next` /
`.next-alt`: Next 16 lockea `.next/dev`). El modo local verifica que la base responda ANTES
de arrancar, para que el fallo sea un mensaje claro y no un error de Prisma a media página.

⚠ **Aislar la BASE no alcanza: hay que aislar las INTEGRACIONES DE ENTRADA.** Mordido el
2026-08-02, apenas la local entró en uso: el auto-sync de Google (`lib/google/auto-sync.ts`
— se dispara SOLO en background al usar la app, con cooldown de 20 min) metió **4.771
sesiones REALES** de Google Workspace en `nexus_local`, y el agente post-sesión les corrió
encima creando 160 `ActionItem` **consumiendo API de Anthropic de verdad**. La base estaba
aislada; las credenciales del `.env` no. `scripts/dev-local.ts` ahora BORRA
`GOOGLE_SERVICE_ACCOUNT_KEY`/`GOOGLE_ADMIN_EMAIL` en modo local — no con un flag nuevo, sino
aprovechando que `autoSyncGoogleMeet` ya devuelve `{skipped:"google_not_configured"}` sin
ellas (cero ramas nuevas en código de producción). **`ANTHROPIC_API_KEY` SÍ se conserva**:
probar que el handoff/kickoff generan bien es para lo que existe este entorno, y los agentes
se disparan a mano. HubSpot degrada solo (su token vive en la tabla `HubspotAccount`, vacía
en local). Regla que queda: **a la base local las sesiones entran por donde uno DECIDE** —
el fixture o `db:local:pull` —, nunca por un sync automático.

**Probar el flujo "creo un proyecto en HubSpot y Nexus lo agarra" en local**:
`npm run db:local -- hubspot` copia la conexión (`HubspotAccount`) de prod a la local. El
token de HubSpot NO vive en el `.env` — vive en la BASE (`lib/hubspot/client.ts` lo busca con
`findFirst({isSystem:true})`), y la local nace sin ninguna fila, así que sin esto el sync no
tiene con qué autenticarse. ⚠ Con la conexión copiada el Nexus local habla con el HubSpot
REAL: leer es inocuo (es lo que habilita la prueba) pero hay caminos que ESCRIBEN allá (crear
handoff, handoff-sync, borradores sociales) — **la base queda aislada, HubSpot no**. Es el
mismo riesgo que ya se corre probando en producción; lo que cambia es que los proyectos de
prueba aterrizan en `nexus_local` y no en la base de los clientes.

⚠ **Para ENTRAR a la instancia local hace falta `npm run db:local -- acceso`** (una vez):
Supabase Auth es UNO SOLO — prod y local comparten el proyecto de auth, lo único que cambia
es dónde vive la DATA. El login de Google anda y devuelve tu correo REAL, pero `requireUser`
busca `AppUser` POR EMAIL y la base local solo tiene los ficticios del fixture → *"Usuario
autenticado pero sin AppUser"*. `acceso` copia el roster interno real (TeamMember + AppUser
INTERNAL, ~19 filas) de prod a la local; va SEPARADO de `seed` a propósito, porque `seed` es
el mundo ficticio y funciona sin acceso a prod. Es lo mismo que hace `local-pull-context.ts`
(helper compartido `scripts/lib/roster.ts`) — correr cualquiera de los dos alcanza.

`npm run dev` escucha en el puerto **3005**<!-- sync:dev-port --> (la base LOCAL; el 3004 es
`dev:prod`). Env mínimo para arrancar y poder loguearse:
`DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (la plantilla es
`.env.example` — sin secretos; los valores reales los pasa el equipo).

⚠ **La DB es PRODUCCIÓN** (una sola Supabase; local == PROD). Por eso todo script que escribe
exige `--apply` **y** `ALLOW_PROD_WRITE=1`: el guard (`scripts/lib/guard.ts`, INV12) imprime el
host destino y aborta sin la variable.

Trampas de todos los días: tras cambiar el schema → `npx prisma generate` + **reiniciar el dev
server** (el client viejo no entra por HMR); tras un `git pull` que toque CSS/config →
`rm -rf .next` + reiniciar; el navegador del preview NO está logueado (middleware → login).

**Base LOCAL** (F1+F3, 2026-08-01): Postgres 17 EMBEBIDO vía npm — sin Docker, la otra PC lo
hereda con `npm install`. `npm run db:local -- up | bootstrap | seed | reset | down | status`
(`scripts/local-db.ts`): levanta `localhost:5433` con `nexus_local` + `nexus_test`, schema
completo (0_init + after.sql + policies), reset TOTAL en ~20 s. Datos en `.local-db/`
(gitignoreado). Sin pgvector (los binarios no lo traen — la columna `embedding` no tiene
lectores y se omite con NOTICE). El guard no exige `ALLOW_PROD_WRITE` en localhost, a
propósito. **`seed`** puebla `nexus_local` con el catálogo (agentes/prompts/permisos +
equipo FICTICIO — los datos reales del equipo no van al repo) y el mundo `fx-` de
`scripts/seed-fixture.ts` (3 empresas, 2 proyectos con canvases reales, cronograma,
cobranza con los 5 colores, roles); el fixture y los demos de cobranza **rechazan prod SIN
excepción** (ni `ALLOW_PROD_WRITE` los destraba — solo aceptan hosts loopback). Los seeds
one-off históricos viven en `scripts/archive/` y NO entran al bootstrap. El `.env` de dev
sigue apuntando a PROD — el switch es una decisión coordinada entre las 2 PCs, no un default.

**Contexto REAL para pruebas de juicio del agente** (`npm run db:local:pull`,
`scripts/local-pull-context.ts`): el mundo `fx-` prueba que la plomería funciona, pero no
sirve para validar si un agente entendió bien una conversación —eso exige un transcript
real y a alguien que estuvo en la llamada—. Este script copia, de PROD (solo lectura, sin
gate — leer no es peligroso) a `nexus_local`, el Client + sus Project + FirefliesSession
(con transcript) + SessionProject, más el roster INTERNO completo de Smarteam (así el
filtro "¿hay Ventas en la sala?" y el login local se comportan igual que en prod). Tres
formas de elegir a quién traer:

```bash
npm run db:local:pull -- --client "Wherex"                 # uno
npm run db:local:pull -- --client "Wherex,Honda,kölbi"     # varios, por nombre
npm run db:local:pull -- --recientes 10 --apply            # los N con la sesión más reciente
```

`--recientes` ordena por ÚLTIMA sesión y no por cantidad (un cliente con 80 sesiones de
hace un año no sirve para probar lo de hoy) y se limita a la cartera (`kind=CLIENTE`). Con
varios nombres, los que no resuelven se reportan TODOS juntos antes de abortar — enterarse
de a un error por corrida, en un lote de 8, es inaceptable. El DESTINO es SIEMPRE local —
mismo candado sin excepción que el fixture. Dry-run por default; `--apply` escribe.
Idempotente (ids reales de prod, upsert) y ACUMULATIVO: traer un cliente no borra los
anteriores (`db:local -- reset` vacía). Sin tope de sesiones por cliente, a propósito:
medido contra prod son ~22 sesiones y ~31 kB de transcript por cliente ⇒ 10 clientes ≈ 5-7 MB.
No copia Cobranza/Timeline/Canvas — la generación crea los suyos.

### D. Base de datos y migraciones (el flujo REAL)

- **Dónde vive la config**: el `datasource` de `prisma/schema.prisma` NO declara URL —
  `prisma.config.ts` lee `DATABASE_URL` vía `dotenv/config`. Por eso las credenciales van en
  `.env` y NUNCA en `.env.local` (el CLI de Prisma no lo lee). Pools: runtime
  `lib/db/prisma.ts` (max 10 prod / 4 dev, perilla `DB_POOL_MAX`); scripts
  `scripts/lib/db.ts` (max 2). El pooler comparte ~15 slots entre PROD + 2 PCs + scripts
  (RUNBOOK, invariante #3).
- **`prisma migrate` clásico no se usa y `db push` está PROHIBIDO**: la base tiene objetos que
  el schema no declara — la columna pgvector `KnowledgeEmbedding.embedding`, el CHECK
  `Client_logoScale_rango`, RLS y policies — y un push los DROPEA sin preguntar (ya se llevó la
  tabla `RoleProfile` una vez). No existe una "DB de dev": es la misma base.
- **Flujo de un cambio de schema**, paso a paso:
  1. Escribir `scripts/sql/AAAA-MM-DD-nombre.sql` — **SOLO ADITIVO**, inocuo durante la ventana
     en que PROD corre el código viejo (columnas nullable / defaults).
  2. `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
     como **detector de drift ajeno** (2 PCs sobre la misma base). Ruido esperado del diff:
     la columna `embedding` y el CHECK, que Prisma no modela.
  3. Aplicar: `ALLOW_PROD_WRITE=1 npx prisma db execute --file scripts/sql/...` (el guard de
     `prisma.config.ts` lo exige — en Prisma 7 `db execute` no acepta URL por flag). Excepción
     `ALTER TYPE ... ADD VALUE`: one-liner `npx tsx -e` llamando `assertProdWriteAllowed()` a
     mano (ver el header de `scripts/lib/guard.ts`).
  4. `npx prisma generate` + reiniciar el dev server.
  5. Deploy (cap. E) — **el SQL siempre ANTES del código que lo necesita**.
  6. `npm run check:invariants` — INV4/INV7 prueban que el DDL aterrizó; INV12 vigila el guard.
- **Baseline**: `prisma/migrations/0_init/` representa el schema COMPLETO (re-baseline del
  2026-08-01; las 5 migraciones de marzo 2026 están en `prisma/migrations-archive/`).
  `0_init/after.sql` (extensión vector + columna embedding + CHECK) y `prisma/policies.sql`
  (RLS + policies, `ALLOW_PROD_WRITE=1 npm run db:policies`) cubren lo que Prisma no
  representa. ⚠ No hay tabla de control de qué `.sql` ya corrió — el registro es INV4/INV7 o
  mirar la base (limitación conocida; se resuelve con la base local, plan aparte).
- El schema tiene **cero `@map`/`@@map`** (verificado 2026-08-01): el bug de enums mapeados de
  Prisma 7 no nos aplica, y `migrate diff` es fiel nombre-a-nombre.

### E. Deploy

```bash
cd /opt/smartflow/Nexus && bash scripts/deploy.sh
```

UNA línea: ff-only → **rebuild SIEMPRE** → swap esperando healthy → smoke (el `sha` de
`/api/health` debe ser el HEAD). PROD es `nexus.smarteamcr.com`; `/api/health` es público y
dice qué commit corre. Todo lo demás —rollback, `.env` del VPS, scheduler/jobs, PDF/Chromium,
las 3 invariantes de infra— vive en **`docs/RUNBOOK.md`** y acá NO se duplica. El deploy no
corre migraciones ni seeds (cap. D + RUNBOOK).

### F. Los tests: cinco familias que se rompen por razones distintas

**260**<!-- sync:test-files --> archivos `*.test.ts` (unit), todos bajo `lib/` — el project
`unit` de vitest solo incluye `lib/**`, así que un test puesto en otra carpeta NO corre y
nada avisa. `npm test` es la suite unit. Desde el 2026-08-01 (F4) el project `integration`
está VIVO: `npm run test:int` corre los `*.int.test.ts` contra la base LOCAL `nexus_test`
(`test/setup.integration.ts` carga `.env.test` con override, ABORTA si el host es Supabase,
y TRUNCA todas las tablas antes de cada caso — por eso `fileParallelism: false`). Prerequisito:
`npm run db:local -- up`. Los primeros cubren el chokepoint de sesiones (invariante #1) y
`visibleRoleWhere` con filas reales. Integration NO corre en CI todavía (falta el service
container — pendiente declarado en ci.yml).

| Familia | Ejemplo | Se rompe cuando… | Se arregla… |
|---|---|---|---|
| Unit puro de motor | `lib/cobranza/engine.test.ts` (121 casos) | un número que alguien VE en pantalla cambió | entendiendo el cambio, nunca "ajustando el expected" |
| Golden congelado | `lib/cobranza/__fixtures__` (103 KB) · `lib/landing/build-landing.test.ts` | un refactor movió un output de producción | investigando el diff — PROHIBIDO regenerar el JSON para callar el test |
| Ratchet de deuda | `lib/ui/token-vocab.test.ts` (4 en 1) · `skeleton-vocab` · `scope-coverage` | sumaste un ofensor O arreglaste uno sin borrar su entrada | el mensaje imprime la línea lista para pegar; la deuda solo ENCOGE |
| Escaneo estructural | `costos-privacy` · `api-guards` · `exploracion-internal` | un guard/chokepoint desapareció del TEXTO del código | restituyendo el guard, no relajando el regex |
| Registro congelado | `lib/landing/registry.test.ts` · `nav-gates` | cambió un set/orden que es decisión de producto | decidiéndolo explícito y actualizando el snapshot |

(+ el meta-test `lib/ui/eslint-guards.test.ts`: impide que un guard de ESLint muera en
silencio por colisión de flat config — ya pasó una vez.)

**CI** (`.github/workflows/ci.yml`, cada push/PR): ratchet de tsc (baseline **0**) + ratchet
de eslint (baseline en `eslint-baseline.txt`, solo errores — los ~1.5k warnings de los guards
no bloquean ahí: bloquean los ratchets de vitest) + `npm test`. `check:invariants` NO corre en
CI: corre desde dev contra la base real (lo invoca la skill /ship-nexus).

---

## 0. Contexto

Nexus es la plataforma interna del equipo de Customer Success Engineers (CSE) de Smarteam, una consultora de HubSpot. Nació interna, pero desde junio 2026 tiene **superficie externa VIVA**: `app/external/**` y `app/api/external/**` sirven a clientes finales el kickoff, el cronograma, business cases y documentos públicos por token (`/external/doc/<token>`), con RLS + token/password como barreras. En el futuro, la app podría evolucionar hacia un SaaS — las decisiones de hoy no deben cerrar esa puerta.

**Dos planos de acceso (interno y externo), con roles dentro del interno. Una sola identidad (Supabase Auth):**

1. **Equipo interno** (`AppUser.kind="INTERNAL"`, vinculado a un `TeamMember`). Un solo plano, con distintos roles internos:
   - `CSE`, `PM`, `SALES`: acceso a clientes donde son owner en HubSpot, más overrides explícitos otorgados por un admin.
   - `ADMIN`, `SUPER_ADMIN`: acceso total para soporte/testing y para gestionar overrides. El Super Admin no es un plano distinto, es un rol elevado dentro del mismo plano interno.
2. **Cliente externo final** (`AppUser.kind="EXTERNAL"`, vinculado a un `Client`). Acceso *solo* a sus propios datos, en endpoints `app/api/external/...` con RLS de Supabase como segunda barrera.

---

## 1. Estructura por módulo

**Regla**: cada módulo funcional vive en una "rebanada vertical" repetible, siempre con la misma forma. Si un módulo no respeta esta forma, hay que arreglarlo o explicar por qué la rompe.

**Forma estándar de un módulo `foo`:**

```
app/
  foo/                     # rutas UI del módulo (Server Components)
    page.tsx
    [id]/page.tsx
  api/foo/                 # endpoints HTTP del módulo
    route.ts
    [id]/route.ts
    [id]/<action>/route.ts
components/foo/            # componentes React específicos del módulo
lib/foo/                   # lógica de dominio del módulo
  index.ts                 # exports públicos
  queries.ts               # lecturas Prisma del módulo (cachéables)
  mutations.ts             # escrituras Prisma del módulo
  schema.ts                # schemas Zod para inputs/outputs del módulo
  agents/                  # (si aplica) prompts y orquestación IA del módulo
prisma/schema.prisma       # los models del módulo viven acá con comentario de sección
```

**Excepción permitida**: los core helpers (`lib/db`, `lib/auth`, `lib/anthropic.ts`, y las carpetas de integración `lib/hubspot`, `lib/google`, `lib/data-lake` — §7) no son módulos, son infra compartida.

**Por qué**: con esta forma, cualquiera que entra a un módulo nuevo encuentra todo en 60 segundos. Hoy `lib/sessions/` se acerca a este patrón; `clients/` y `projects/` no, y se refactoran como parte de la deuda urgente.

### 1-UI. El contrato de una pantalla de módulo

Espejo del slice de `lib/`: la FORMA estándar de una pantalla interna. Toda pantalla nueva cumple esto; si no puede, se documenta por qué ANTES de escribirla. La consistencia acá no es por disciplina — los ratchets de `lib/ui/*.test.ts` son el reviewer.

1. **Ruta**: nace bajo `app/(shell)/<modulo>/` con `page.tsx` + `loading.tsx`, declarada en `lib/ui/skeleton-coverage.ts` Y en `lib/ui/page-shell-coverage.ts` (ambos tests fallan si falta).
2. **Contenedor**: `page.tsx` y `loading.tsx` importan la MISMA constante `SHELL_*` de `lib/ui/page-shell.ts`. Un contenedor propio es legítimo solo con la razón escrita en el registro.
3. **Cabecera**: `<PageHeader>` — el ÚNICO `h1 text-xl` de la pantalla. Detalle a profundidad 1 → `backHref`; profundidad 2+ → `crumbs` (el crumb del módulo sale de `moduleCrumb`/APP_NAV). Nunca ambos.
4. **Navegación**: 1 entrada en `components/layout/nav-config.tsx` con su gate declarativo (+ el test de gates congelados). El gate del sidebar es cosmético: la seguridad vive en la página (`requirePermission`/`can()`) y en el endpoint.
5. **Controles**: SOLO primitivas de `components/ui` — Button/IconButton, Input/Select/Textarea dentro de `<Field>`, `<Tabs>`, `<Menu>`, `<Alert>`, Modal/Drawer/ConfirmDialog, Table, EmptyState, Skeleton*, BackLink/Breadcrumbs. Si falta una forma, se AGREGA al vocabulario (con su ratchet), no se improvisa inline.
6. **Color**: SOLO tokens semánticos (invariante #5 de CLAUDE.md). El ratchet `token-vocab` frena el merge; el remap `html.light` es red de seguridad, no API.
7. **Estados**: carga = skeleton estructural (doctrina en DECISIONS §Estados de carga); error persistente = `<Alert variant="danger">` o `error.tsx` de segmento; transitorio = `toast`; vacío = `<EmptyState>` con CTA.
8. **Espaciado y tipografía**: página `space-y-6` · sección `space-y-4` · denso `space-y-2`; headings — `h1 text-xl` (solo PageHeader), `h2 text-sm font-semibold text-fg`, labels `text-xs text-fg-muted`. Normalización al tocar, no big-bang.
9. **Copy**: tuteo (invariante #6).
10. **IA**: si la pantalla propone cambios generados por agente, el marco es `<AgentProposal>` (components/ai) y el disparador muestra la fase real vía `useAgentRun`. Los paradigmas alternativos legítimos están documentados en el header de AgentProposal.

### 1-WEB. El contrato de una página web de Nexus

Espejo del §1-UI para la OTRA familia de pantallas: los DOCUMENTOS que el motor de landing (`LandingView` + `.stl`, `app/landing-engine.css`) renderiza — business cases, kickoff, desarrollo, perfiles de puesto, y los que vengan. Un documento NO es una pantalla de módulo: es tema claro con hex LITERAL a propósito (renderiza en `/external/*` y en PDF, donde el tema de la app no existe — **nunca flipea claro/oscuro**), está exento de los ratchets de tokens (`EXENTOS_STL`), y su consistencia la custodian los registros congelados (`lib/landing/registry.test.ts` + `lib/roles/roles.test.ts`), no el vocabulario de `components/ui`.

1. **Elegir el storage con la regla render-vs-datos** (DECISIONS §Roles): el motor de RENDER/EDICIÓN se reusa ampliamente; el STORAGE se aísla por módulo. `ProjectCanvas`/`CanvasBlock` SOLO si el documento necesita DRAFT/CONFIRMED + generación por agente + publish al cliente. Un doc interno editado a mano → Json propio en su tabla (patrón `RoleProfile.content`). Nunca FK nuevas en las tablas compartidas del canvas "porque ya están".
2. **Piezas obligatorias de un tipo nuevo**: par `configs/<tipo>.defs.ts` (server-safe: keys, labels, schema del agente, tips) + `configs/<tipo>.ts` (client: mapa `sectionType → Component` + `landingConfigFor<Tipo>()` vía `toSectionDef`). Los componentes de sección cumplen `SectionProps` y usan SOLO primitivas del motor: `Editable`/`RemoveBtn`/`AddBtn` (inline), `SortableItems` (sortable), `Prose`/`InlineMD` (prose), hero-parts, y las clases `.stl` de landing-engine.css — nada inventado inline que el próximo tipo no herede.
3. **Si el storage es CanvasBlock, el adaptador delega en `components/landing/build-landing.ts`** (`buildLandingConfigFromOrder` + `landingRowData`): hero primero, cola pinneada, orden vivo en el medio, data CARD tipada con fallback `{__legacyMd}`. El adaptador por tipo conserva SOLO su particularidad (ver kickoff: ctx-sections + de-dup de compara). El golden `lib/landing/build-landing.test.ts` congela el núcleo.
4. **Registro congelado por test**: todo tipo nuevo entra a `lib/landing/registry.test.ts` (o un espejo): cada def resuelve Component (un typo de `sectionType` NO puede desaparecer una sección en silencio — `toSectionDef` devuelve null sin romper), sin huérfanos, y snapshot de keys (cambiar el set/orden de secciones = decisión de producto explícita).
5. **Capacidades que el motor da gratis** (no re-implementar): edición WYSIWYG in-situ con commit en blur Y en desmontaje, drag&drop de ítems con ids estables + teclado + affordance táctil, ocultar/colapsar secciones con toggle de ojo, tooltips ⓘ (`SectionDef.tip`), **rótulos de columna por documento (`SectionDef.chips`)** — cuando un renderer lo comparten varios tipos, el rótulo entra por la DEFINICIÓN y nunca por un campo de `data`, o el brief termina pidiéndole al agente que escriba la interfaz (ver DECISIONS §Exploración: de ahí salió "POR QUÉ QUÉ SE ROMPE SI EL SUPUESTO ES FALSO") —, reveal-on-scroll + parallax del hero (con reduced-motion), tolerancia a data legacy markdown, modo PDF (`stl-pdf-mode`), **rótulos de la sección de
   inversión por documento (`SectionDef.invest`)** —mismo principio que `chips`, con los valores
   tipados contra `LandingStringKey` para que un template nuevo no pueda quedar monolingüe—,
   **secciones creadas por el usuario** (`custom:*` → `lib/landing/custom-sections.ts`: crear,
   mover, ocultar, renombrar, borrar y sobrevivir al regenerar, sin DDL), y el **assist de documento** ("✨ Mejorar con IA": instrucción → propuesta por sección → revisar en `<AgentProposal>` → aplicar/descartar, con web_search a criterio del modelo — núcleo `lib/ai/assist.ts`, el contrato de secciones sale de las defs; doctrina en DECISIONS §Roles).
6. **Checklist de superficies antes de dar por terminado un tipo**: editor interno (CSE) · vista externa del cliente (tuteo — se le habla de TÚ, ver GLOSSARY §vocabulario) · PDF si aplica (sin JS interactivo: nada de charts canvas, timers ni loops — SVG estático, ver DECISIONS §Roles/marcador). El CSE debe ver EXACTAMENTE lo que ve el cliente (adaptador compartido, un solo chokepoint de filas→data).
7. **Publish/snapshot NO está unificado** (4 mecanismos conviven: BC snapshot, kickoff publishedSnapshot, cronograma publishedSnapshot, desarrollo vivo) — unificarlos es un plan futuro propio, anotado acá y en DECISIONS. Mientras tanto, un tipo nuevo que publique copia el patrón `publishedSnapshot` congelado + chokepoint server-side fail-closed (ver kickoff-view.ts).

---

## 2. Schema Prisma como fuente única de verdad

**Reglas**:

1. **Una fila = una fuente de verdad para su contenido.** Prohibido duplicar campos derivables. Si `SessionMinute.summary` ya existe, **no** se mantiene `Project.lastSessionSummary` en paralelo.
2. **FKs siempre obligatorias salvo razón explícita comentada.** Una FK nullable debe llevar comentario `// nullable porque ...`.
3. **Sin "FK suaves" (campos `xxxId: String?` sin relación Prisma).** Si necesita FK, declárese con `@relation`. Si es ID externo (HubSpot, Google), prefíjese: `externalHubspotPortalId` etc.
4. **Naming consistente**: camelCase Prisma. FKs internas terminan en `Id`. Booleans empiezan con `is`/`has`/`should`. Timestamps son `createdAt` / `updatedAt` / `xxxAt`.
5. **Relaciones N:N siempre con tabla pivote**, nunca con `Json[]`. Ejemplo correcto: `SessionProject`. Ejemplo erróneo histórico que se elimina: `Project.pendingItems: Json?`.
6. **Enums Prisma para estados.** Prohibido tener `status: String` y validar con if/else en código.
7. **Cascadas explícitas.** Cada `@relation` declara `onDelete` con uno de: `Cascade`, `SetNull`, `Restrict`. Nunca dejar el default.
8. **Comentarios de sección y de modelo obligatorios.** Cada modelo abre con un comentario de 1 línea explicando para qué existe.
9. **No hay "campos legacy" perpetuos.** Si un campo está deprecated, va con `// DEPRECATED — eliminar después de <fecha o evento>`. Si pasa la fecha, se elimina o se actualiza el deadline con justificación.

**Por qué**: la deuda actual del schema (FKs duales `accountId+clientId`, `Project.canvas`, `pendingItems Json`) viene de saltarse estas reglas durante migraciones que nunca se cerraron. La regla 9 fuerza el cierre.

---

## 3. Validación en las fronteras

**Regla**: **ningún dato entra a la lógica de negocio sin pasar por un schema Zod**. La frontera es donde el dato cruza de externo (HTTP body, query, params, env vars críticos) a interno.

**Implementación:**

- ⚠ El helper compartido `lib/api/parse.ts` (`parseBody(req, schema)`) **NO EXISTE TODAVÍA** —
  es la deuda #6 de §12. Hoy cada route valida con Zod inline (`schema.safeParse` sobre el
  body) o, en las viejas, a mano. Al construirlo: extracción del JSON con error claro,
  `safeParse`, y `BadRequestError` con el error de Zod formateado. Hasta entonces, la regla
  operativa es: **toda route nueva valida su body con un schema de `lib/<modulo>/schema.ts`**.
- Los schemas viven en `lib/<modulo>/schema.ts` y se exportan junto con tipos derivados (`z.infer<typeof Schema>`).
- Validar también `params` cuando son ids (deberían ser cuids: `z.string().cuid()`).

**Por qué**: la validación manual heterogénea deja pasar payloads corruptos hasta Prisma y filtra errores de Prisma al usuario. Los módulos nuevos (cobranza, marketing, roles) ya validan con Zod en la frontera; la deuda es el barrido de los viejos + el helper común.

---

## 4. Autenticación y autorización

**Modelo de identidad**: **Supabase Auth es el único sistema** de identidad. La distinción interno/externo es un atributo del usuario, no dos sistemas de auth diferentes.

### 4.1 Identidad unificada con Supabase Auth

- **Cada persona** que entra a Nexus (CSE de Smarteam o cliente final) tiene un `auth.users` en Supabase. La cookie/sesión la maneja `@supabase/ssr`.
- **Tabla `AppUser`** vincula `auth.users.id` con el contexto interno de Nexus:
  ```prisma
  model AppUser {
    id           String   @id @default(cuid())
    authUserId   String   @unique           // FK suave a auth.users.id de Supabase
    email        String   @unique
    kind         AppUserKind                // INTERNAL | EXTERNAL
    teamMemberId String?  @unique           // si INTERNAL → FK a TeamMember
    clientId     String?                    // si EXTERNAL → FK a Client (su organización)
    createdAt    DateTime @default(now())
  }
  enum AppUserKind { INTERNAL EXTERNAL }
  ```
- Helpers en `lib/auth/`:
  - `requireUser()` → devuelve `AppUser` o lanza 401.
  - `requireInternalUser()` → devuelve `{ user: AppUser, teamMember: TeamMember, role }` o lanza 403.
  - `requireExternalUser()` → devuelve `{ user: AppUser, clientId: string }` o lanza 403.
- **El selector "Soy X" se elimina.** Cada persona se loguea con su propia cuenta Supabase. No hay impersonación de "soy otro CSE" — ni siquiera para Super Admin. El Super Admin accede a todos los clientes a través de su rol (ver 4.2), no asumiendo otra identidad.

### 4.2 Roles internos y sistema de permisos sección×acción

`TeamMember.roleEnum` (los VALORES del enum de DB no cambian; solo las etiquetas de UI):
```prisma
enum TeamRole { CSE VENTAS CSL MARKETING DEV ADMIN SUPER_ADMIN }
// Labels UI: VENTAS="Sales", ADMIN="Asistente administrativo" (ROLE_LABEL, lib/auth/roles.ts)
```

**Desde la migración PERM (2026-07) los permisos son una MATRIZ SECCIÓN×ACCIÓN
editable por UI** (`/team`, solo SUPER_ADMIN), no una tabla estática en código:

- **Registry** (`lib/auth/permissions/registry.ts`, client-safe): fuente única de
  las 13 secciones y sus acciones (`clientes`, `handoff`, `kickoff`, `procesos`,
  `cronograma`, `ventas`, `marketing`, `cobranza`, `conocimientos`, `equipo`,
  `agentes`, `auditoria`, `configuracion`). Módulo nuevo = 1 entrada acá → aparece
  solo en el modal de permisos. `enforced:false` = declarada pero sin guard aún
  (el modal la oculta — nunca un switch mentiroso).
- **Precedencia** (`engine.ts`, server-only): `DEFAULT_MATRIX` (código, = el
  comportamiento histórico exacto; congelado por test) ← `RolePermission`
  (plantilla por rol, DB, cache TTL 60s) ← `TeamMember.permissionOverrides`
  (pines por usuario, Json sparse). **SUPER_ADMIN = all-true hardcodeado**
  (anti-lockout: ni DB ni overrides lo recortan; tampoco se puede degradar al
  último SA activo).
- **Compat**: `requireCapability`/`guardCapability`/`withCapability` siguen
  existiendo — sus entrañas traducen la capability legacy a su celda
  (`CAPABILITY_TO_PERMISSION`, compat.ts) y consultan el engine. Los ~70 call
  sites no se tocaron. `hasCapability` (sync) quedó @deprecated: solo ve el
  default de código.
- **Guards nuevos**: `guardPermission(section, action)` / `withPermission(...)` /
  `requirePermission(...)`; validación de escritura con zod estricto contra el
  registry (`schema.ts`), lectura de Json tolerante.
- **Generación con IA**: los agentes que ESCRIBEN artefactos piden
  `generate` (artefacto inexistente) o `regenerate` (ya existe) de su sección
  (`lib/auth/permissions/artifact-gate.ts`, cableado en analyze y timeline/assist).
- **UI**: `/api/me` expone `permissions` (mapa EFECTIVO); `useMe()` y el Sidebar
  (vía AppShell server-side) gatean cosméticamente con él. Las viejas whitelists
  (`sales-roles.ts`, `marketing-roles.ts`, `cobranza-roles.ts`) quedaron como
  espejos congelados @deprecated.

El ROW-LEVEL (qué CLIENTES ve cada uno) es ortogonal a esta matriz y sigue en
`lib/auth/access.ts` (ver 4.3/4.4): CSE scoped por owner/GRANT/REVOKE; la celda
`clientes.viewAll` reemplaza a la capability `seeAllClients` como "ve todo".

### 4.3 Asignación CSE ↔ Cliente — sistema dual

**Granularidad: el acceso se otorga a nivel CLIENTE, no a nivel proyecto.** Si un CSE es owner en HubSpot de al menos un proyecto de un cliente, tiene acceso a **todos** los proyectos y datos de ese cliente, incluidos los proyectos donde otros CSE son owner. Esta decisión es intencional: el equipo es pequeño y colaborativo, y compartimentar por proyecto generaría silos innecesarios — el contexto completo del cliente (otras conversaciones, otras decisiones, otros riesgos en paralelo) es deseable para que cualquier CSE colabore inteligentemente. Si en el futuro aparece un caso real donde se necesite confidencialidad entre proyectos de un mismo cliente (ej. un consultor freelance que solo puede ver un proyecto), esta regla debe revisarse — pero hoy se decide explícitamente lo contrario.

**Default automático**: el campo ya existente `Project.hubspotOwnerEmail` define qué CSE es owner de cada proyecto. Por extensión, ese CSE tiene acceso al cliente (y por la regla de granularidad de arriba, a todos los proyectos del cliente). Cambio cero en datos: aprovechamos lo que ya viene de HubSpot.

**Override manual bidireccional**: tabla `ClientAssignment`
```prisma
model ClientAssignment {
  id          String   @id @default(cuid())
  clientId    String
  teamMemberId String
  kind        AssignmentKind                  // GRANT | REVOKE
  grantedById String                          // FK a TeamMember admin/super
  reason      String?  @db.Text
  createdAt   DateTime @default(now())

  @@unique([clientId, teamMemberId])
}
enum AssignmentKind { GRANT REVOKE }
```

- `GRANT`: admin le da acceso a un CSE a un cliente que NO es su owner en HubSpot.
- `REVOKE`: admin le quita acceso a un CSE a un cliente que SÍ es su owner en HubSpot (raro pero útil).

**Permiso "ver todos los clientes"** otorgado por admin (caso "Pedro necesita ver el portfolio entero esta semana"):
```prisma
model TeamMember {
  // ...
  canViewAllClients Boolean @default(false)
  canViewAllExpiresAt DateTime?              // opcional, para grants temporales
}
```

### 4.4 Helper de ownership

```ts
// lib/auth/access.ts
export async function requireAccessToClient(clientId: string): Promise<{
  user: AppUser;
  reason: "super-admin" | "view-all" | "hubspot-owner" | "granted" | "external-owner";
}>
```

Lógica de resolución:
1. Si el user no está logueado → 401.
2. Si es `EXTERNAL` y `user.clientId === clientId` → OK (reason: external-owner). Si no, 403.
3. Si es `INTERNAL` con role `SUPER_ADMIN` → OK.
4. Si tiene el permiso EFECTIVO `clientes.viewAll` (default VENTAS/DEV/CSL/MARKETING;
   editable por plantilla/overrides) → OK (reason: view-all).
5. Si tiene el flag `canViewAllClients=true` (y no expiró) → OK (reason: view-all).
6. Si existe `ClientAssignment(clientId, teamMemberId|targetRole, kind=REVOKE)` → 403, fin.
7. Si tiene `ClientAssignment(clientId, teamMemberId|targetRole, kind=GRANT)` → OK.
8. Si el cliente tiene algún `Project.hubspotOwnerEmail === user.email` → OK.
9. Si no → 403.

**Endpoints internos** llaman a `requireAccessToClient(clientId)` en la primera línea. **Endpoints externos** viven en `app/api/external/<modulo>/...` y filtran por `clientId` del JWT sin excepción.

### 4.5 Row Level Security en Supabase

**Estado actual (junio 2026, post-Fase 1 del módulo externo)**: lock-down total.

**Regla simple**: **TODAS las tablas del schema `public` tienen RLS habilitado** (31 de 31, excepto `_prisma_migrations` que es metadata interna de Prisma y no se expone vía PostgREST). La mayoría sin policies SELECT — con anon/JWT no se lee nada. Solo bypassean los roles `postgres` (que usa Prisma) y `service_role`, ambos con `BYPASSRLS=true`.

**Por qué TODAS y no solo las cliente-visibles**: descubrimos durante la verificación que Supabase, por default, auto-otorga `GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon`. Eso significa que **cualquier tabla sin RLS habilitado es leíble con la publishable key**, que está en el bundle JS del browser y por lo tanto disponible para cualquier persona. Antes del lock-down total, `FirefliesSession` (15.385 transcripts), `TeamMember` (16 emails internos), `AgentRun` (61 outputs IA crudos) y `KnowledgeDocument` (contenido propietario) eran extraíbles con una llamada `supabase.from(t).select('*')` desde cualquier máquina. El plan original había declarado "alcance quirúrgico, solo las 5 tablas de la superficie externa" — eso fue diagnóstico incorrecto. La regla correcta es "RLS en todo, policies SELECT solo donde se necesite acceso externo legítimo".

**Tabla con policy explícita (1)**:
- `HubspotAccount` tiene `deny_all_non_superuser` AS `RESTRICTIVE FOR ALL TO PUBLIC USING (false)`. Bloquea TODO para cualquier rol no-superuser, incluso si después alguien agrega policies permisivas (las RESTRICTIVE se AND, las PERMISSIVE se OR — `false AND anything = false`). Defensa en profundidad para los tokens OAuth de HubSpot (que hoy están en texto plano — deuda 🟡 #17).

**Cómo conviven RLS y los dos modos de acceso a DB**:
- **Queries internas** usan Prisma con `DATABASE_URL` privilegiado (rol `postgres` con `BYPASSRLS`). RLS las ignora. Los helpers `requireInternalUser()` + `requireAccessToClient()` son la primera barrera.
- **Queries externas** (cuando existan) deberán usar el cliente Supabase con JWT del usuario externo (no `service_role`). RLS hace de segunda barrera incluso si un endpoint olvida filtrar.
- **Las 5 tablas de la superficie externa futura** (`Project`, `Client`, `ClientContextCard`, `ActionItem`, `SessionMinute`) son donde se agregarán policies SELECT cuando se construya el landing — filtros tipo `EXISTS (... project_id = jwt.project_id)`. El resto de las 31 tablas se quedan permanentemente con lock-down (sin policy SELECT) porque el cliente externo nunca debe leerlas.

**Verificación de aislamiento (debe correrse después de tocar policies)**:
```js
// Con NEXT_PUBLIC_SUPABASE_ANON_KEY (publishable):
const supabase = createClient(url, anonKey);
for (const t of ALL_PUBLIC_TABLES) {
  const { count } = await supabase.from(t).select('*', { count: 'exact', head: true });
  console.log(t, count); // Debe ser 0 en TODAS hasta que existan policies SELECT del landing.
}
```

**Por qué**: hoy la app confía 100% en autenticación a nivel app y 0% en autorización a nivel DB. Cuando llegue el cliente externo, esa confianza explota — un usuario externo malicioso podría editar el ActionItem de otro cliente con un `curl`. El modelo dual (auth unificada + ownership por HubSpot + override + RLS) cierra el boquete con redundancia. Y mientras tanto, el lock-down total protege contra extracción casual con la publishable key (que NO es un secreto — está en el bundle del cliente).

---

## 5. Aislamiento de módulos

**Regla**: los módulos se comunican **solo** a través de sus exports públicos. Está prohibido importar archivos internos de otro módulo.

**Lo permitido**:
- `lib/foo/index.ts` exporta las funciones públicas del módulo `foo`.
- `lib/bar/algo.ts` puede importar `from "@/lib/foo"` y obtener solo lo expuesto.
- Cualquier módulo puede importar de `lib/db`, `lib/auth`, `lib/api`, `lib/anthropic.ts` y las carpetas de integración (`lib/hubspot`, `lib/google`, `lib/data-lake` — §7).

**Lo prohibido**:
- `lib/bar/algo.ts` importando `from "@/lib/foo/queries"` directamente (rompe encapsulación).
- Components React importando `prisma` directo. Use los exports del módulo (`lib/foo/queries.ts`) o un endpoint API.
- Ciclos. Si dos módulos se necesitan mutuamente, extraer la parte común a un tercero o a `lib/api/shared/`.

**Verificable con regla de ESLint** (a configurar): `import/no-internal-modules` con patrón que solo permita `lib/<modulo>/index.ts` cruzando módulos.

**Por qué**: hoy hay god routes (`app/api/clients/[id]/analyze/route.ts` con 1500 líneas mezclando 4 dominios) y god components (`ProjectCanvasPanel.tsx` con 1000 líneas) que serían imposibles de mantener si crece el equipo. Forzar aislamiento empuja a partir responsabilidades.

---

## 6. Capa de IA (Anthropic / Claude)

**Reglas**:

1. **Una sola instancia del SDK**: `lib/anthropic.ts` exporta el cliente lazy. Prohibido instanciar `new Anthropic()` en otro lado.
2. **System prompts viven en `Agent.systemPrompt` (DB)** cuando se quieren editar sin redeploy. Si el agente es interno-permanente y nunca cambia, puede vivir como constante en `lib/<modulo>/agents/<name>.ts` — pero documentado.
3. **Parsing de output JSON pasa por un helper compartido** — ⚠ `lib/ai/parse-json-output.ts`
   **NO EXISTE TODAVÍA** (deuda #11 de §12). Lo que SÍ existe y se reusa hoy:
   `lib/ai/section-schema.ts` (`coerceToSchema`/`parseObject`, extraído del canvas-agent) y
   `repairTruncatedJson` para outputs cortados. La regla vigente: ningún caller nuevo escribe
   su propio `JSON.parse(rawText.match(...))` — usa esos helpers o construye el unificado.
4. **Cada agente vive en `lib/<modulo>/agents/<nombre>.ts`** y exporta una función `run<Nombre>Agent(input: T): Promise<R>`. La función es la única abstracción que conoce el shape del prompt + parseo + persistencia para ese agente.
5. **Cada ejecución persiste un `AgentRun`** con `agentId`, `sourceSessionIds`, `output`, `status`, `clientId`/`projectId` — trazabilidad obligatoria.
6. **Rate limiting + tracking de costos** (deuda): wrapper `callClaude(params, ctx: { agentId, clientId })` que registra tokens consumidos en un nuevo modelo `ClaudeUsage`. A implementar antes del primer proyecto que dispare >50 llamadas/día.

**Por qué**: la IA es un costo variable y un punto único de error. Centralizar el parseo evita 6 maneras distintas de fallar; centralizar el tracking evita facturas sorpresa.

---

## 7. Integraciones externas (HubSpot, Google, Anthropic, Apify)

**Regla**: una carpeta por integración, una interfaz pública por integración, y **ninguna llamada HTTP a un tercero fuera de esa carpeta**.

**Estructura REAL** (reescrita 2026-08-01 — la versión anterior describía una carpeta
`lib/integrations/` que nunca se construyó y una integración Fireflies eliminada el
2026-06-04; ver docs/CHANGELOG.md):

```
lib/hubspot/       # la integración más grande (~22 archivos): client/token del sistema,
                   #   companies, deals, projects (objeto 0-970), sync-projects,
                   #   handoff-sync, social-broadcast (API legacy, at-risk — ver RUNBOOK)
lib/google/        # auth (service account + DWD), calendar, drive-files, meet — Meet es
                   #   LA fuente de sesiones (la caché local conserva el nombre de modelo
                   #   FirefliesSession por historia, no porque Fireflies siga)
lib/anthropic.ts   # el cliente Claude: singleton lazy vía Proxy — §6 regla 1
lib/data-lake/     # el Supabase secundario (Data Lake)
lib/marketing/     # contiene el adaptador de Apify (InspirationProvider) — scraping de
                   #   inspiración para el módulo de Contenido
```

Consolidarlas bajo `lib/integrations/` fue el plan original y NO se hizo; si algún día se
hace, es una movida mecánica coordinada (imports masivos), no una regla pendiente de
cumplimiento diario. La regla viva es la de arriba: nada de HTTP a terceros fuera de la
carpeta de su integración.

**Reglas duras** (vigentes tal cual):

1. **Tokens y secretos viven solo en env vars o en `HubspotAccount.accessToken` (cifrado a futuro, hoy plano).** Prohibido hardcodear, prohibido logger.
2. **Endpoints externos NUNCA se llaman sincronicamente desde una route del usuario** si pueden tardar >2s. Use `Promise.allSettled` + degradación graceful (devolver lo que tengamos local) o background job (queue).
3. **Cacheo de respuestas externas obligatorio para reads repetidos**: `unstable_cache` + `revalidateTag` con tag por entidad (`hubspot-company:${domain}`). Hay un buen ejemplo en `lib/cache/clients.ts`.
4. **Errores de integración no rompen la response del usuario.** Catch, log, devolver lo que se tiene + flag `partial: true` en la respuesta.
5. **Cada integración expone tipos propios y NO devuelve los tipos crudos del SDK del tercero.** Aislamos a Nexus de cambios upstream.

**Por qué**: HubSpot es la integración mejor centralizada y se nota — es la que menos se rompe. Generalizar ese patrón a todas las integraciones.

---

## 8. Server Components, Client Components y data flow

**Regla**: data fetching tiene **dos modos** y ninguno más.

1. **Server Components leen de `lib/<modulo>/queries.ts`** (que internamente usa Prisma). Pasan datos serializables a Client Components como props.
2. **Client Components fetchean de `app/api/<modulo>/...`** cuando hay interactividad / mutaciones.

**Prohibido**:
- Client Components importando `prisma`.
- Server Components haciendo `fetch("/api/...")` a sí mismos (ineficiente: pasar por el módulo local).
- Server Components escribiendo a Prisma directo. Las mutaciones van por API routes o Server Actions tipadas.

**Server Actions** (`"use server"`): permitidas para mutaciones simples. Reglas iguales que API routes: validar input con Zod, verificar ownership.

**Por qué**: separar lectura de mutación + concentrar acceso a DB en `queries.ts`/`mutations.ts` hace los componentes testeables y los flujos de datos predecibles.

---

## 9. Convenciones de TypeScript y código

- **Sin `any` salvo justificación inline con `// eslint-disable-next-line @typescript-eslint/no-explicit-any -- razón`**.
- **Sin `as Foo` salvo en límites con APIs externas tipadas como `unknown`**.
- **Verificación obligatoria antes de dar un cambio por terminado**: correr `npx tsc --noEmit`. El baseline es **0 errores** (`tsc-baseline.txt` — se cerró la deuda de los 29 históricos) y **`next build` type-checkea** (`ignoreBuildErrors` se desactivó el 2026-07-07, y `tsconfig` incluye `scripts/`): un error de tsc en cualquier archivo FRENA el build de producción. **El CI existe** (`.github/workflows/ci.yml`, cada push/PR): ratchet de tsc contra `tsc-baseline.txt`, ratchet de eslint (solo errores) contra `eslint-baseline.txt`, y la suite unit. Si bajás un conteo, bajá el baseline en el mismo PR (el propio CI lo pide con un `::notice`).
- **Imports absolutos con `@/`**, prohibidos los `../../../`.
- **Naming**: archivos kebab-case (`post-process.ts`), componentes React PascalCase (`ProjectGPS.tsx`), tipos PascalCase, funciones y variables camelCase.

> Construido el 2026-07: el CI de GitHub Actions falla si el contador de tsc o de eslint sube respecto del baseline commiteado. Lo que el CI NO corre: `next build` (el único build de prod ocurre en deploy.sh) ni `check:invariants` (necesita la DB real — corre desde dev vía /ship-nexus).

---

## 10. Tests y verificación

**Mínimo exigible hoy** (single dev + Claude Code):

- **Todo módulo NUEVO nace con `lib/<modulo>/*.test.ts` (Vitest)** que cubre el happy path y al menos un error path del helper público principal. Sin esto, el módulo no está terminado.
- **Antes de dar por terminado un cambio en un módulo con tests**, correr `npm test -- lib/<modulo>` y verificar que pasen.
- **Si tocás `prisma/schema.prisma`**: NO existe una "DB de dev" y `db push` está prohibido — el flujo completo (SQL aditivo a mano + `migrate diff` como detector + `prisma generate` + `check:invariants`) está en **Parte 0 · cap. D**. El smoke sigue siendo abrir una ruta que use el modelo y ver que carga.

**La suite vive y frena merges**: 130 archivos / ~1500 casos bajo `lib/` (el conteo exacto lo vigila `doc-sync`), organizados en las cinco familias de la Parte 0 · cap. F — unit de motor, golden, ratchets, escaneos estructurales y registros congelados. Módulo nuevo sin tests = módulo no terminado (regla de arriba, ahora sí cumplida por los módulos recientes: cobranza, timeline, roles, marketing…). Los módulos viejos sin cobertura se cubren cuando se tocan.

> El project `integration` está VIVO desde el 2026-08-01 (F4): `npm run test:int` contra la base local `nexus_test` (ver Parte 0 · cap. F). *Pendiente real*: crecer la suite (hoy cubre el chokepoint de sesiones y el acceso de Roles) y llevarla al CI con un service container.

---

## 11. Cómo se evoluciona este documento

Como Nexus lo construye una sola persona apoyada por Claude Code, no hay reviewer humano que controle el cumplimiento. Las reglas son:

- **Cuando una regla deja de tener sentido por un cambio de contexto, se edita este documento ANTES de escribir el código que la viola.** Si descubrís que una regla no calza en medio de implementar algo, parás, actualizás esta página, y seguís.
- **Antes de dar un cambio significativo por terminado, contrastarlo contra este documento.** Una forma práctica: pedirle a Claude Code "revisá este cambio contra ARCHITECTURE.md y decime qué reglas viola, si alguna". Claude actúa como el reviewer que no tenemos.
- **El changelog vive en `docs/CHANGELOG.md`** (se extrajo de acá el 2026-08-01: había crecido hasta ser el 71% del peso del archivo y cada tanda agregaba una entrada al final en vez de corregir la regla que arriba quedaba mintiendo). La regla nueva: cuando una tanda invalida una sección de este documento, se corrige LA SECCIÓN — la entrada del changelog no la reemplaza. `lib/docs/doc-sync.test.ts` congela los números verificables de la Parte 0.

> *Para cuando el equipo crezca*: convertir esto en PRs con reviewer humano + el archivo entra al code-owners de CODEOWNERS para que cambios requieran aprobación explícita.

---

## 12. Deuda pendiente (lo que el código actual no cumple)

El criterio para separar las dos listas: **¿impide esto exponer datos a un cliente externo de forma segura?** Si sí, es bloqueante. Si no, es deuda normal (igual hay que cerrarla, pero no detiene el lanzamiento del módulo externo).

### 🔴 Bloqueante para abrir la superficie externa

Nada de lo siguiente puede quedar pendiente cuando se exponga el primer cliente final:

1. ~~**Migrar autenticación a Supabase Auth + `AppUser` + `TeamMember.role`**~~ ✅ **HECHO** (junio 2026 — Fases A-E del plan).
2. ~~**Implementar `requireAccessToClient(clientId)`** y aplicarlo en los endpoints que el módulo de onboarding va a tocar.~~ ✅ **HECHO** (Fase F del plan — ~30 endpoints protegidos).
3. ~~**Agregar autenticación a `PUT /api/projects/[projectId]/current-step`**~~ ✅ **HECHO** (Fase F).
4. ~~**Habilitar RLS en Supabase** para las tablas que la superficie externa va a tocar **y** policy DENY explícita en tablas con secretos (`HubspotAccount.accessToken`, `refreshToken`) para cualquier rol distinto de `service_role`. Segunda barrera por si un endpoint olvida filtrar.~~ ✅ **HECHO** (junio 2026 — Fase A del plan Fase 1 del módulo externo). Lock-down inicial: RLS en `Project`, `Client`, `ClientContextCard`, `ActionItem`, `SessionMinute`; policy RESTRICTIVE en `HubspotAccount`. Policies SELECT para el cliente externo se agregan cuando se construya el landing.
5. ~~**Crear `ClientAssignment` + campo `canViewAllClients` en `TeamMember`.**~~ ✅ **HECHO** (Fase A del plan).

### 🟡 Deuda que conviene cerrar pronto pero no bloquea el onboarding

Cosas que duelen, pero el módulo externo puede abrirse sin tenerlas resueltas (siempre que los 5 anteriores estén OK):

6. **Adoptar Zod en todos los endpoints POST/PATCH/PUT** vía `parseBody(req, schema)`. Empezar por los del módulo externo (esos sí en la 🔴), después barrer el resto.
7. **Migrar `accountId` → `clientId` en `Audit`, `Implementation`, `Knowledge`** y borrar el campo viejo (deuda declarada hace meses).
8. **Borrar `Project.canvas`** (marcado DEPRECATED, no se usa).
9. **Refactor de `app/api/clients/[id]/analyze/route.ts` (1500 líneas)** en submódulos `lib/agents/`.
10. **Refactor de `components/clients/ProjectCanvasPanel.tsx` (1000 líneas)** dividiendo responsabilidades.
11. **Centralizar parseo JSON de Claude** en `lib/ai/parse-json-output.ts` (helper aún NO construido — hoy lo más cercano es `lib/ai/section-schema.ts`) y migrar los callers.
12. ~~**Resolver los 29 errores TypeScript baseline.**~~ ✅ **HECHO** (baseline en 0 desde 2026-07, `tsc-baseline.txt`; el ratchet del CI impide que vuelva a subir).
13. **Sincronizar `ActionItem.done` con `status === "DONE"`** o eliminar uno. Quedarse con `status` (más expresivo).
14. **Eliminar `Project.lastSessionSummary`** y leer siempre de `SessionMinute` (último primario).
15. **Test suite mínimo** para `lib/sessions/`, `lib/projects/`, `lib/canvas/` cuando se toquen.
16. **Rate limiting + `ClaudeUsage` tracking** antes de cualquier flujo que dispare >50 llamadas/día.
17. **Cifrado en reposo de `HubspotAccount.accessToken`** (Supabase Vault).
18. **Cerrar el `__strategy__` magic string** en una constante exportada.
19. **Borrar `Project.pendingItems`** (Json deprecated) tras confirmar 0 lectores.
20. **Reconciliar `lib/matching/cascade.ts` vs `lib/sessions/categorize.ts`** (nombres similares, conceptos solapados).
21. **Rotar la `sb_secret_...` de Supabase Auth** (quedó en transcript de chat al pegarla durante setup). No urgente porque hoy no se usa server-side activamente, pero higiénico.
22. **Aplicar `requireAccessToClient` al resto de endpoints fuera del onboarding**: `/api/hubspot/*`, `/api/knowledge/*`, `/api/agents/*`, `/api/sales/*`, `/api/audits/*`. Hoy quedan con `requireConsultantSession` (gate por sesión) pero sin ownership.
23. **Re-apuntar el agente `preparacion` (DEUDA del retiro del Resumen).** El grupo `preparacion` todavía emite `ClientContextCard` a `canvasSection="procesos"` (vía `GROUP_TO_SECTION` en `app/api/clients/[id]/analyze/route.ts`) — un sistema RETIRADO: el canvas Resumen se eliminó y "procesos" ahora vive como `CanvasBlock` en "Información del cliente". Mientras esto no se cierre, **cada corrida de `preparacion` escribe cards que ya no se renderizan en ningún lado**. Cerrar = migrar el agente a block-format y rutear su salida a la sección `procesos` del canvas de Información del cliente (cross-project: el strategy project `__strategy__` del cliente). La data EXISTENTE ya se migró con `scripts/migrate-procesos-to-blocks.ts`.
24. **Limpiar el subsistema de cards muerto en `ProjectCanvasPanel.tsx`.** Tras el retiro del Resumen, `isResumenCanvas` es siempre false y toda la grilla masonry de cards + las effects de `canvas-cards` + sus handlers quedan como código muerto (gateado y marcado DEPRECATED). Borrarlo junto al endpoint `app/api/projects/[id]/canvas-cards` y `DEFAULT_SECTIONS`. (Relacionado con el ítem 10.)
25. **Pinear Node a 24 en los TRES entornos** (retirado de la tanda del 2026-08-01 a propósito: es el único cambio que toca el runtime de PROD y merece su propio deploy con su propio smoke). Hoy: local 24.x y CI 24, imagen Docker `node:22-bookworm-slim`, `@types/node` en `^20` — los tipos van 2-4 majors atrás del runtime. El paquete completo: `engines: { "node": ">=24 <25" }` en package.json + `.nvmrc` con `24` + `.npmrc` con `engine-strict=true` + `Dockerfile` a `node:24-bookworm-slim` (bcrypt se recompila y Chrome-for-Testing se re-baja en el build; deploy.sh rebuildea siempre y el rollback `nexus:prev` cubre) + `@types/node` a `^24`.

---

## 13. Por dónde empezar

No intentes todo a la vez. La secuencia mínima para no atorarte es:

1. ~~**Base de identidad**: Supabase Auth + `AppUser` + `TeamMember.role` + helpers de auth.~~ ✅ **HECHO**.
2. ~~**Helper `requireAccessToClient`**: implementarlo y aplicarlo solo en los endpoints que el módulo de onboarding va a tocar.~~ ✅ **HECHO**.
3. ~~**Resto de los 🔴**: tapar `current-step` sin auth, crear `ClientAssignment` + `canViewAllClients`.~~ ✅ **HECHO**.
4. ~~**RLS** + DENY de tablas con secretos.~~ ✅ **HECHO** (lock-down inicial — junio 2026).

**Ya no quedan ítems 🔴 sin tachar.** Los cimientos de seguridad están listos para abrir el módulo de onboarding por capas. Próximos planes a encarar (en orden sugerido, cada uno con su propio documento de plan):

a. ~~**Mecanismo de acceso del cliente externo** (token + contraseña por proyecto)~~ ✅ **HECHO** (Fase 1 del módulo externo, junio 2026). Modelo `ProjectExternalAccess` + endpoints `/api/projects/[id]/external-access` (CSE) + `/api/external/verify-access` (cliente) + página mínima `/external/verify/[token]`.
b. ~~**Agente de handoff Sales→CS + cronograma estructurado**~~ ✅ **HECHO** (Fase 2 del módulo externo, junio 2026). Agente "Análisis inicial" reorientado a "Handoff Sales→CS" con 8 secciones laser-focused (formato block). Canvas "Handoff" agregado a `DEFAULT_PROJECT_CANVASES` + migrado retroactivamente. Modelos `ProjectTimeline` + `TimelinePhase` + enum `TimelinePhaseSource`. Endpoints `GET/PUT/DELETE /api/projects/[id]/timeline`. El agente NUNCA pisa el cronograma existente al re-ejecutarse — la propuesta queda en `AgentRun.output` para trazabilidad.
c. **Landing real del cliente externo** — pendiente. Decide:
   - Cómo se mueve el token fuera de la URL (cookie HTTP-only post-verify, header Authorization, magic link a sesión Supabase EXTERNAL).
   - Qué tablas se exponen y con qué policies SELECT (filtro por `projectId` derivado del JWT/session claim).
   - Qué UI tiene (cronograma calculado con `anchorStartDate + sum(durationWeeks)*7d`, cards del Handoff publicadas, docs, minutas REVIEWED).
d. **Publicación selectiva** desde el panel del CSE al landing (qué bloques del Handoff van al landing, modelo de approval).

La regla operativa para futuro: **no exponer ningún endpoint externo nuevo sin que su tabla destino tenga RLS habilitado con policy SELECT específica** que filtre por el contexto del cliente externo (no por anon abierto).

### ⚠ Recordatorios operativos (lessons learned)

- **Ningún DDL habilita RLS automáticamente** en tablas nuevas. Cada vez que agregás una tabla, el `.sql` de la migración lleva su `ALTER TABLE "X" ENABLE ROW LEVEL SECURITY` explícito (los headers de `scripts/sql/` ya lo hacen; `prisma/policies.sql` es la red idempotente). Verificá con `SELECT rowsecurity FROM pg_tables WHERE tablename='X'`. Sin esto, anon puede leer la tabla con la publishable key del bundle — abre el agujero que cerramos en Fase 1.
- **Reiniciar el dev server después de cambios al schema** o de regenerar el cliente Prisma. Si no, el endpoint sigue usando el cliente viejo cacheado y revienta silenciosamente al usar modelos nuevos.
- **El gate `useBlockFormat` en `analyze/route.ts`** es la llave que decide si un agente escribe `ClientContextCard` (canvas Resumen) o `CanvasBlock` (canvases custom como Diagnóstico/Handoff). Agentes que apuntan a canvases custom DEBEN estar en `BLOCK_FORMAT_AGENT_IDS` y su prompt debe devolver `{ sections: [{ key, blocks: [...] }] }`. Sino sus cards se persisten pero NO se renderizan.
- **Aplicar un `.sql` NO regenera el cliente Prisma.** Tras cualquier cambio de schema, corré `npx prisma generate` y reiniciá el dev server (el flujo completo está en Parte 0 · cap. D; `db:sync` se eliminó el 2026-08-01 porque encadenaba el prohibido `db push`). Síntoma si te lo saltás: `PrismaClientValidationError: Invalid value for argument 'X'. Expected <Enum>` y el write **falla en silencio**. Caso real: agregamos `MODIFIED` a `BlockSource` sin regenerar → toda edición de bloque AGENT lanzaba en el PUT y la corrección del CSE no persistía (Handoff, Kickoff y Diagnóstico/Planificación).

---

## Changelog

Vive en **[docs/CHANGELOG.md](docs/CHANGELOG.md)** (extraído el 2026-08-01: era el 71% del
peso de este archivo). El porqué de cada regla va a `docs/DECISIONS.md`; el qué-cambió-cuándo
va allá. Este documento se corrige EN EL LUGAR cuando una regla queda vieja — nunca
agregando una entrada al final que la contradiga.
