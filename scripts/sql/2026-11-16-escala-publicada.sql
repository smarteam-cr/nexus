-- 2026-11-16 · La escala que ve el cliente se PUBLICA: la foto de lo que ve, guardada junto a su enlace.
--
-- Tres columnas nullable en "AccesoALaEscala", SOLO ADITIVAS, inocuas para el código viejo (que no las lee):
--   "publicada"    la página tal como la ve el cliente (EscalaParaElCliente, con su formato), en JSONB;
--   "publicadaEn"  cuándo se publicó;
--   "publicadaPor" el correo de quien la publicó (auditoría).
-- La tabla ya tiene RLS sin policies (2026-10-30-acceso-a-la-escala.sql): no cambia.
--
-- Se puede correr dos veces. Va ANTES del deploy del código que la usa.
--
-- Volver atrás (borra las fotos; con revisión):
--   ALTER TABLE "AccesoALaEscala" DROP COLUMN IF EXISTS "publicada", DROP COLUMN IF EXISTS "publicadaEn", DROP COLUMN IF EXISTS "publicadaPor";
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-11-16-escala-publicada.sql; Remove-Item Env:ALLOW_PROD_WRITE

ALTER TABLE "AccesoALaEscala" ADD COLUMN IF NOT EXISTS "publicada" JSONB;
ALTER TABLE "AccesoALaEscala" ADD COLUMN IF NOT EXISTS "publicadaEn" TIMESTAMP(3);
ALTER TABLE "AccesoALaEscala" ADD COLUMN IF NOT EXISTS "publicadaPor" TEXT;
