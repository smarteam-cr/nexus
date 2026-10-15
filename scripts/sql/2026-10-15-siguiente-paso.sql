-- 2026-10-15 · El siguiente paso de cada equipo
--
-- «Para ti» por equipo, etapa 2 (docs/mi-dia-plan.md): un siguiente paso por equipo (Ventas, CS, Dev) sobre una
-- empresa, un negocio o un proyecto. Cada cambio es una fila (la historia queda en Nexus) y el vigente de cada objeto y
-- equipo se escribe en las propiedades «siguiente_paso_<equipo>» de HubSpot (lib/siguiente-paso).
--
-- ADITIVO: una tabla nueva. Re-ejecutable.
--
-- ⛔ ORDEN: esto va ANTES del deploy del código que trae el modelo: sin la tabla, /api/health responde 503 y el deploy
-- se revierte solo.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-15-siguiente-paso.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`.
-- Después, en la máquina de desarrollo: `npx prisma generate` y REINICIAR el dev server.

BEGIN;

CREATE TABLE IF NOT EXISTS "SiguientePaso" (
  "id"                 TEXT NOT NULL,
  "objeto"             TEXT NOT NULL,
  "objetoId"           TEXT NOT NULL,
  "equipo"             TEXT NOT NULL,
  "que"                TEXT NOT NULL,
  "fecha"              DATE,
  "responsableEmail"   TEXT,
  "responsableOwnerId" TEXT,
  "escritoPor"         TEXT NOT NULL,
  "fuente"             TEXT NOT NULL,
  "estado"             TEXT NOT NULL DEFAULT 'vigente',
  "cerradoPor"         TEXT,
  "cerradoAt"          TIMESTAMP(3),
  "hubspotObjectType"  TEXT,
  "hubspotObjectId"    TEXT,
  "hubspotEstado"      TEXT NOT NULL DEFAULT 'pendiente',
  "hubspotError"       TEXT,
  "hubspotEscritoAt"   TIMESTAMP(3),
  "hubspotIntentos"    INTEGER NOT NULL DEFAULT 0,
  "clientId"           TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SiguientePaso_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SiguientePaso_objeto_check" CHECK ("objeto" IN ('empresa', 'negocio', 'proyecto')),
  CONSTRAINT "SiguientePaso_equipo_check" CHECK ("equipo" IN ('ventas', 'cs', 'dev')),
  CONSTRAINT "SiguientePaso_fuente_check" CHECK ("fuente" IN ('persona', 'chat', 'reunion', 'hubspot')),
  CONSTRAINT "SiguientePaso_estado_check" CHECK ("estado" IN ('vigente', 'hecho', 'reemplazado')),
  CONSTRAINT "SiguientePaso_hubspotEstado_check" CHECK ("hubspotEstado" IN ('pendiente', 'escrito', 'error', 'sin_hubspot')),
  -- Cerrado ⇔ hecho o reemplazado.
  CONSTRAINT "SiguientePaso_cerrado_check" CHECK (("estado" = 'vigente') = ("cerradoAt" IS NULL)),
  CONSTRAINT "SiguientePaso_que_check" CHECK (length(btrim("que")) > 0)
);

CREATE INDEX IF NOT EXISTS "SiguientePaso_objeto_objetoId_equipo_estado_idx" ON "SiguientePaso"("objeto", "objetoId", "equipo", "estado");
CREATE INDEX IF NOT EXISTS "SiguientePaso_clientId_estado_idx" ON "SiguientePaso"("clientId", "estado");
CREATE INDEX IF NOT EXISTS "SiguientePaso_responsableEmail_estado_idx" ON "SiguientePaso"("responsableEmail", "estado");
CREATE INDEX IF NOT EXISTS "SiguientePaso_hubspotEstado_idx" ON "SiguientePaso"("hubspotEstado");
-- Un solo vigente por objeto y equipo.
CREATE UNIQUE INDEX IF NOT EXISTS "SiguientePaso_vigente_key" ON "SiguientePaso"("objeto", "objetoId", "equipo") WHERE "estado" = 'vigente';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SiguientePaso_clientId_fkey') THEN
    ALTER TABLE "SiguientePaso"
      ADD CONSTRAINT "SiguientePaso_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Tabla interna: RLS sin policy SELECT, y la RESTRICTIVE que tapa al anon aunque alguien sume una permisiva.
ALTER TABLE "SiguientePaso" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'SiguientePaso' AND policyname = 'deny_all_non_superuser') THEN
    CREATE POLICY "deny_all_non_superuser" ON "SiguientePaso" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
  END IF;
END $$;

COMMIT;
