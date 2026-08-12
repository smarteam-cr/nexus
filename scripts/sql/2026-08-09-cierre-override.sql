-- Tanda K — el CSE puede fijar a mano la fecha de cierre del cronograma, igual que el arranque.
-- Aditiva, nullable, sin backfill: null = seguir usando el cierre proyectado (derivado).
-- Aplicar por SQL directo (NUNCA `prisma db push`), después `npx prisma generate` + reiniciar
-- el servidor de dev (si no, PrismaClientValidationError al navegar — ver nota operativa del repo).

-- `IF NOT EXISTS` como el resto de los .sql del repo: este archivo no lo tenía y re-aplicarlo
-- fallaba. Importa porque no hay tabla de control de qué .sql ya corrió (ver ARCHITECTURE Parte 0),
-- así que la única forma de ponerse al día es re-correrlos todos y que los ya aplicados no rompan.
ALTER TABLE "ProjectTimeline" ADD COLUMN IF NOT EXISTS "closeDateOverride" TIMESTAMP(3);
