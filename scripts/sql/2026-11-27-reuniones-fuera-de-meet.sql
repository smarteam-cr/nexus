-- 2026-11-27 · Las reuniones del calendario que no son de Meet (Zoom, Teams, otro enlace o en persona) entran a Nexus.
-- (DECISIONS «Todas las reuniones del calendario con alguien de afuera, no solo las de Meet».)
--
-- Por qué: la sync del calendario guardaba solo los eventos con Google Meet. La reunión por Zoom con Líneas
-- Hospitalarias del 27 nov no existía en Nexus y no salía en el buscador de la preventa. Desde este cambio se guarda todo
-- evento con al menos un invitado de afuera, con `source = 'google_calendar'` y su plataforma. Medido el 27 nov (solo
-- lectura, scripts/medir-reuniones-fuera-de-meet.ts): 52 reuniones nuevas en 30 días, 40 con un cliente.
--
-- QUÉ ENTRA (ADITIVO; se puede correr dos veces):
--   1. El tipo "PlataformaDeReunion" (MEET, ZOOM, TEAMS, OTRA, PRESENCIAL).
--   2. La columna nullable "FirefliesSession"."plataforma". Las reuniones de Meet la dejan en null (las de siempre):
--      ninguna fila existente cambia.
--
-- ⛔ ORDEN: este SQL va ANTES del deploy. Sin él, toda lectura de FirefliesSession sin `select` falla (P2022) y
-- `/api/health` responde 503 (deploy.sh revierte solo). El código viejo no conoce la columna y sigue andando.
--
-- Volver atrás (las filas de source 'google_calendar' quedan; el código viejo no las lee distinto de una de Meet sin texto):
--   ALTER TABLE "FirefliesSession" DROP COLUMN IF EXISTS "plataforma"; DROP TYPE IF EXISTS "PlataformaDeReunion";
--
-- Correr: npm run db:sql -- scripts/sql/2026-11-27-reuniones-fuera-de-meet.sql   (simulacro; con --apply y ALLOW_PROD_WRITE=1 aplica y anota)
-- Después: npx prisma generate + reiniciar el dev server · npm run check:esquema.
-- ⛔ NUNCA `prisma db push`.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PlataformaDeReunion') THEN
    CREATE TYPE "PlataformaDeReunion" AS ENUM ('MEET', 'ZOOM', 'TEAMS', 'OTRA', 'PRESENCIAL');
  END IF;
END $$;

ALTER TABLE "FirefliesSession" ADD COLUMN IF NOT EXISTS "plataforma" "PlataformaDeReunion";
