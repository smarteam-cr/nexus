-- 2026-11-27 · «La página del cronograma que ve el cliente»: lo que el equipo decide de esa página desde adentro.
--
-- Una columna nueva en "ProjectTimeline", nullable (inocua para el código viejo, que no la lee ni la escribe):
--   "paginaDelCliente" — Json con el encabezado y lo que se muestra: { titulo?, conNombre?, conLogo?, bienvenida?,
--                        conAtrasadas?, conResponsables?, conResumen? }. null = todo como siempre.
-- Sirve igual al cronograma de un proyecto y al de un plan general (los dos son un ProjectTimeline). El cliente no la lee
-- en vivo: se congela en la foto al «Subir al cliente» / «Publicar» (lib/external/pagina-del-cliente.ts).
--
-- Se puede correr dos veces. Va ANTES del deploy del código que la usa.
--
-- Volver atrás (pierde lo que el equipo eligió; las fotos ya publicadas lo conservan):
--   ALTER TABLE "ProjectTimeline" DROP COLUMN IF EXISTS "paginaDelCliente";
--
-- Correr: npm run db:sql -- scripts/sql/2026-11-27-pagina-del-cliente.sql   (simulacro)
--         ALLOW_PROD_WRITE=1 npx tsx scripts/aplicar-sql.ts scripts/sql/2026-11-27-pagina-del-cliente.sql --apply

ALTER TABLE "ProjectTimeline" ADD COLUMN IF NOT EXISTS "paginaDelCliente" JSONB;
