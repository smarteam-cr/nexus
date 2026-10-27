-- 2026-10-26 · O6 etapa 3 del roadmap (el corte de la aplicación vieja): cuántas veces se abre la página de cada test.
--
-- Por qué:
--   · "VisitaDelTest" — una fila por (día, área, versión) con cuántas veces se abrió la página del test. Es la base de la
--     medición de antes y después del corte: «terminan entre los que la abren» (el criterio de éxito del área O), además
--     de lo que ya mide "IntentoDelTest" (cuántos llenan el formulario, terminan o lo dejan, y en qué pregunta).
--     `dia` es el día en Costa Rica. Solo cuentas: ni personas, ni direcciones, ni hashes.
-- La escribe y la lee SOLO lib/tests-diagnostico/repositorio-server.ts (por SQL). Sin este SQL el test funciona igual:
-- la visita no se cuenta y la medición dice que falta.
--
-- ADITIVO: 1 tabla nueva con su RLS. Nada se dropea, nada se renombra. Inocuo con el código viejo corriendo.
-- Se puede correr dos veces.
--
-- ⚠ ORDEN: este SQL va ANTES del deploy (el schema declara el modelo; sin la tabla `/api/health` da 503). Va después de
-- 2026-10-26-tests-diagnostico.sql (no depende de él, pero mide lo mismo).
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-26-visitas-del-test.sql; Remove-Item Env:ALLOW_PROD_WRITE
-- Después: npx prisma generate  +  reiniciar el dev server.
-- ⛔ NUNCA `prisma db push`.

CREATE TABLE IF NOT EXISTS "VisitaDelTest" (
  "dia"       DATE NOT NULL,
  "area"      TEXT NOT NULL,
  "version"   TEXT NOT NULL,
  "visitas"   INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VisitaDelTest_pkey" PRIMARY KEY ("dia", "area", "version")
);

-- RLS: lock-down total, como todas las tablas de public (ARCHITECTURE §4.5). Nadie la lee con la llave pública.
ALTER TABLE "VisitaDelTest" ENABLE ROW LEVEL SECURITY;
