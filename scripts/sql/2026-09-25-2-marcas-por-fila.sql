-- 2026-09-25 · Etapa 3 · «Está bien así» fila por fila en Cobranza › Odoo › «Lo que no cuadra»
--
-- ── POR QUÉ ────────────────────────────────────────────────────────────────────────
-- Hasta hoy «Está bien así» existía solo por GRUPO (`DiferenciaOdooAceptada`, una fila por código de línea): si
-- cambiaba una sola fila o entraba una nueva, volvía el grupo entero con todo lo ya revisado, y «Volver a abrir»
-- borraba la marca sin dejar rastro. Elías pidió (2026-09-25) marcar fila por fila, cada marca atada a su documento
-- y a sus NÚMEROS, con quién, cuándo y por qué, a la vista y con «Deshacer» que también quede registrado.
--
-- Qué agrega: la tabla `DiferenciaOdooMarca`. Una fila de la tabla = una marca sobre UN documento (factura, nota de
-- crédito, cobro, cuenta o factura soltada) en UNA línea de la lista:
--   · `tipo`         BIEN_ASI («Está bien así») o ANULADA («Ya está anulada» de una factura soltada).
--   · `linea`        el código de la línea donde vale la marca (ODOO-NOTA-SIN-APLICAR…). En otra línea no vale.
--   · `fila`         la clave de la fila donde se marcó; en las filas que juntan varias facturas, cada factura lleva
--                    su propia marca con la misma `fila`.
--   · `documento`    la clave del documento (f:…, c:…, l:…, cuenta:…, venta:…). Nunca un nombre.
--   · `huella`       los números del documento cuando se marcó. Si cambian, la marca deja de valer y la fila vuelve.
--   · `texto`        lo que decía la fila cuando se marcó: queda para la historia aunque la fila ya no exista.
--   · `motivo`, `marcadaPor`, `marcadaEn`: por qué, quién y cuándo.
--   · `deshechaPor`, `deshechaEn`: «Deshacer» NO borra la fila, la firma. Nada se borra de esta tabla.
--
-- ⚠ `DiferenciaOdooAceptada` NO se toca ni se borra: la pantalla deja de usarla, y el traspaso de su única marca
-- (las 15 notas de crédito) a marcas por fila es un script aparte, que se corre con visto bueno de Elías.
--
-- Tabla nueva con RLS deny-all, igual que las del espejo de Odoo: lleva montos y nombres de clientes. La misma
-- policy queda en `prisma/policies.sql`, que es la red que la restituye si se reconstruye la base.
--
-- ⚠⚠ VA ANTES QUE EL DEPLOY. Con el código nuevo y sin esta tabla, «Lo que no cuadra» da error al cargar (lee las
-- marcas en cada carga) y el número de la pestaña no se puede calcular. Al revés no pasa nada: el código viejo no
-- la nombra.
--
-- Aditivo e idempotente: se puede correr dos veces, y si se corta a mitad se vuelve a correr.
--
-- Aplicar con:  ALLOW_PROD_WRITE=1 npx prisma db execute --file scripts/sql/2026-09-25-2-marcas-por-fila.sql --schema prisma/schema.prisma
-- Después:      npx prisma generate   (NUNCA db push)

CREATE TABLE IF NOT EXISTS "DiferenciaOdooMarca" (
    "id"          TEXT NOT NULL,
    "tipo"        TEXT NOT NULL DEFAULT 'BIEN_ASI',
    "linea"       TEXT NOT NULL,
    "fila"        TEXT NOT NULL,
    "documento"   TEXT NOT NULL,
    "huella"      TEXT NOT NULL,
    "texto"       TEXT NOT NULL,
    "motivo"      TEXT NOT NULL,
    "marcadaPor"  TEXT NOT NULL,
    "marcadaEn"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deshechaPor" TEXT,
    "deshechaEn"  TIMESTAMP(3),
    CONSTRAINT "DiferenciaOdooMarca_pkey" PRIMARY KEY ("id")
);

-- Cada carga de la lista lee las marcas vigentes (`deshechaEn IS NULL`); «Ya está anulada» busca por documento.
CREATE INDEX IF NOT EXISTS "DiferenciaOdooMarca_deshechaEn_idx" ON "DiferenciaOdooMarca"("deshechaEn");
CREATE INDEX IF NOT EXISTS "DiferenciaOdooMarca_documento_idx" ON "DiferenciaOdooMarca"("documento");

-- ── RLS ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "DiferenciaOdooMarca" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_non_superuser ON "DiferenciaOdooMarca";
CREATE POLICY deny_all_non_superuser ON "DiferenciaOdooMarca" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

-- ── Verificación (solo lectura, correr aparte) ─────────────────────────────────────
-- Esperado recién aplicado: 0 | 0 | 1 (la tabla vacía y la marca de grupo de las notas intacta).
--   SELECT (SELECT COUNT(*) FROM "DiferenciaOdooMarca")                               AS marcas,
--          (SELECT COUNT(*) FROM "DiferenciaOdooMarca" WHERE "deshechaEn" IS NOT NULL) AS deshechas,
--          (SELECT COUNT(*) FROM "DiferenciaOdooAceptada")                            AS marcas_de_grupo;
