-- 2026-10-18 · «Actualizar escala»: la historia de la escala amarrada a la venta (VersionDeLaEscala).
--
-- Cada versión ya decía de qué exploración, proyecto y ciclo sale. Ahora dice también de qué VENTA (el negocio ganado
-- de HubSpot, `VentaGanada`) y de qué PROPUESTA (`BusinessCase`), y de qué MOMENTO es la posición: «al vender»,
-- «al arrancar» u «hoy», con el día de esa posición (`diaDeLaPosicion`, que puede ser del pasado). `dia` sigue siendo el
-- día en que se guardó. La escribe solo lib/exploraciones/versiones-de-la-escala.ts.
--
-- ADITIVO: 5 columnas nullable en una tabla que ya tiene RLS (y su política RESTRICTIVE). Las filas que ya existen
-- quedan con todo en NULL: «sin venta» y momento sin decir, que la pantalla lee como antes.
--
-- ⛔ ORDEN: esto va ANTES del deploy. /api/health responde 503 sin estas columnas y deploy.sh revierte.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-18-escala-ligada-a-la-venta.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`. Se puede correr dos veces.

ALTER TABLE "VersionDeLaEscala" ADD COLUMN IF NOT EXISTS "ventaGanadaId" TEXT;
ALTER TABLE "VersionDeLaEscala" ADD COLUMN IF NOT EXISTS "businessCaseId" TEXT;
ALTER TABLE "VersionDeLaEscala" ADD COLUMN IF NOT EXISTS "hubspotDealId" TEXT;
ALTER TABLE "VersionDeLaEscala" ADD COLUMN IF NOT EXISTS "momento" TEXT;
ALTER TABLE "VersionDeLaEscala" ADD COLUMN IF NOT EXISTS "diaDeLaPosicion" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VersionDeLaEscala_ventaGanadaId_fkey') THEN
    ALTER TABLE "VersionDeLaEscala" ADD CONSTRAINT "VersionDeLaEscala_ventaGanadaId_fkey"
      FOREIGN KEY ("ventaGanadaId") REFERENCES "VentaGanada"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VersionDeLaEscala_businessCaseId_fkey') THEN
    ALTER TABLE "VersionDeLaEscala" ADD CONSTRAINT "VersionDeLaEscala_businessCaseId_fkey"
      FOREIGN KEY ("businessCaseId") REFERENCES "BusinessCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VersionDeLaEscala_momento_check') THEN
    ALTER TABLE "VersionDeLaEscala" ADD CONSTRAINT "VersionDeLaEscala_momento_check"
      CHECK ("momento" IS NULL OR "momento" IN ('al-vender', 'al-arrancar', 'hoy'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VersionDeLaEscala_diaDeLaPosicion_check') THEN
    ALTER TABLE "VersionDeLaEscala" ADD CONSTRAINT "VersionDeLaEscala_diaDeLaPosicion_check"
      CHECK ("diaDeLaPosicion" IS NULL OR "diaDeLaPosicion" ~ '^\d{4}-\d{2}-\d{2}$');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "VersionDeLaEscala_ventaGanadaId_idx" ON "VersionDeLaEscala"("ventaGanadaId");

-- La tabla ya tiene RLS desde 2026-10-17-ficha-b-versiones-de-la-escala.sql; se repite por si acaso (es idempotente).
ALTER TABLE "VersionDeLaEscala" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'VersionDeLaEscala' AND policyname = 'deny_all_non_superuser') THEN
    CREATE POLICY "deny_all_non_superuser" ON "VersionDeLaEscala" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
  END IF;
END $$;
