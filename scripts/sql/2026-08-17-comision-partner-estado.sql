-- 2026-08-17 · La comisión de un aliado pasa a tener estado de cobro.
--
-- Por qué: `ComisionPartner` solo registraba plata que YA había entrado. Las comisiones
-- prometidas —HubSpot liquida trimestral, y las de agosto y noviembre son ~$54k cada
-- una— vivían fuera del sistema: no salían en la proyección, no salían en el reporte
-- anual y solo existían en la cabeza de quien las esperaba. Decisión de Elías al
-- diseñar el reporte de equilibrio: "que entren como plata esperada, con fecha".
--
-- ADITIVO: 1 enum nuevo + 4 columnas (todas nullable o con default) + un backfill de
-- las filas existentes. Nada se dropea ni se renombra, y el código viejo —que no
-- conoce estas columnas— sigue leyendo y escribiendo igual durante la ventana de
-- deploy: una comisión nueva creada por el código viejo nace POR_COBRAR, que es el
-- estado conservador.
--
-- ⚠ SIN deny-all RESTRICTIVE: `ComisionPartner` es un INGRESO y su superficie es la de
-- ADMIN, igual que `IngresoVariable`. Eso NO cambia acá (ver prisma/policies.sql, que
-- lo dice explícitamente). RLS ya está habilitado en la tabla.
--
-- Aplicación: igual que el hermano de esta misma fecha (2026-08-17-reporte-equilibrio.sql):
--   ALLOW_PROD_WRITE=1 npx prisma db execute --file scripts/sql/2026-08-17-comision-partner-estado.sql
--   npx prisma generate   ·   npm run check:invariants  (debe imprimir ✓ INV20)

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ComisionPartnerEstado') THEN
        CREATE TYPE "ComisionPartnerEstado" AS ENUM ('POR_COBRAR', 'COBRADO');
    END IF;
END $$;

ALTER TABLE "ComisionPartner"
    ADD COLUMN IF NOT EXISTS "estado" "ComisionPartnerEstado" NOT NULL DEFAULT 'POR_COBRAR',
    ADD COLUMN IF NOT EXISTS "fechaCobro"    DATE,
    ADD COLUMN IF NOT EXISTS "confirmadoPor" TEXT,
    ADD COLUMN IF NOT EXISTS "confirmadoEn"  TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "ComisionPartner_estado_fecha_idx"
    ON "ComisionPartner" ("estado", "fecha");

-- ── Backfill: lo que ya estaba cargado ES plata que entró ────────────────────────
-- Las filas existentes se registraron con el criterio viejo ("acá anoto lo que nos
-- pagaron"), así que declararlas COBRADO es leerlas como se escribieron. Es una
-- INFERENCIA y por eso queda escrita acá: `confirmadoPor` toma a quien la registró,
-- que es quien afirmó que esa plata entró, y `confirmadoEn` su fecha de carga
-- (`ComisionPartner` no tiene `registradoEn`, a diferencia de sus hermanas).
UPDATE "ComisionPartner"
   SET "estado"        = 'COBRADO',
       "fechaCobro"    = "fecha",
       "confirmadoPor" = "registradoPor",
       "confirmadoEn"  = "createdAt"
 WHERE "confirmadoPor" IS NULL;
