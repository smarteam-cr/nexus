-- Tanda K — el CSE puede fijar a mano la fecha de cierre del cronograma, igual que el arranque.
-- Aditiva, nullable, sin backfill: null = seguir usando el cierre proyectado (derivado).
-- Aplicar por SQL directo (NUNCA `prisma db push`), después `npx prisma generate` + reiniciar
-- el servidor de dev (si no, PrismaClientValidationError al navegar — ver nota operativa del repo).

ALTER TABLE "ProjectTimeline" ADD COLUMN "closeDateOverride" TIMESTAMP(3);
