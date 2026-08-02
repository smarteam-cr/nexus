# Nexus — guía para Claude Code

Nexus es el sistema interno de Smarteam (agencia HubSpot) para gestionar clientes: ingiere
sesiones de Google Meet, las clasifica por cliente y proyecto, y genera handoff, kickoff,
cronograma y procesos con agentes (Claude). Stack: **Next.js 16** (App Router, Turbopack) ·
**Prisma 7** (`@prisma/adapter-pg`) · **Supabase** Postgres · **Tailwind v4** · Anthropic
SDK · HubSpot/Google Workspace/Apify (versiones exactas: ARCHITECTURE Parte 0 · cap. A).

- Arquitectura detallada + referencia rápida (stack/local/DB/tests): @ARCHITECTURE.md
- Decisiones tomadas (no re-litigar): @docs/DECISIONS.md
- Glosario de dominio: @docs/GLOSSARY.md
- Errores conocidos (no tropezar dos veces): @docs/KNOWN-ERRORS.md
- Operación de PRODUCCIÓN (deploy, rollback, jobs, invariantes de infra): @docs/RUNBOOK.md

## ⛔ INVARIANTES MEDULARES (no negociables)

1. **NUNCA mezclar contexto entre clientes.** Toda generación que arma contexto desde sesiones
   DEBE sacarlas por el chokepoint `lib/sessions/project-sources.ts`
   (`getProjectHandoffSessions` / `getClientSessions`), nunca leyendo `SessionProject` /
   `FirefliesSession` por su cuenta. La fuente ÚNICA de "de quién es la sesión" es
   `FirefliesSession.resolvedClientId`. Un consumidor nuevo de sesiones pasa por el chokepoint.
   `npm run check:invariants` falla si algún `SessionProject` cruza cliente.
2. **El resolver de cliente vive en UN solo lugar:** `lib/sessions/categorize.ts` (cascade) →
   materializado en `resolvedClientId` por `lib/sessions/resolve-client.ts`. NO re-implementar
   matching sesión→cliente en otro lado (hubo 3 copias que causaron un leak). Regla de oro de
   stopwords del title-match: NUNCA stopwordear un token que sea el nombre distintivo de un
   cliente real (`smarteam`, `distribuidora`…). Ver DECISIONS.
3. **`.env` apunta a PRODUCCIÓN** (una sola Supabase; local == PROD). Toda operación
   destructiva / DDL / escritura masiva es **dry-run-first** y la aplica el usuario tras revisar,
   SIEMPRE con `ALLOW_PROD_WRITE=1`: el guard (`scripts/lib/guard.ts`, INV12) imprime el host y
   aborta cualquier `--apply`, seed o comando de escritura del CLI de Prisma sin esa variable.
   Las migraciones son SQL ADITIVO a mano (flujo completo: ARCHITECTURE Parte 0 · cap. D);
   `db push` está prohibido y `db:sync` ya no existe.
4. **Los secretos van SOLO en `.env`** (gitignoreado, nunca se commitea). `.env.example` es la
   plantilla SIN secretos (verificado en disco y en todo el historial de git el 2026-08-01):
   toda variable nueva que el código lea se declara ahí con placeholder vacío.
5. **Tema = tokens semánticos, NO grises crudos.** Modo claro es el **default**; la fuente de
   verdad es la cookie `nexus-theme` que el SSR (`app/layout.tsx`) lee y materializa como
   `<html class="light">` (sin parpadeo). En UI interna usá SOLO los tokens —flipean solos en
   claro/oscuro—: `bg-surface` · `bg-surface-muted` · `bg-surface-hover` · `border-line` ·
   `text-fg` · `text-fg-secondary` · `text-fg-muted` · `text-brand` (+ `brand-light/soft/dark`).
   **Prohibido el gris crudo** (`bg-gray-*`, `text-white`, `text-gray-*`, `border-gray-*`…): NO
   flipea en claro → reproduce el bug de "lo nuevo se ve oscuro". Un scrim/overlay que DEBE ser
   oscuro en ambos modos usa `bg-black/NN`. La regla ESLint `no-restricted-syntax` (en
   `eslint.config.mjs`, severidad **warn**) marca los grises crudos en `app/**`/`components/**`
   (excluye landing/external/login/print/TimelineSection, que son hex literal a propósito) y el
   **ratchet `lib/ui/token-vocab.test.ts` frena el merge**: el conteo de grises por archivo solo
   puede bajar (patrón en `lib/ui/raw-neutral.mjs`, compartido entre ambos). El bloque
   `html.light` de `globals.css` remapea grises crudos legacy como **red de seguridad**,
   no como API — código nuevo va por tokens.
6. **Tuteo** en copy de UI nuevo (no voseo), salvo que el archivo ya esté en voseo.

## Convenciones
- Vertical slices por módulo; validación con Zod en las fronteras; RBAC por capability
  (`lib/auth/roles.ts`, `guardCapability`). Detalle en @ARCHITECTURE.md.
- Server Components por default; `"use client"` solo donde haga falta.
- Commits: mensaje vía `-F archivo`, **sin BOM** y **sin "/" suelto** (un hook los rechaza).

## Flujo de trabajo
- `tsc --noEmit` + `eslint` sobre lo **tocado** antes de cerrar. **`next build` type-checkea**
  (`ignoreBuildErrors` se DESACTIVÓ el 2026-07-07 — ver el comentario en `next.config`): un
  error de `tsc` en CUALQUIER archivo (`tsconfig` incluye `scripts/`) FRENA el build de prod
  (`docker compose up -d --build`). Baseline real = **0 errores**; nunca descartes un error de
  `tsc` como "baseline/ajeno" sin verificar que ya existía. Antes de pushear algo que roce tipos,
  `npm run build` verde (o `tsc --noEmit` en 0 en todo el proyecto). El gate de datos sigue
  siendo `npm run check:invariants` + el ojo.
- Antes de commitear: correr **`/ship-nexus`** (invariantes + tsc/lint en lo tocado + checklist).
- **No push hasta que el usuario lo pida.**
- Tras un cambio de schema (aplicar el `.sql` + `npx prisma generate`): **reiniciar el dev
  server** (el Prisma client viejo no entra por HMR). Tras `git pull` que toca CSS/config:
  `rm -rf .next` + reiniciar.
- El navegador del preview NO está logueado (middleware → login) → el E2E de UI autenticada lo
  hace el usuario por HMR; el bar de Claude = tsc+lint limpio + dev compila.

## Receta: "traeme clientes a la local" (EJECUTAR COMPLETO, sin preguntar)

Cuando Elías pida traer clientes / datos reales / contexto real a la base local —en esta PC o
en la otra— **corré la secuencia entera hasta el `--apply`**. No pares en el dry-run ni pidas
confirmación: el destino es SIEMPRE `nexus_local`, con candado sin excepción
(`assertLocalWriteOnly`, ni `ALLOW_PROD_WRITE` lo destraba), y de PROD solo se LEE. No hay
nada que aprobar. El `.env` NO se toca.

```bash
npm run db:local -- up          # 1. la base local tiene que estar arriba (idempotente)
```

**Por actividad** — el default cuando no nombra a nadie ("traeme unos clientes", "armá un
ambiente parecido al real"). Trae los N de CARTERA con la sesión MÁS RECIENTE. Si no dice
cuántos, usá **10**:

```bash
npm run db:local:pull -- --recientes 10 --apply
```

**Por nombre** — cuando nombra clientes concretos. Coma como separador, comillas siempre:

```bash
npm run db:local:pull -- --client "Wherex,Honda Costa Rica,kölbi" --apply
```

Después: **reportá los conteos que imprime el script** (clientes, proyectos, sesiones, cuántas
con transcript) y decile que recargue el 3005. NO hace falta reiniciar el dev server (los datos
no entran por el Prisma client) ni correr `db:local -- acceso` (el pull ya copia el roster).

Notas para no equivocarse:
- Es ACUMULATIVO e idempotente: sumar clientes no borra los anteriores ni duplica. Para empezar
  de cero, `npm run db:local -- reset` (rehace catálogo + mundo `fx-`).
- Un nombre que matchea varios aborta el LOTE ENTERO mostrando los candidatos: releé la salida,
  elegí el nombre exacto y volvé a correr. No inventes cuál era.
- `--project <id>` solo vale con UN cliente.
- Si además quiere probar el ciclo "creo el proyecto en HubSpot y Nexus lo agarra":
  `npm run db:local -- hubspot` (copia la conexión; el token vive en la tabla `HubspotAccount`,
  no en el `.env`). ⚠ Con eso el Nexus local habla con el HubSpot REAL — leer es inocuo, pero
  crear handoff / handoff-sync / borradores sociales SÍ escriben allá.
