# scripts/archive — one-offs históricos (NO son catálogo)

Seeds que se corrieron UNA vez contra la base real y quedan como registro. **Ninguno
entra al bootstrap de la base local** (`npm run db:local -- seed`): la base local se
puebla con el catálogo (agentes/prompts/permisos) + el fixture ficticio
(`scripts/seed-fixture.ts`). Clasificación marcada por Elías el 2026-08-01.

| Script | Qué fue |
|---|---|
| `seed-test-user.ts` | Usuario espejo de la cartera real de Heiver (datos reales → no es fixture) |
| `seed-agents.ts` | Carga inicial de agentes (vivía en `prisma/`; el catálogo vivo es `prisma/seed.ts` + `scripts/seed-*-agent*.ts`) |
| `seed-projects.ts` | Backfill "Proyecto principal" para clientes sin proyecto (época de la migración inicial) |
| `seed-propuesta-csl.ts` | Migración de la propuesta CSL de código a la fila `propuesta-csl-v1` (corrió en prod el 2026-07-31) |
| `seed-roles.ts` | Carga/re-siembra de los 3 perfiles de puesto (MO/ML/CSL) — el contenido vivo se edita en /roles |
| `seed-process-knowledge.ts` | Carga de 5 procesos de implementación desde archivos de un Downloads local |

Reglas:
- Siguen compilando (`tsconfig` incluye `scripts/`) y siguen gateados por el guard
  anti-prod (`../lib/guard`): correr uno contra prod exige `ALLOW_PROD_WRITE=1`.
- No editarles el contenido para "modernizarlos": son historia. Si algo de acá vuelve
  a necesitarse recurrente, se escribe un script nuevo en `scripts/` con dry-run-first.
