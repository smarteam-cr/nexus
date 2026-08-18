-- ─────────────────────────────────────────────────────────────────────────────
-- Tanda T · Retirar las tablas del chat viejo ("HubSpot AI Implementer")
--
-- ⛔ ESTE ES EL ÚNICO PASO IRREVERSIBLE DE LA TANDA. Leer entero antes de correr.
--
-- ── QUÉ BORRA ────────────────────────────────────────────────────────────────
--   Implementation · Message · ExecutionLog, y los enums ImplementationStatus y
--   ExecutionStatus. Eran el chat viejo que Nexus arrastraba de otra app y cuyos dos
--   endpoints (/api/ai/plan y /api/ai/execute) podían crear y BORRAR propiedades en
--   el portal de HubSpot de un cliente cualquiera con solo estar logueado.
--
-- ⚠ NO CONFUNDIR con `ImplementationType` / `Project.implementationType`, que es otra
--   cosa por completo: el tipo de proyecto de HubSpot. Ése NO se toca acá.
--
-- ── ORDEN OBLIGATORIO ────────────────────────────────────────────────────────
--   1. Deployar el código de la Tanda T (deja de consultar estas tablas).
--   2. Respaldar (el bloque de abajo).
--   3. Recién entonces correr este archivo.
--
--   Si se corre ANTES del deploy, la pantalla de Etapa 2 de cada proyecto revienta:
--   hasta esta tanda hacía `prisma.implementation.count()` en cada carga.
--
-- ── RESPALDO, ANTES DE CORRER ────────────────────────────────────────────────
--   pg_dump "$DATABASE_URL" --data-only --column-inserts \
--     -t '"Implementation"' -t '"Message"' -t '"ExecutionLog"' \
--     > backups/2026-08-17-chat-viejo.sql
--
-- ── CÓMO SE CORRE ────────────────────────────────────────────────────────────
--   npx prisma db execute --file scripts/sql/2026-08-17-retirar-chat-viejo.sql \
--     --schema prisma/schema.prisma
--   npx prisma generate   (y reiniciar el dev server — si no, las escrituras
--                          fallan en silencio)
--
-- ⛔ NUNCA `prisma db push`: droppearía columnas de otras tablas (regla dual-PC).
-- ─────────────────────────────────────────────────────────────────────────────

-- El orden importa: los hijos primero. CASCADE no hace falta y es preferible que
-- falle ruidoso si aparece una FK que este archivo no previó.
DROP TABLE IF EXISTS "ExecutionLog";
DROP TABLE IF EXISTS "Message";
DROP TABLE IF EXISTS "Implementation";

-- Los enums quedan huérfanos al irse sus únicas columnas.
DROP TYPE IF EXISTS "ExecutionStatus";
DROP TYPE IF EXISTS "ImplementationStatus";
