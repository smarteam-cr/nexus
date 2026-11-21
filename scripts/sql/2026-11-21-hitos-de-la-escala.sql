-- 2026-11-21 · La escala que se le presenta al cliente: CUÁNDO se presentó y QUÉ RESPONDIÓ el cliente.
--
-- Una tabla nueva, SOLO ADITIVA, inocua para el código viejo (que no la lee):
--   "HitoDeLaEscala": append-only. Cada fila es un hecho con quién y cuándo: «presentada» (con el día), «acepto»,
--   «acepto-con-cambios» o «pidio-ajustes» (con una nota). Guarda las piezas de la foto publicada en ese momento
--   («loQueSeVio»), porque la foto de "AccesoALaEscala" se pisa con cada «Publicar». Formato: lib/impacto/respuesta-del-cliente.ts.
--   Con RLS y sin policies (lock-down, ARCHITECTURE §4.5): solo Prisma la lee.
--
-- Se puede correr dos veces. Va ANTES del deploy del código que la usa.
--
-- Volver atrás (borra lo nuevo; con revisión):
--   DROP TABLE IF EXISTS "HitoDeLaEscala";
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-11-21-hitos-de-la-escala.sql; Remove-Item Env:ALLOW_PROD_WRITE

CREATE TABLE IF NOT EXISTS "HitoDeLaEscala" (
  "id"            TEXT NOT NULL,
  "exploracionId" TEXT NOT NULL,
  "tipo"          TEXT NOT NULL,
  "fecha"         TEXT,
  "nota"          TEXT,
  "loQueSeVio"    TEXT,
  "publicadaEn"   TIMESTAMP(3),
  "porEmail"      TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HitoDeLaEscala_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "HitoDeLaEscala_exploracionId_createdAt_idx" ON "HitoDeLaEscala" ("exploracionId", "createdAt");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'HitoDeLaEscala_exploracionId_fkey') THEN
    ALTER TABLE "HitoDeLaEscala" ADD CONSTRAINT "HitoDeLaEscala_exploracionId_fkey" FOREIGN KEY ("exploracionId") REFERENCES "ExploracionDeVenta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
ALTER TABLE "HitoDeLaEscala" ENABLE ROW LEVEL SECURITY;
