-- 2026-07-27 · Logo del cliente: escala configurable + variante para fondo oscuro
--
-- ADITIVO: 2 columnas nullable en "Client". No borra nada, no inserta nada, no
-- toca ninguna fila existente.
--
-- POR QUÉ `logoScale` ES NULLABLE Y NO `DEFAULT 100`:
--   NULL = "nadie lo tocó", que NO es lo mismo que "alguien eligió 100". Si mañana
--   se re-afina la altura base de alguna superficie (hoy 30px sobre el navy del
--   hero, 40px en el cronograma del cliente, 36px en el interno), los NULL siguen
--   el default nuevo y los 100 explícitos quedan pinchados en el valor viejo sin
--   que nadie entienda por qué. Mismo criterio que `tamUsd` y `BusinessCase.language`.
--
-- POR QUÉ PORCENTAJE Y NO PÍXELES:
--   Las tres superficies tienen alturas base distintas y ya afinadas por separado.
--   Un número en px obligaría a unificarlas, y eso cambiaría el aspecto de TODO lo
--   ya publicado. El porcentaje es un multiplicador: cada superficie conserva su
--   altura y el número significa lo mismo en todas.
--
-- `logoDarkUrl` es la ALTERNATIVA del logo primario, no un asset independiente:
--   el DELETE del primario borra los dos (ver app/api/clients/[id]/logo/route.ts).
--   Un logo diseñado para fondo oscuro es tinta clara: sobre el blanco del
--   cronograma desaparecería, así que "solo oscuro" no es un estado válido.
--
-- ⚠ SE APLICA A MANO, NUNCA con `db push` / `db:sync`: la DB es compartida entre
-- dos PCs y un push dropea las columnas que la otra todavía no pusheó.
--
-- Cómo aplicarlo (revisá antes de correr):
--   npx prisma db execute --file scripts/sql/2026-07-27-client-logo-escala-y-variante.sql
-- Después, EN ESTE ORDEN:
--   npx prisma generate      (NO `db:sync`)
--   reiniciar el dev server  (el client viejo no conoce las columnas)

BEGIN;

-- Porcentaje del tamaño base del logo. 50-200, paso 5. NULL = sin configurar (=100).
-- El rango lo valida la aplicación (lib/ui/logo-scale.ts) y el endpoint; acá va un
-- CHECK como red de seguridad contra una escritura directa por SQL: un 5000 haría
-- que el logo tape el documento entero en una propuesta que el cliente está mirando.
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "logoScale" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Client_logoScale_rango'
  ) THEN
    ALTER TABLE "Client"
      ADD CONSTRAINT "Client_logoScale_rango"
      CHECK ("logoScale" IS NULL OR ("logoScale" >= 50 AND "logoScale" <= 200));
  END IF;
END $$;

-- Segundo archivo de logo, para superficies de fondo OSCURO (el hero de todos los
-- documentos del motor). Bucket `public-assets`, path `client-logos/{clientId}-dark`.
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "logoDarkUrl" TEXT;

COMMIT;

-- Verificación (debe devolver las 2 filas nuevas + el constraint):
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_name = 'Client' AND column_name IN ('logoScale', 'logoDarkUrl');
--   SELECT conname FROM pg_constraint WHERE conname = 'Client_logoScale_rango';
