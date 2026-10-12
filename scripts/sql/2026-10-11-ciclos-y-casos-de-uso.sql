-- 2026-10-11 · Servicios recurrentes: ciclos y casos de uso (docs/smartloop-plan.md, etapa 1).
--
-- Un proyecto recurrente avanza por CICLOS (un tramo con fechas, de diagnóstico a aprendizaje) y cada
-- ciclo lleva sus CASOS DE USO. El caso de uso es de la empresa: puede estar sugerido, en el plan o en
-- un ciclo. El compromiso del servicio (mensual, semestral o anual) es opcional.
--
-- ADITIVO: 2 tablas nuevas y 1 columna nullable. Las tablas nacen con RLS y una política RESTRICTIVE
-- que niega todo al rol anon/authenticated (tablas internas: solo las lee Prisma).
--
-- ⛔ ORDEN: esto va ANTES del deploy. /api/health responde 503 sin estas tablas y deploy.sh revierte.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-11-ciclos-y-casos-de-uso.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`. Se puede correr dos veces.

ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "compromiso" TEXT;

CREATE TABLE IF NOT EXISTS "CicloDeProyecto" (
  "id"         TEXT PRIMARY KEY,
  "projectId"  TEXT NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "numero"     INTEGER NOT NULL,
  "nombre"     TEXT,
  "desde"      DATE,
  "hasta"      DATE,
  "meta"       TEXT,
  "etapa"      TEXT NOT NULL DEFAULT 'diagnostico',
  "estado"     TEXT NOT NULL DEFAULT 'abierto',
  "cerradoAt"  TIMESTAMP(3),
  "cerradoPor" TEXT,
  "creadoPor"  TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "CicloDeProyecto_projectId_numero_key" ON "CicloDeProyecto"("projectId", "numero");
-- Un solo ciclo abierto por proyecto.
CREATE UNIQUE INDEX IF NOT EXISTS "CicloDeProyecto_uno_abierto" ON "CicloDeProyecto"("projectId") WHERE "estado" = 'abierto';

CREATE TABLE IF NOT EXISTS "CasoDeUso" (
  "id"             TEXT PRIMARY KEY,
  "clientId"       TEXT NOT NULL REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "projectId"      TEXT REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "cicloId"        TEXT REFERENCES "CicloDeProyecto"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "titulo"         TEXT NOT NULL,
  "resultado"      TEXT,
  "mueve"          JSONB NOT NULL DEFAULT '[]',
  "porque"         TEXT,
  "criterio"       TEXT,
  "metrica"        TEXT,
  "criterioMedido" TEXT,
  "origen"         TEXT NOT NULL DEFAULT 'manual',
  "estado"         TEXT NOT NULL DEFAULT 'en_ciclo',
  "orden"          INTEGER NOT NULL DEFAULT 0,
  "creadoPor"      TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "CasoDeUso_clientId_idx" ON "CasoDeUso"("clientId");
CREATE INDEX IF NOT EXISTS "CasoDeUso_projectId_idx" ON "CasoDeUso"("projectId");
CREATE INDEX IF NOT EXISTS "CasoDeUso_cicloId_idx" ON "CasoDeUso"("cicloId");

ALTER TABLE "CicloDeProyecto" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CasoDeUso" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'CicloDeProyecto' AND policyname = 'deny_all_non_superuser') THEN
    CREATE POLICY "deny_all_non_superuser" ON "CicloDeProyecto" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'CasoDeUso' AND policyname = 'deny_all_non_superuser') THEN
    CREATE POLICY "deny_all_non_superuser" ON "CasoDeUso" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
  END IF;
END $$;
