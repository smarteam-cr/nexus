-- 2026-10-25 · Paso dos del roadmap, área L (L5 etapa 2): el EQUIPO DEL CLIENTE de una reunión del proyecto que no es
-- una sesión de su exploración (la entrega de servicio de Customer Success).
--
-- Por qué:
--   · "SessionProject"."equipoDeLaReunion" — con qué equipo del cliente fue la reunión, en este proyecto: una de las seis
--     claves de lib/exploraciones/equipos.ts (direccion, ventas, marketing, servicio, operaciones, tecnologia), o NULL.
--     Las sesiones de una exploración ya lo tienen en su sesión (`SesionPlaneada.equipo`, en el Json de la exploración);
--     las demás reuniones del proyecto no tenían dónde. El documento de diagnóstico lee por equipo (L5 etapa 1): cada
--     reunión entra con su equipo, y lo que dijo un equipo es de su área de la escala.
--     Va en el vínculo reunión ↔ proyecto (como los afinados de cada documento) y no en la reunión: así no toca
--     "FirefliesSession" ni el chokepoint, y el equipo es el que eligió quien lleva ESE proyecto.
-- La escribe SOLO lib/sessions/equipo-de-la-reunion-server.ts (el Contexto del diagnóstico, «Equipo del cliente» en cada
-- reunión que entra sola). Se valida en código (Zod): sin CHECK, para que `prisma migrate diff` no lo vea como ruido.
--
-- ADITIVO: 1 columna nullable. Nada se dropea, nada se renombra. Inocuo con el código viejo corriendo: no la lee ni la
-- escribe. Se puede correr dos veces. "SessionProject" ya tiene RLS (el lock-down total); se vuelve a afirmar abajo, que
-- también es idempotente.
--
-- ⚠ ORDEN: este SQL va ANTES del deploy. Sin él, `/api/health` responde 503 (el cliente Prisma ya conoce la columna) y
-- el deploy se revierte solo. El código que la lee no se cae sin ella (lee por SQL y la falta cuenta como «sin equipo»).
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-25-smartloop.sql; Remove-Item Env:ALLOW_PROD_WRITE
-- Después: npx prisma generate  +  reiniciar el dev server.
-- ⛔ NUNCA `prisma db push`.

ALTER TABLE "SessionProject" ADD COLUMN IF NOT EXISTS "equipoDeLaReunion" TEXT;

ALTER TABLE "SessionProject" ENABLE ROW LEVEL SECURITY;
