-- 2026-08-20 · La propuesta deja de pedir contraseña por defecto
--
-- Tres cosas, todas ADITIVAS (inocuas mientras el código viejo siga corriendo):
--   1. `requiresPassword` — el modo de acceso por propuesta. Default FALSE = abierta.
--   2. `expiresAt`        — caducidad del link (null = no caduca).
--   3. Aprobación del cliente en BusinessCase.
--
-- ⚠ DECISIÓN DE NEGOCIO (Ventas, 2026-08-20): las propuestas YA COMPARTIDAS quedan
-- ABIERTAS. El default FALSE ya las cubre — no hace falta el truco de "agregar con un
-- default y después cambiarlo", porque acá SÍ queremos que las filas viejas hereden el
-- default. Desde que esto se aplique, cualquiera con un link viejo en un correo entra
-- sin contraseña. El link viejo (/verify/{token}) sigue vivo como puente.

ALTER TABLE "BusinessCaseExternalAccess"
  ADD COLUMN IF NOT EXISTS "requiresPassword" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);

-- Ventana de 30 días DESDE EL DEPLOY, no desde la publicación original: calcularla
-- desde `enabledAt` mataría el mismo día toda propuesta de más de un mes, que es
-- justo la cartera viva. Las nuevas la reciben al publicar (lib/business-cases/mutations.ts).
UPDATE "BusinessCaseExternalAccess"
   SET "expiresAt" = now() + interval '30 days'
 WHERE "expiresAt" IS NULL
   AND "revokedAt" IS NULL;

ALTER TABLE "BusinessCase"
  ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approvedByEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "approvedByName" TEXT,
  ADD COLUMN IF NOT EXISTS "approvedSnapshotAt" TIMESTAMP(3);
