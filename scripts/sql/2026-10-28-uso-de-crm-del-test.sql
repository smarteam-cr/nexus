-- 2026-10-28 · el test público del diagnóstico pregunta cómo gestionan hoy a sus clientes, en lugar del puesto.
--
-- Por qué:
--   · "IntentoDelTest"."usoDeCrm" — la respuesta a «¿Cómo gestionan actualmente a sus clientes?», con los valores
--     EXACTOS de la propiedad de contacto `como_gestionan_actualmente_a_sus_clientes` de HubSpot
--     (lib/tests-diagnostico/formulario.ts › USOS_DE_CRM). Elías (28 oct): dice más del prospecto que su cargo.
--     La columna "puesto" se queda: guarda lo que respondieron los intentos de antes.
-- La escribe y la lee SOLO lib/tests-diagnostico/repositorio-server.ts (por SQL).
--
-- ADITIVO: 1 columna nullable. Nada se dropea, nada se renombra. Inocuo con el código viejo corriendo.
-- Se puede correr dos veces.
--
-- ⚠ ORDEN: este SQL va ANTES del deploy (el código nuevo escribe la columna al empezar cada test; sin ella, empezar el
-- test falla y `/api/health` da 503). Va después de 2026-10-26-tests-diagnostico.sql (la tabla tiene que existir).
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-28-uso-de-crm-del-test.sql; Remove-Item Env:ALLOW_PROD_WRITE
-- Después: npx prisma generate  +  reiniciar el dev server.
-- ⛔ NUNCA `prisma db push`.

ALTER TABLE "IntentoDelTest" ADD COLUMN IF NOT EXISTS "usoDeCrm" TEXT;
