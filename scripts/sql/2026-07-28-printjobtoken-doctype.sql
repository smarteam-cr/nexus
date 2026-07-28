-- 2026-07-28 · PrintJobToken sirve a CUALQUIER documento, no solo al business case
--
-- ADITIVO: 2 columnas nullable + backfill + 1 relajación de NOT NULL.
-- No borra ninguna columna, no borra ninguna fila.
--
-- POR QUÉ: el PDF del business case se autentica con un token de un solo uso (60s) para
-- que Puppeteer no tenga que reenviar cookies de sesión. Ese mecanismo no tiene nada de
-- específico de un caso de negocio, pero la tabla sí: `businessCaseId` es NOT NULL. Al
-- estandarizar la generación de PDFs (kickoff, desarrollo, diagnóstico, planificación,
-- implementación, exploración, perfiles) el token pasa a identificar el documento por
-- (docType, docId).
--
-- LA TABLA ES EFÍMERA: TTL de 60 segundos. En régimen normal tiene 0-2 filas, así que el
-- backfill es instantáneo y el riesgo de la migración es prácticamente nulo.
--
-- COMPATIBILIDAD DURANTE LA TRANSICIÓN (tres capas, en este orden):
--   1. dual-write: el código nuevo SIGUE escribiendo `businessCaseId` para el business
--      case, así que un rollback dentro de los 60s de vida de un token no rompe nada.
--   2. lectura tolerante: se valida contra `docType ?? 'business-case'` y `docId ??
--      businessCaseId`, así que un token minteado por el código VIEJO se consume con el
--      código nuevo.
--   3. `businessCaseId` queda marcada DEPRECATED en schema.prisma y se dropea después.
--
-- ⚠ RIESGO DUAL-PC, con nombre y apellido: un `db push` desde la otra PC con el
-- `schema.prisma` viejo intentaría re-agregar el NOT NULL y DROPEARÍA `docType`/`docId`.
-- Por eso este .sql y el cambio de schema.prisma van en el MISMO commit: el `git pull` de
-- la otra PC los trae juntos. Nunca `db push` / `db:sync`.
--
-- Cómo aplicarlo:
--   npx prisma db execute --file scripts/sql/2026-07-28-printjobtoken-doctype.sql
-- Después:
--   npx prisma generate   (NO `db:sync`) + reiniciar el dev server

BEGIN;

-- Qué TIPO de documento imprime este token ("business-case", "kickoff", …). El vocabulario
-- lo define lib/print/doc-types.ts; acá va como TEXT libre a propósito: un enum de Postgres
-- obligaría a una migración cada vez que se suma un tipo, y el valor lo valida la app
-- contra el registro antes de tocar la base.
ALTER TABLE "PrintJobToken" ADD COLUMN IF NOT EXISTS "docType" TEXT;

-- El id de ESE documento (businessCaseId, projectId, roleId… según el tipo).
ALTER TABLE "PrintJobToken" ADD COLUMN IF NOT EXISTS "docId" TEXT;

-- Backfill de lo que haya vivo (0-2 filas por el TTL).
UPDATE "PrintJobToken"
   SET "docType" = 'business-case', "docId" = "businessCaseId"
 WHERE "docType" IS NULL;

-- Relajación: los tokens de los otros tipos no tienen businessCaseId. No es un DROP ni un
-- rename ni un reorder, así que no entra en las operaciones prohibidas del RUNBOOK.
ALTER TABLE "PrintJobToken" ALTER COLUMN "businessCaseId" DROP NOT NULL;

-- El lookup es por `token`, que ya es UNIQUE: no hace falta índice nuevo.

COMMIT;

-- Verificación:
--   SELECT column_name, is_nullable FROM information_schema.columns
--    WHERE table_name = 'PrintJobToken'
--      AND column_name IN ('docType', 'docId', 'businessCaseId')
--    ORDER BY column_name;
--   -- docType/docId presentes y nullable; businessCaseId con is_nullable = YES.
