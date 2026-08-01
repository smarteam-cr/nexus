-- prisma/migrations/0_init/after.sql — lo que el schema de Prisma NO SABE REPRESENTAR y
-- por lo tanto la migration.sql generada no trae. Se corre INMEDIATAMENTE después de
-- 0_init/migration.sql al bootstrapear una base nueva. Idempotente.
--
-- ⚠ Prisma solo ejecuta migration.sql: este archivo convive en la carpeta sin afectar
--   checksums ni `migrate deploy` — es documentación ejecutable del bootstrap.
--
-- ⚠ RLS y las policies NO viven acá A PROPÓSITO: su fuente única es prisma/policies.sql
--   (idempotente, con barrido dinámico de TODAS las tablas presentes y futuras). Dos copias
--   del mismo SQL divergen (ARCHITECTURE §2.1). Después de este archivo, corré:
--     ALLOW_PROD_WRITE=1 npm run db:policies
--   (policies.sql también crea la extensión vector y la columna embedding — se repiten acá
--   solo para que ESTE archivo deje la base consultable aun sin el paso de policies; ambas
--   formas son IF NOT EXISTS, correr los dos no duplica nada.)
--
-- Cómo aplicar (el guard exige ALLOW_PROD_WRITE=1):
--   ALLOW_PROD_WRITE=1 npx prisma db execute --file prisma/migrations/0_init/after.sql

-- 1) pgvector: la columna vive solo en SQL — en prisma/schema.prisma es un comentario
--    (Prisma no modela `vector(1024)`), y por eso todo `migrate diff` contra la base viva
--    la propone como DROP: ese es el RUIDO ESPERADO del detector de drift, no un drift real.
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE IF EXISTS "KnowledgeEmbedding"
  ADD COLUMN IF NOT EXISTS embedding vector(1024);

-- 2) CHECK de Client.logoScale (origen: scripts/sql/2026-07-27-logo-scale-techo-400.sql —
--    rango 50..400, NULL-permisivo; el porqué del techo 400 está en DECISIONS §El logo).
ALTER TABLE "Client" DROP CONSTRAINT IF EXISTS "Client_logoScale_rango";
ALTER TABLE "Client"
  ADD CONSTRAINT "Client_logoScale_rango"
  CHECK ("logoScale" IS NULL OR ("logoScale" >= 50 AND "logoScale" <= 400));
