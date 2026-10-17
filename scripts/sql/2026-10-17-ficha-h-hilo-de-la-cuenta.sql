-- 2026-10-17 · Ficha H: el chat de Nexus cuelga de la CUENTA (HiloDeChat.clientId).
--
-- El chat de Nexus (lib/nexus-chat) conversa sobre UNA empresa: un hilo por cuenta y por persona, con la pieza «nexus».
-- El hilo ya podía colgar de un proyecto, una propuesta comercial, un documento de Roles o de la persona; este SQL suma
-- la cuenta (docs/nexus-sistema-de-trabajo-plan.md, fase 4: «HiloDeChat suma la cuenta»).
--
-- ADITIVO: 1 columna nullable con su FK (borrar la empresa se lleva sus conversaciones, como con los otros dueños) y su
-- índice. La tabla ya tiene RLS desde 2026-08-19; se vuelve a declarar por las dudas.
--
-- ⛔ ORDEN: esto va ANTES del deploy. /api/health responde 503 sin esta columna y deploy.sh revierte.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-17-ficha-h-hilo-de-la-cuenta.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`. Se puede correr dos veces.

ALTER TABLE "HiloDeChat" ADD COLUMN IF NOT EXISTS "clientId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HiloDeChat_clientId_fkey') THEN
    ALTER TABLE "HiloDeChat"
      ADD CONSTRAINT "HiloDeChat_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "HiloDeChat_clientId_pieza_usuarioEmail_idx" ON "HiloDeChat"("clientId", "pieza", "usuarioEmail");

ALTER TABLE "HiloDeChat" ENABLE ROW LEVEL SECURITY;
