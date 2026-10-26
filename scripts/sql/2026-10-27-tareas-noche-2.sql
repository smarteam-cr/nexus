-- 2026-10-27 · Tareas, noche 2: el seguimiento comercial que nace en Nexus también vive en HubSpot (roadmap D4)
--
-- Hasta hoy el CHECK "Tarea_hubspot_con_id" decía: una tarea tiene `hubspotTaskId` si y solo si vino de HubSpot
-- (`origen = 'hubspot'`). D4 abre una excepción, escrita en DECISIONS («Tareas, noche 2: la limpieza de «Por decidir» y
-- el seguimiento comercial en HubSpot»): una tarea de Nexus que es SEGUIMIENTO COMERCIAL (no «Solo para mí», con un
-- contacto o un negocio de HubSpot) se crea también allá y guarda su id. El CHECK nuevo lo dice entero:
--   · lo que vino de HubSpot sigue teniendo su id;
--   · lo que nació en Nexus puede tenerlo SOLO si no es privado y tiene un contacto o un negocio.
-- Así ninguna tarea interna o privada de Nexus puede quedar atada a HubSpot, ni por un error del código.
--
-- ⚠ No es un ALTER aditivo puro: se reemplaza un CHECK por otro MÁS PERMISIVO para las filas que el código de hoy
-- escribe (el código viejo nunca pone `hubspotTaskId` en una tarea de Nexus, y lo que vino de HubSpot sigue igual), así
-- que es inocuo en la ventana en que producción corre el código viejo. Ninguna fila de hoy lo viola (verificado el
-- 2026-10-26: 49 tareas con `hubspotTaskId`, todas de HubSpot). El nombre no cambia: el SQL del 2026-10-15 lo ve y no
-- lo vuelve a crear. Sin tablas nuevas: no hay RLS que sumar. Re-ejecutable: si el CHECK ya es el nuevo, no hace nada.
--
-- ⛔ ORDEN: ANTES de prender `TAREAS_SEGUIMIENTO_EN_HUBSPOT=1`. Sin esto, la creación en HubSpot no corre (el código mira
-- el CHECK antes de crear: lib/tareas-hubspot/sync-server.ts › `creacionDisponible`). El deploy en sí no lo necesita.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-27-tareas-noche-2.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Tarea_hubspot_con_id' AND pg_get_constraintdef(oid) ILIKE '%privada%'
  ) THEN
    ALTER TABLE "Tarea" DROP CONSTRAINT IF EXISTS "Tarea_hubspot_con_id";
    ALTER TABLE "Tarea" ADD CONSTRAINT "Tarea_hubspot_con_id" CHECK (
      ("origen" = 'hubspot' AND "hubspotTaskId" IS NOT NULL)
      OR (
        "origen" <> 'hubspot'
        AND (
          "hubspotTaskId" IS NULL
          OR ("privada" = false AND ("hubspotContactId" IS NOT NULL OR "hubspotDealId" IS NOT NULL))
        )
      )
    );
  END IF;
END $$;

COMMIT;
