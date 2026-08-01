# Migraciones ARCHIVADAS — no ejecutar

Las 5 migraciones de marzo 2026 que vivían en `prisma/migrations/`. Se archivaron el
2026-08-01 en el re-baseline F0: representaban ~3.7 KB de un schema que ya iba por 86
modelos (la base evolucionó por SQL a mano desde abril; estas 5 se habían aplicado en
bloque el 2026-04-14 como baseline original).

El baseline vigente es `prisma/migrations/0_init/` (migration.sql generada con
`migrate diff --from-empty --to-schema` + after.sql con lo que Prisma no representa).
Estas carpetas quedan solo como historia — si volvieran a `prisma/migrations/`,
`migrate deploy` en una base nueva fallaría al duplicar lo que 0_init ya crea.
