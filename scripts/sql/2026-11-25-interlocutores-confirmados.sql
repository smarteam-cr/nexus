-- 2026-11-25 · «Unidades e interlocutores»: una persona del equipo CONFIRMA con qué ficha trabaja cada persona del cliente.
--
-- Dos columnas nuevas en "PersonaDeLaEmpresa", las dos nullable (inocuas para el código viejo, que no las lee ni las
-- escribe):
--   "confirmadaAt"       — cuándo una persona del equipo dijo que esta persona trabaja con esta ficha. null = por confirmar.
--   "confirmadaPorEmail" — quién lo dijo, del equipo.
-- El resolver de reuniones (lib/sessions/categorize.ts) usa SOLO a las confirmadas: lo confirmado nunca se aprende solo,
-- lo escribe una persona (lib/clients/personas-de-la-empresa-server.ts › `guardarInterlocutor`). La copia de cada hora
-- nunca toca estas columnas y nunca da de baja a una persona confirmada.
--
-- El rol cambia de vocabulario (decide · champion · participa · no-involucrado, antes decide · influye · usa; el 25 nov no
-- había ningún rol puesto en producción: 0 de 1.772). El CHECK "PersonaDeLaEmpresa_rol_valido" (2026-10-25-empresa-parte-2)
-- se rehace con DROP IF EXISTS + ADD y es MÁS permisivo que el de antes: acepta los cuatro nuevos y sigue aceptando los dos
-- viejos, para que el código de antes del deploy no choque con la base. La app ya no los escribe (lib/clients/roles-de-persona.ts).
--
-- Se puede correr dos veces. Va ANTES del deploy del código que la usa.
--
-- Volver atrás (borra las confirmaciones; el CHECK viejo solo si no quedó ningún rol nuevo puesto):
--   ALTER TABLE "PersonaDeLaEmpresa" DROP COLUMN IF EXISTS "confirmadaAt", DROP COLUMN IF EXISTS "confirmadaPorEmail";
--   ALTER TABLE "PersonaDeLaEmpresa" DROP CONSTRAINT IF EXISTS "PersonaDeLaEmpresa_rol_valido";
--   ALTER TABLE "PersonaDeLaEmpresa" ADD CONSTRAINT "PersonaDeLaEmpresa_rol_valido" CHECK ("rol" IS NULL OR "rol" IN ('decide', 'influye', 'usa'));
--
-- Correr: npm run db:sql -- scripts/sql/2026-11-25-interlocutores-confirmados.sql   (simulacro)
--         ALLOW_PROD_WRITE=1 npx tsx scripts/aplicar-sql.ts scripts/sql/2026-11-25-interlocutores-confirmados.sql --apply

ALTER TABLE "PersonaDeLaEmpresa" ADD COLUMN IF NOT EXISTS "confirmadaAt" TIMESTAMP(3);
ALTER TABLE "PersonaDeLaEmpresa" ADD COLUMN IF NOT EXISTS "confirmadaPorEmail" TEXT;

-- El rol: los cuatro de «Unidades e interlocutores» (y los dos viejos, que nadie escribe).
ALTER TABLE "PersonaDeLaEmpresa" DROP CONSTRAINT IF EXISTS "PersonaDeLaEmpresa_rol_valido";
ALTER TABLE "PersonaDeLaEmpresa" ADD CONSTRAINT "PersonaDeLaEmpresa_rol_valido"
  CHECK ("rol" IS NULL OR "rol" IN ('decide', 'champion', 'participa', 'no-involucrado', 'influye', 'usa'));
