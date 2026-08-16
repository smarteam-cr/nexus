-- 2026-08-16 · El aliado comercial pasa a ser una entidad con su CADENCIA.
--
-- Por qué: hasta hoy `ComisionPartner.partner` era un string suelto por fila, así
-- que Nexus no tenía dónde guardar "HubSpot nos paga cada 3 meses". Elías lo pidió
-- explícitamente ("cada aliado con su frecuencia") para poder leer el historial a
-- la granularidad correcta —esos pagos NO son mensuales— y para que más adelante
-- se pueda decir cuándo cae el próximo.
--
-- ADITIVO: una tabla nueva + una columna nullable. Nada se dropea, nada se
-- renombra, y el código viejo sigue funcionando durante la ventana de deploy
-- porque `partner` (el string) NO se toca: sigue siendo el snapshot de lo que se
-- escribió, igual que `sujetoNombre` en PagoPlanilla.
--
-- ⚠ SIN deny-all RESTRICTIVE, a propósito y en línea con `ComisionPartner`: esto
-- es configuración de un INGRESO y su superficie es la de ADMIN. RLS habilitado
-- igual (ninguna tabla nueva queda sin él — ARCHITECTURE, recordatorios
-- operativos), así que el anon externo no lee nada.

CREATE TABLE IF NOT EXISTS "PartnerComercial" (
    "id"              TEXT         NOT NULL,
    -- El nombre que se muestra, con sus mayúsculas.
    "nombre"          TEXT         NOT NULL,
    -- La clave normalizada (normalizePartner): "HubSpot" y "hubspot " son el
    -- MISMO aliado. Es lo que se compara; `nombre` es lo que se lee.
    "clave"           TEXT         NOT NULL,
    -- Cada cuántos MESES paga. 1 mensual · 3 trimestral · 6 semestral · 12 anual.
    -- Int y no enum: agregar "cada 2 meses" no puede exigir un ALTER TYPE
    -- coordinado entre las 2 PCs que comparten esta base.
    "frecuenciaMeses" INTEGER      NOT NULL,
    "activo"          BOOLEAN      NOT NULL DEFAULT true,
    "notas"           TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PartnerComercial_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PartnerComercial_clave_key"
    ON "PartnerComercial" ("clave");

-- Techo de cordura: una cadencia de 0 meses es un bucle y una de 60 no es una
-- cadencia, es un evento. El Zod valida lo mismo; esto es la red de la base para
-- lo que entre por un script.
ALTER TABLE "PartnerComercial"
    DROP CONSTRAINT IF EXISTS "PartnerComercial_frecuencia_rango";
ALTER TABLE "PartnerComercial"
    ADD CONSTRAINT "PartnerComercial_frecuencia_rango"
    CHECK ("frecuenciaMeses" >= 1 AND "frecuenciaMeses" <= 24);

-- El vínculo. NULLABLE porque las 5 filas ya cargadas nacieron sin aliado y
-- porque un pago puede registrarse antes de dar de alta al aliado.
-- SetNull: borrar un aliado NO borra el registro de que esa plata entró.
ALTER TABLE "ComisionPartner"
    ADD COLUMN IF NOT EXISTS "partnerId" TEXT;

CREATE INDEX IF NOT EXISTS "ComisionPartner_partnerId_idx"
    ON "ComisionPartner" ("partnerId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ComisionPartner_partnerId_fkey'
    ) THEN
        ALTER TABLE "ComisionPartner"
            ADD CONSTRAINT "ComisionPartner_partnerId_fkey"
            FOREIGN KEY ("partnerId") REFERENCES "PartnerComercial" ("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

ALTER TABLE "PartnerComercial" ENABLE ROW LEVEL SECURITY;

-- ⚠ Prisma NO modela un default en `updatedAt` (lo escribe el cliente), así que
-- dejarlo con DEFAULT CURRENT_TIMESTAMP le mete una línea de drift permanente al
-- detector. Mismo cierre que el DDL de las 6 tablas del 2026-08-16.
ALTER TABLE "PartnerComercial" ALTER COLUMN "updatedAt" DROP DEFAULT;
