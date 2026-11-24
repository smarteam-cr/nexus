-- 2026-11-23 · El registro de los scripts/sql/ que ya corrieron en ESTA base
--
-- Pedido de Elías (decisión 103 del roadmap, 23 nov), tomado de docs/evaluacion-de-nexus-2026-11.md › 3.4: los cambios
-- de base son .sql a mano, dos PCs y varias sesiones los corren, y no había dónde mirar cuáles ya corrieron. Un deploy
-- salía con el SQL sin correr, /api/health respondía 503 y deploy.sh revertía. Decisión en docs/DECISIONS.md ›
-- «Registro de los SQL aplicados».
--
-- Una fila por archivo de scripts/sql/ (el nombre, sin carpeta):
--   · `huella`: sha256 del texto con los fines de línea en LF y sin BOM (lib/db/registro-de-sql.ts › huellaDeSql). Si el
--     archivo cambia después de aplicarse, `npm run check:esquema` lo dice.
--   · `aplicadoEn`: la última vez que se aplicó (UTC).
--   · `desde`: la máquina y el comando («PC · npm run db:sql», «PC · db:local bootstrap», «PC · test:int»…).
--   · `como`: `aplicado` (corrió con npm run db:sql, el bootstrap local o el setup de las pruebas), `demostrado` (el
--     backfill lo anotó porque el esquema de la base prueba que corrió) o `marcado` (una persona dijo que corrió: no
--     deja rastro en el esquema, como un UPDATE de datos).
-- `como` es TEXTO con CHECK y no un enum: sumar una clase no pide `ALTER TYPE … ADD VALUE`.
--
-- ADITIVO e inocuo para el código que corre hoy: una tabla nueva que nadie lee todavía. Se puede correr dos veces.
--
-- ⛔ ORDEN: ANTES del deploy (el modelo `SqlAplicado` está en schema.prisma: sin la tabla, /api/health responde 503).
-- Es el primer archivo que se aplica con el camino nuevo, y se anota solo:
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npm run db:sql -- scripts/sql/2026-11-23-registro-de-sql.sql --apply; Remove-Item Env:ALLOW_PROD_WRITE
--
-- Después, el backfill de los que ya corrieron (docs/RUNBOOK.md › «Registro de los SQL aplicados»). NUNCA `prisma db push`.

CREATE TABLE IF NOT EXISTS "SqlAplicado" (
  "archivo"    TEXT NOT NULL,
  "huella"     TEXT NOT NULL,
  "aplicadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "desde"      TEXT NOT NULL,
  "como"       TEXT NOT NULL,
  CONSTRAINT "SqlAplicado_pkey" PRIMARY KEY ("archivo")
);

DO $$ BEGIN
  ALTER TABLE "SqlAplicado" ADD CONSTRAINT "SqlAplicado_como_valido"
    CHECK ("como" IN ('aplicado', 'demostrado', 'marcado'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "SqlAplicado" ADD CONSTRAINT "SqlAplicado_huella_sha256"
    CHECK ("huella" ~ '^[0-9a-f]{64}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Como toda tabla nueva: sin RLS, la publishable key del navegador la leería (ARCHITECTURE §4.5).
ALTER TABLE "SqlAplicado" ENABLE ROW LEVEL SECURITY;
