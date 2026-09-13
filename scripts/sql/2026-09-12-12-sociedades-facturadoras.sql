-- 2026-09-12 · Etapa 12 · Una empresa, varias sociedades que facturan
--
-- ── POR QUÉ ────────────────────────────────────────────────────────────────────────
-- Nexus guardaba UNA identidad legal por cuenta. Del lado de Odoo ya se podían colgar varios clientes de
-- Odoo de una misma cuenta (`OdooPartnerVinculo`, N:1), pero fuera de Odoo no había dónde anotar una
-- segunda sociedad: Grupo INB factura por Mercury como Quirinale Group (US$12.500,01) y como Ingeniería
-- Verde (US$12.500,00), y ninguna factura dice «Grupo INB». Y el cobro no guardaba a quién se le facturó
-- ni en qué plataforma: eso lo decide Vilma, factura por factura, y no tenía dónde caer.
--
-- Qué agrega. Todo aditivo: ninguna fila cambia de valor y nada se renombra ni se borra.
--   1. `OdooPartnerVinculo` pasa a ser «la sociedad que factura», de cualquier plataforma:
--      · `plataforma`     ODOO por defecto: las 82 filas de hoy son fichas de Odoo.
--      · `odooPartnerId`  deja de ser obligatorio: una sociedad de Mercury o QuickBooks no tiene ficha.
--                         Sigue siendo único: dos filas no apuntan a la misma ficha.
--      · `claveFactura`   el nombre en factura normalizado (`claveFactura()` de lib/cobranza/sociedades.ts).
--                         Solo en las sociedades SIN ficha, y es lo que las hace únicas por plataforma. Las
--                         de Odoo se distinguen por su ficha: medido hoy hay 3 pares de fichas con el mismo
--                         nombre (Municipalidad de Carrillo, PUBLIMARK, RELEVA CONSULTORES), y un único por
--                         nombre sobre ellas no correría.
--      · el índice único parcial (plataforma, claveFactura) de las filas sin ficha, y el control de forma:
--        con ficha es ODOO; sin ficha no es ODOO y lleva su clave.
--      El nombre y la cédula siguen en `odooPartnerNombre` y `odooVat`: no se renombran, porque el código
--      que corre hoy los lee.
--      ⛔ Sin cédula única: «Librería Internacional» y «Librería Internacional (Desarrollos Culturales Costa
--      Rica)» son dos cuentas con la misma cédula 3-101-167504.
--   2. `Cobro` gana `plataformaFactura` (dónde se emitió) y `sociedadFacturadaId` (a quién), como
--      referencia a la sociedad y no como texto libre. Los dos quedan null en los 227 cobros de hoy.
--      Borrar una sociedad deja el cobro sin ella (SET NULL); la app no las borra: las suelta.
--
-- Sin tabla nueva: `OdooPartnerVinculo` ya tiene su policy deny-all en prisma/policies.sql, y la tabla
-- sigue siendo la misma, así que `policies.sql` no cambia.
--
-- ⚠⚠ VA ANTES QUE EL DEPLOY DE LA ETAPA 12. Prisma lee todas las columnas del modelo cuando una consulta
-- no dice cuáles: con el código nuevo y sin este archivo, abrir una cuenta, marcar facturado, registrar un
-- pago, generar cobros y el emparejado con Odoo dan error. Al revés no pasa nada: el código viejo no nombra
-- estas columnas, y siempre escribe la ficha de Odoo, así que el control nuevo no lo frena.
--
-- Aditivo e idempotente: se puede correr dos veces, y si se corta a mitad se vuelve a correr.
--
-- Aplicar con:  ALLOW_PROD_WRITE=1 npx prisma db execute --file scripts/sql/2026-09-12-12-sociedades-facturadoras.sql --schema prisma/schema.prisma
-- Después:      npx prisma generate   (NUNCA db push)  ·  npm run check:invariants → INV36 en verde

BEGIN;

-- ── 1. La sociedad que factura ──────────────────────────────────────────────────────
ALTER TABLE "OdooPartnerVinculo" ADD COLUMN IF NOT EXISTS "plataforma" "CobranzaViaCobro" NOT NULL DEFAULT 'ODOO';
ALTER TABLE "OdooPartnerVinculo" ADD COLUMN IF NOT EXISTS "claveFactura" TEXT;
ALTER TABLE "OdooPartnerVinculo" ALTER COLUMN "odooPartnerId" DROP NOT NULL;

-- ⚠ Prisma no modela índices parciales: este vive solo acá. Nunca `db push` (lo borraría).
CREATE UNIQUE INDEX IF NOT EXISTS "OdooPartnerVinculo_plataforma_claveFactura_sin_ficha_key"
    ON "OdooPartnerVinculo" ("plataforma", "claveFactura")
    WHERE "odooPartnerId" IS NULL;

-- La regla es la de `agregarSociedad()` en lib/cobranza/sociedades-servicio.ts. Si cambia una, cambia la otra.
ALTER TABLE "OdooPartnerVinculo" DROP CONSTRAINT IF EXISTS "OdooPartnerVinculo_ficha_o_clave";
ALTER TABLE "OdooPartnerVinculo" ADD CONSTRAINT "OdooPartnerVinculo_ficha_o_clave" CHECK (
    ("odooPartnerId" IS NOT NULL AND "plataforma" = 'ODOO')
    OR ("odooPartnerId" IS NULL AND "plataforma" <> 'ODOO' AND "claveFactura" IS NOT NULL)
);

-- ── 2. A quién y dónde se facturó cada cobro ────────────────────────────────────────
ALTER TABLE "Cobro" ADD COLUMN IF NOT EXISTS "plataformaFactura" "CobranzaViaCobro";
ALTER TABLE "Cobro" ADD COLUMN IF NOT EXISTS "sociedadFacturadaId" TEXT;
CREATE INDEX IF NOT EXISTS "Cobro_sociedadFacturadaId_idx" ON "Cobro" ("sociedadFacturadaId");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Cobro_sociedadFacturadaId_fkey') THEN
        ALTER TABLE "Cobro" ADD CONSTRAINT "Cobro_sociedadFacturadaId_fkey"
            FOREIGN KEY ("sociedadFacturadaId") REFERENCES "OdooPartnerVinculo" ("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

COMMIT;

-- ── Verificación (solo lectura, correr aparte) ─────────────────────────────────────
-- Esperado hoy: ODOO | 82 | 0.
--   SELECT "plataforma", COUNT(*), COUNT(*) FILTER (WHERE "odooPartnerId" IS NULL) AS sin_ficha
--     FROM "OdooPartnerVinculo" GROUP BY 1;
-- Esperado hoy: 0 | 0.
--   SELECT COUNT(*) FILTER (WHERE "plataformaFactura" IS NOT NULL)   AS con_plataforma,
--          COUNT(*) FILTER (WHERE "sociedadFacturadaId" IS NOT NULL) AS con_sociedad
--     FROM "Cobro";
