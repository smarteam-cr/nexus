-- 2026-07-30 · Roles: tipo de documento + compartir de solo lectura + link público oculto
--
-- ADITIVO: 1 enum nuevo, 4 columnas nuevas en RoleProfile (ninguna obligatoria para el
-- código viejo) y 1 tabla nueva. NO borra ni renombra nada.
--
-- ⚠ POR QUÉ A MANO Y NO `db push`: al escribir esto, `prisma migrate diff` proponía además
--     DROP INDEX "Project_hermanoCsProjectId_idx";
--     DROP INDEX "Project_hubspotPipelineId_idx";
--     DROP INDEX "ProjectCanvas_projectId_slug_key";
--     ALTER TABLE "KnowledgeEmbedding" DROP COLUMN "embedding";
--   Nada de eso es de esta tanda: son deriva viva de la otra PC + la columna pgvector que
--   Prisma no sabe representar. Un `db push` las habría borrado sin preguntar.
--
-- ⚠ EL DEFAULT DE `docType` NO ES COSMÉTICO: entre este SQL y el deploy, el PROD viejo sigue
--   haciendo `prisma.roleProfile.create({data})` SIN ese campo (lib/roles/mutations.ts). Sin
--   `NOT NULL DEFAULT 'PERFIL'`, crear un rol reventaría durante toda la ventana.
--
-- Cómo aplicarlo (revisá antes de correr):
--   npx prisma db execute --file scripts/sql/2026-07-30-role-doctype-share-publico.sql
-- Después:
--   npx prisma generate   (NO `db:sync` — eso corre db push)
--   reiniciar el dev server (el Prisma client viejo no entra por HMR)
--   npm run check:invariants   (INV4 + INV7 son los que prueban que esto aterrizó)

-- ⚠ FUERA de la transacción: un valor de enum recién creado no se puede USAR en la misma
--   transacción que lo creó (regla de Postgres, ver el caso ClientKind).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RoleDocType') THEN
    CREATE TYPE "RoleDocType" AS ENUM ('PERFIL', 'PROPUESTA');
  END IF;
END $$;

BEGIN;

-- ── 1) Qué CLASE de documento es esta fila ───────────────────────────────────────────────
-- Hasta hoy `RoleProfile` era "perfil de puesto" implícitamente. La propuesta de contratación
-- comparte storage (mismo mapa Json de secciones) y cambia solo la PLANTILLA con la que se
-- renderiza — por eso es una columna y no una tabla nueva.
ALTER TABLE "RoleProfile"
  ADD COLUMN IF NOT EXISTS "docType" "RoleDocType" NOT NULL DEFAULT 'PERFIL';

-- ── 2) Link público OCULTO ───────────────────────────────────────────────────────────────
-- `publicToken` ES la capability: 64 hex (crypto.randomBytes(32), 256 bits). null = NO
-- publicado; revocar = ponerlo en null (el link viejo muere y no vuelve).
-- `publicPublishedAt`/`publicPublishedByEmail` son AUDITORÍA y no se consultan como gate:
-- dos fuentes para el mismo bit divergen (ARCHITECTURE §2.1).
ALTER TABLE "RoleProfile"
  ADD COLUMN IF NOT EXISTS "publicToken"            TEXT,
  ADD COLUMN IF NOT EXISTS "publicPublishedAt"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "publicPublishedByEmail" TEXT;

-- UNIQUE: el token es la llave por la que entra el mundo. Varios NULL conviven en Postgres,
-- así que los documentos sin publicar no colisionan entre sí.
CREATE UNIQUE INDEX IF NOT EXISTS "RoleProfile_publicToken_key"
  ON "RoleProfile"("publicToken");

-- ── 3) Compartir con una persona del equipo (SOLO LECTURA) ───────────────────────────────
-- Sin `kind GRANT/REVOKE` (a diferencia de ClientAssignment): acá el default es "solo Super
-- Admin", así que no hay acceso heredado que revocar — la fila ES el acceso, borrarla lo quita.
CREATE TABLE IF NOT EXISTS "RoleProfileShare" (
    "id"             TEXT NOT NULL,
    "roleId"         TEXT NOT NULL,
    "teamMemberId"   TEXT NOT NULL,
    "grantedByEmail" TEXT NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoleProfileShare_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RoleProfileShare_roleId_teamMemberId_key"
  ON "RoleProfileShare"("roleId", "teamMemberId");

-- ⚠ NO es redundante con el UNIQUE de arriba: ese lidera por "roleId" y no sirve para el
--   filtro por PERSONA, que es el de la lista visible y el del sidebar (¿tengo algo compartido?).
CREATE INDEX IF NOT EXISTS "RoleProfileShare_teamMemberId_idx"
  ON "RoleProfileShare"("teamMemberId");

-- CASCADE en ambas: un share no tiene vida propia. Si se borra el documento o la persona, el
-- acceso desaparece con él — nunca queda una fila apuntando al vacío.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RoleProfileShare_roleId_fkey') THEN
    ALTER TABLE "RoleProfileShare"
      ADD CONSTRAINT "RoleProfileShare_roleId_fkey"
      FOREIGN KEY ("roleId") REFERENCES "RoleProfile"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RoleProfileShare_teamMemberId_fkey') THEN
    ALTER TABLE "RoleProfileShare"
      ADD CONSTRAINT "RoleProfileShare_teamMemberId_fkey"
      FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── 4) RLS ───────────────────────────────────────────────────────────────────────────────
-- ⚠ OBLIGATORIO — `db push` NO habilita RLS (ARCHITECTURE §4.5). Supabase auto-otorga
-- GRANT SELECT a `anon` sobre todo `public`: sin esto, la tabla sería leíble con la
-- publishable key que viaja en el bundle del browser.
ALTER TABLE "RoleProfileShare" ENABLE ROW LEVEL SECURITY;

-- Deny-all RESTRICTIVE, el mismo patrón que CostoRecurrente: estos documentos llevan ofertas
-- salariales. Las RESTRICTIVE se AND-ean con cualquier permisiva futura (`false AND x = false`).
-- No protege del rol interno (Prisma conecta con BYPASSRLS) — eso lo hace `visibleRoleWhere`.
DROP POLICY IF EXISTS deny_all_non_superuser ON "RoleProfile";
CREATE POLICY deny_all_non_superuser ON "RoleProfile"
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

DROP POLICY IF EXISTS deny_all_non_superuser ON "RoleProfileShare";
CREATE POLICY deny_all_non_superuser ON "RoleProfileShare"
  AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

COMMIT;

-- Verificación:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'RoleProfile' AND column_name LIKE 'public%' OR column_name = 'docType';
--   SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'RoleProfileShare';
