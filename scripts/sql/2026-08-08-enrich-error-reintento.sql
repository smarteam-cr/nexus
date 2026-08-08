-- 2026-08-08 · Procedencia del error de enriquecimiento + reintento con tope
--
-- ADITIVO: 2 columnas en "FirefliesSession". No borra, no renombra, no cambia ningún tipo.
-- Cero filas afectadas: enrichAttempts nace en 0 y enrichError en NULL para todas.
--
-- Cómo aplicarlo (revisá antes de correr):
--   ALLOW_PROD_WRITE=1 npx prisma db execute --file scripts/sql/2026-08-08-enrich-error-reintento.sql
-- Después:
--   npx prisma generate      (NO `db push` — droppearía columnas de la otra PC)
--   reiniciar el dev server  (el Prisma client viejo no conoce las columnas; INV7 lo caza)
--
-- ── EL INCIDENTE QUE ESTAS COLUMNAS VIENEN A IMPEDIR ─────────────────────────
-- El enriquecimiento de Google Meet trataba TODO resultado como definitivo: un fallo de
-- lectura (429 de la API, 403 de permisos, red) se tragaba en un catch mudo y la fila
-- quedaba `enrichedAt` = lista PARA SIEMPRE. Así se quemaron dos corridas masivas:
-- 17-may-2026 (528 de 1.100 docs ilegibles) y 7-jul-2026 (47 de 73), contra 0-5 en días
-- normales. Cero filas pendientes de reintento en toda la base: el fallo pasajero quedó
-- grabado como definitivo, y la investigación del 2026-08-08 tuvo que INFERIR las causas
-- porque no quedaba ningún rastro del error.
--
-- ── QUÉ SIGNIFICA CADA COLUMNA ───────────────────────────────────────────────
-- enrichAttempts: cuántas veces se intentó leer y FALLÓ. 0 = nunca falló (o el último
--   intento salió bien). Las pasadas normales solo toman filas en 0; lo fallido (1..4) lo
--   drena el job `google-enrich-retry` con espera exponencial; al 5º fallo se SELLA con
--   procedencia — el tope es lo que impide el loop infinito que el sellado incondicional
--   evitaba a lo bruto.
-- enrichError: JSON con el último error ({error, status, at}) o, en una lectura exitosa
--   SIN transcript, el diagnóstico del parser ({tabsVistos, motivo}) — los nombres de las
--   pestañas del doc quedan persistidos para siempre (hoy solo viven en el stdout del VPS,
--   que la rotación de logs borra). Distinguir «falló la lectura» de «no había nada» es
--   exactamente lo que antes no se podía.

ALTER TABLE "FirefliesSession"
  ADD COLUMN IF NOT EXISTS "enrichAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "enrichError" TEXT;

COMMENT ON COLUMN "FirefliesSession"."enrichAttempts" IS
  'Intentos de enriquecimiento FALLIDOS consecutivos. 0 = sano; 1-4 = en cola del job de reintento; 5 = sellado con procedencia.';
COMMENT ON COLUMN "FirefliesSession"."enrichError" IS
  'JSON: último error de lectura ({error,status,at}) o diagnóstico del parser cuando la lectura fue exitosa sin transcript ({tabsVistos,motivo}).';
