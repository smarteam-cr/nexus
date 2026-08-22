-- 2026-08-22 — El hilo del asistente puede colgar de un BusinessCase o de un RoleProfile,
-- no solo de un Project.
--
-- POR QUÉ
-- El chat que conversa y consensúa cambios existe desde agosto sobre los documentos de PROYECTO.
-- La propuesta comercial y los documentos de Roles (perfil de puesto y propuesta laboral) usan el
-- MISMO motor de páginas y la misma maquinaria de consenso, pero su canvas no cuelga de un
-- proyecto. Darles un hilo propio habría sido una segunda tabla para exactamente lo mismo.
--
-- Es el patrón que `ProjectCanvas` ya usa desde siempre: dueño flexible, EXACTAMENTE UNO seteado,
-- validado en código. Las tres relaciones conservan su ON DELETE CASCADE, así que borrar el dueño
-- se sigue llevando la conversación.
--
-- ⚠ APLICAR ANTES DEL DEPLOY. El código nuevo lee `businessCaseId`/`roleId`; sin las columnas,
-- cualquier consulta del asistente revienta en runtime (INV7 lo caza).
-- ⛔ Por SQL directo, NUNCA `prisma db push` — droppearía columnas (setup de dos PCs).
--    ALLOW_PROD_WRITE=1 npx prisma db execute --file scripts/sql/2026-08-22-hilo-de-chat-dueno-flexible.sql
-- Después: `npx prisma generate` y REINICIAR el dev server (si no, las escrituras fallan mudas).
--
-- ⚠ Aflojar el NOT NULL no pierde ni un dato: los hilos que ya existen son todos de proyecto y
-- conservan su `projectId`. Es aditivo en el sentido que importa.

ALTER TABLE "HiloDeChat" ALTER COLUMN "projectId" DROP NOT NULL;

ALTER TABLE "HiloDeChat" ADD COLUMN IF NOT EXISTS "businessCaseId" TEXT;
ALTER TABLE "HiloDeChat" ADD COLUMN IF NOT EXISTS "roleId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'HiloDeChat_businessCaseId_fkey'
  ) THEN
    ALTER TABLE "HiloDeChat"
      ADD CONSTRAINT "HiloDeChat_businessCaseId_fkey"
      FOREIGN KEY ("businessCaseId") REFERENCES "BusinessCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'HiloDeChat_roleId_fkey'
  ) THEN
    ALTER TABLE "HiloDeChat"
      ADD CONSTRAINT "HiloDeChat_roleId_fkey"
      FOREIGN KEY ("roleId") REFERENCES "RoleProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- El camino caliente de cada dueño: «el hilo abierto de ESTE documento para ESTA persona».
CREATE INDEX IF NOT EXISTS "HiloDeChat_businessCaseId_pieza_usuarioEmail_idx"
  ON "HiloDeChat"("businessCaseId", "pieza", "usuarioEmail");
CREATE INDEX IF NOT EXISTS "HiloDeChat_roleId_pieza_usuarioEmail_idx"
  ON "HiloDeChat"("roleId", "pieza", "usuarioEmail");
