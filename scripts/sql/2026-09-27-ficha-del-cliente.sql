-- 2026-09-27 · La ficha del cliente: una sola por empresa (lib/clients/ficha.ts).
--
-- Aditiva y nullable: los 188 clientes quedan con `ficha` en NULL y la pantalla muestra la ficha
-- vacía para llenar. Nada que backfillear — `Client.canvas` y las secciones del canvas client-info
-- que reemplaza estaban vacías en prod (medido el 2026-09-27).
--
-- ⛔ ORDEN OBLIGATORIO: esto se aplica ANTES del deploy. El código nuevo SELECCIONA la columna
-- (`app/api/clients/[id]/ficha/route.ts`); si el deploy llega primero, la pestaña «Información del
-- cliente» revienta contra Postgres.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-09-27-ficha-del-cliente.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe (la conexión sale de prisma.config.ts).
--
-- Después, en la máquina de desarrollo: `npx prisma generate` y REINICIAR el dev server.

ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "ficha" JSONB;
