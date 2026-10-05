-- 2026-10-04 · «Para ti»: lo que lleva cada persona (frentes) y los avisos
--
-- Pedido de Elías (2026-10-04): que cada persona vea lo que le toca y reciba avisos que tengan sentido para ella, sin
-- dejar de ver todo lo que su rol le permite. El ROL sigue diciendo qué puede ver y hacer; los FRENTES dicen qué sigue
-- (lib/para-ti/frentes.ts). Los AVISOS guardan lo que pasó (el cliente aprobó, te devolvieron un pago…).
--
-- ADITIVO: tres columnas que aceptan vacío en "TeamMember" y una tabla nueva. Nada existente cambia de forma.
-- Re-ejecutable: la base local re-aplica todos los SQL con fecha en cada bootstrap.
--
-- ⛔ ORDEN: esto va ANTES del deploy. Las columnas de "TeamMember" las lee CADA página de Nexus (el usuario se carga
-- con su fila completa): sin ellas no carga nada. La revisión de salud del deploy lo detecta y vuelve atrás solo.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-04-para-ti.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`.
-- Después, en la máquina de desarrollo: `npx prisma generate` y REINICIAR el dev server.

BEGIN;

-- ── Lo que lleva cada persona ────────────────────────────────────────────────────────
-- Vacío y sin fecha = nadie lo eligió: salen del rol. Con fecha, la lista manda aunque esté vacía.
ALTER TABLE "TeamMember" ADD COLUMN IF NOT EXISTS "frentes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "TeamMember" ADD COLUMN IF NOT EXISTS "frentesEditadosAt" TIMESTAMP(3);
ALTER TABLE "TeamMember" ADD COLUMN IF NOT EXISTS "frentesEditadosPor" TEXT;

-- ── Los avisos ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Aviso" (
  "id"         TEXT NOT NULL,
  "paraEmail"  TEXT NOT NULL,
  "tipo"       TEXT NOT NULL,
  "titulo"     TEXT NOT NULL,
  "detalle"    TEXT,
  "href"       TEXT NOT NULL,
  "frente"     TEXT,
  "actorEmail" TEXT,
  "dedupeKey"  TEXT NOT NULL,
  "creadoAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leidoAt"    TIMESTAMP(3),
  CONSTRAINT "Aviso_pkey" PRIMARY KEY ("id"),
  -- Un aviso lleva a algún lado dentro de Nexus, nunca afuera.
  CONSTRAINT "Aviso_href_interno" CHECK ("href" LIKE '/%' AND "href" NOT LIKE '//%'),
  -- Nadie recibe un aviso de lo que hizo él mismo.
  CONSTRAINT "Aviso_no_a_quien_lo_hizo" CHECK ("actorEmail" IS NULL OR "actorEmail" <> "paraEmail")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Aviso_paraEmail_dedupeKey_key" ON "Aviso" ("paraEmail", "dedupeKey");
CREATE INDEX IF NOT EXISTS "Aviso_paraEmail_leidoAt_creadoAt_idx" ON "Aviso" ("paraEmail", "leidoAt", "creadoAt");

-- Tabla interna: con la clave pública no se lee nada.
ALTER TABLE "Aviso" ENABLE ROW LEVEL SECURITY;

COMMIT;
