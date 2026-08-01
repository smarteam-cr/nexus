# Nexus

Workspace interno de Smarteam (consultora de HubSpot): gestiona clientes y proyectos, ingiere
sesiones de Google Meet, y genera handoff, kickoff, cronograma y documentos con agentes de
Claude.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Prisma 7 (`@prisma/adapter-pg`) sobre
Supabase Postgres · Tailwind v4 · Supabase Auth · Anthropic SDK · HubSpot / Google Workspace /
Apify. Versiones exactas y el mapa del repo: **ARCHITECTURE.md · Parte 0**.

## Setup local

```bash
git clone <repo-url> && cd nexus
npm install
cp .env.example .env    # plantilla SIN secretos — los valores reales los pasa el equipo
npx prisma generate     # no hay postinstall: el cliente Prisma no se genera solo
npm run dev             # → http://localhost:3004
```

Mínimo para arrancar y loguearse: `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`.

**Dos instancias en paralelo** — `npm run dev` (3004) va contra la base de PRODUCCIÓN;
`npm run dev:local` (3005) contra la base local con datos de prueba, sin tocar el `.env`.
Ver ARCHITECTURE.md · Parte 0 · cap. C.

## ⚠ Lo que hay que saber ANTES de tocar nada

- **`DATABASE_URL` apunta a PRODUCCIÓN.** No existe base local (todavía): local == PROD, y la
  comparten dos PCs de desarrollo. Todo script que escribe es dry-run por default y exige
  `--apply` + `ALLOW_PROD_WRITE=1` (un guard aborta si falta).
- **`prisma db push` y `prisma migrate dev` están PROHIBIDOS** contra esta base: dropean
  objetos que el schema no declara (ya pasó). Las migraciones son SQL aditivo a mano — el
  flujo completo está en ARCHITECTURE.md · Parte 0 · cap. D.
- Tras cualquier cambio de schema: `npx prisma generate` + reiniciar el dev server.

## Tests

```bash
npm test                  # la suite unit (vitest — todo lib/**, sin DB)
npm run db:local -- up    # Postgres 17 local embebido (localhost:5433; bootstrap si es nueva)
npm run db:local -- seed  # puebla nexus_local: catálogo + mundo ficticio fx- (solo local)
npm run test:int          # integración contra la base local nexus_test (trunca tablas)
npm run check:invariants  # los invariantes de datos, contra la DB real
```

## Documentación

| Pregunta | Documento |
|---|---|
| ¿Cómo está construido y qué reglas rigen? | `ARCHITECTURE.md` (Parte 0 = referencia rápida; §0–§13 = constitución) |
| ¿Por qué está así? (no re-litigar) | `docs/DECISIONS.md` |
| ¿Cómo se opera producción / deploy? | `docs/RUNBOOK.md` |
| ¿Qué significa este término? | `docs/GLOSSARY.md` |
| ¿Este error ya lo vimos? | `docs/KNOWN-ERRORS.md` |
| ¿Qué cambió y cuándo? | `docs/CHANGELOG.md` |
| Reglas para agentes (Claude Code) | `CLAUDE.md` |
