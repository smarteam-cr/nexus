# Nexus — guía para Claude Code

Nexus es el sistema interno de Smarteam (agencia HubSpot) para gestionar clientes: ingiere
sesiones (Google Meet / Fireflies), las clasifica por cliente y proyecto, y genera handoff,
kickoff, cronograma y procesos con agentes (Claude). Stack: **Next.js 16** (App Router,
Turbopack) · **Prisma 7** (`@prisma/adapter-pg`) · **Supabase** Postgres · **Tailwind v4** ·
Anthropic SDK · HubSpot/Google/Fireflies.

- Arquitectura detallada: @ARCHITECTURE.md
- Decisiones tomadas (no re-litigar): @docs/DECISIONS.md
- Glosario de dominio: @docs/GLOSSARY.md
- Errores conocidos (no tropezar dos veces): @docs/KNOWN-ERRORS.md

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
   destructiva / DDL / escritura masiva es **dry-run-first** y la aplica el usuario tras revisar.
   Las migraciones se aplican **a mano** a PROD (el deploy NO corre `db push`).
4. **`.env.example` NUNCA se commitea** (tiene secretos reales). Excluilo de todo `git add`.
5. **Modo claro es el default** del tema. Tokens semánticos (`text-fg`, `bg-surface`,
   `border-line`, `text-brand`…); evitá opacidades fuera de las whitelisteadas.
6. **Tuteo** en copy de UI nuevo (no voseo), salvo que el archivo ya esté en voseo.

## Convenciones
- Vertical slices por módulo; validación con Zod en las fronteras; RBAC por capability
  (`lib/auth/roles.ts`, `guardCapability`). Detalle en @ARCHITECTURE.md.
- Server Components por default; `"use client"` solo donde haga falta.
- Commits: mensaje vía `-F archivo`, **sin BOM** y **sin "/" suelto** (un hook los rechaza).

## Flujo de trabajo
- `tsc --noEmit` + `eslint` sobre lo **tocado** antes de cerrar. El build tiene
  `ignoreBuildErrors` / `ignoreDuringBuilds` ON → tsc/lint NO son red de seguridad; el gate
  real es `npm run check:invariants` + el ojo.
- Antes de commitear: correr **`/ship-nexus`** (invariantes + tsc/lint en lo tocado + checklist).
- **No push hasta que el usuario lo pida.**
- Tras `npm run db:sync` (cambio de schema): **reiniciar el dev server** (el Prisma client viejo
  no entra por HMR). Tras `git pull` que toca CSS/config: `rm -rf .next` + reiniciar.
- El navegador del preview NO está logueado (middleware → login) → el E2E de UI autenticada lo
  hace el usuario por HMR; el bar de Claude = tsc+lint limpio + dev compila.
