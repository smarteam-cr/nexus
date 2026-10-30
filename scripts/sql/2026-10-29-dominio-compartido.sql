-- 2026-10-29 · dos fichas que comparten dominio: el TEC se separa en «TEC · AE» y «TEC · TAE».
--
-- Por qué:
--   · "Client"."comparteDominioConId" — la ficha DUEÑA del dominio que esta ficha comparte. AE y TAE son dos
--     entidades del Instituto Tecnológico con el mismo dominio (itcr.ac.cr, tec.ac.cr) y la misma empresa de HubSpot.
--     Con la columna, el resolver (lib/sessions/categorize.ts) reparte las reuniones entre la dueña y sus entidades
--     por el nombre de la reunión y después por la gente; sin pista quedan por decidir. Elías (29 oct): «Que el TEC se
--     separe en dos clientes, uno para el AE y otro para el TAE». Ver DECISIONS «Dos fichas que comparten dominio».
-- La lee el resolver (lib/sessions/resolve-client.ts, lib/sessions/cargar-sesiones-categorizadas.ts); la escribe
-- scripts/separar-tec.ts.
--
-- ADITIVO: 1 columna nullable, su llave hacia "Client" (ON DELETE SET NULL) y su índice. Nada se dropea, nada se
-- renombra. Inocuo con el código viejo corriendo: nadie la lee y nace vacía.
-- Se puede correr dos veces.
--
-- ⚠ ORDEN: este SQL va ANTES del deploy (el código nuevo lee la columna en cada resolución de reuniones; sin ella,
-- la sincronización de Meet falla y `/api/health` da 503). Los scripts separar-tec y reubicar-reuniones-compartidas van
-- DESPUÉS del deploy.
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-29-dominio-compartido.sql; Remove-Item Env:ALLOW_PROD_WRITE
-- Después: npx prisma generate  +  reiniciar el dev server.
-- ⛔ NUNCA `prisma db push`.

ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "comparteDominioConId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Client_comparteDominioConId_fkey') THEN
    ALTER TABLE "Client"
      ADD CONSTRAINT "Client_comparteDominioConId_fkey"
      FOREIGN KEY ("comparteDominioConId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Client_comparteDominioConId_idx" ON "Client"("comparteDominioConId");
