-- 2026-08-23 · La LECTURA de una licitación: lo que la IA entendió del ticket de SICOP.
--
-- Por qué: el pipeline «Gobiernos» se alimenta de un scraper de SICOP. Cada licitación llega
-- como un ticket cuyo TÍTULO es el objeto de la contratación y cuyas NOTAS son donde de verdad
-- está la información — el resumen del cartel que escribe el equipo (requisitos de
-- admisibilidad, forma de cotizar, garantías, tecnología obligatoria), las dudas sueltas y el
-- veredicto automático del propio scraper. Nada de eso vive en una propiedad: vive en prosa.
-- Medido el 2026-08-23: 29 de 45 tickets tienen notas, 61 notas, 22.800 caracteres. Hoy eso
-- solo sirve si alguien lo lee entero, ticket por ticket, adentro de HubSpot.
--
-- Esta tabla guarda el resultado de leerlo con Claude para poder FILTRAR y PRIORIZAR: de qué
-- es, si es para nosotros, si lo podemos ganar, qué nos bloquea, cómo se evalúa y cuándo cierra.
--
-- ⚠ ES UN CACHÉ, NO UNA FUENTE. HubSpot sigue siendo el dueño del dato; acá solo vive la
-- interpretación. Se puede truncar la tabla entera sin perder nada que no se pueda volver a
-- calcular (cuesta una corrida de IA, no información). Por eso NO hay FK a nada: la identidad
-- es el id del ticket de HubSpot.
--
-- ⚠ `fuenteSha` ES EL CORAZÓN. Es la huella del TEXTO QUE SE LEYÓ (título + descripción +
-- notas), no del ticket. Así una nota nueva invalida el análisis y un cambio que no toca lo
-- leído —mover de etapa, cambiar el responsable— NO lo invalida. Sin esa distinción, arrastrar
-- una tarjeta en HubSpot re-analizaría 45 licitaciones y eso es plata quemada.
--
-- ADITIVO: 1 tabla nueva + 1 enum. Nada se dropea, nada se renombra, ninguna columna existente
-- cambia. El código viejo no la toca.
--
-- Aplicación:
--   1. git pull  (esta base la comparten 2 PCs)
--   2. npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
--      → verificado el 2026-08-23: emite EXACTAMENTE esta tabla y este enum, más el ruido
--        preexistente que ya estaba antes de esta tanda (DROP de embedding/pgvector y 4
--        DropIndex de Project/ProjectCanvas). Ese ruido NO se aplica: solo se corre este .sql.
--   3. ALLOW_PROD_WRITE=1 npx prisma db execute --file scripts/sql/2026-08-23-sicop-lectura.sql
--   4. npx prisma generate     (NUNCA db push)
--   5. ALLOW_PROD_WRITE=1 npm run db:policies
--   6. reiniciar el dev server (el Prisma client viejo no entra por HMR)

-- ── Enum ────────────────────────────────────────────────────────────────────────
-- Los tres valores desde el día 1: un ALTER TYPE ADD VALUE no corre en transacción y obliga a
-- coordinar las 2 PCs.
--
-- ⛔ FUERA no es "malo": es DESTRUCTIVO. La pantalla esconde por default lo marcado FUERA, así
-- que un falso positivo no se lee como un error sino como que la licitación nunca existió. Por
-- eso el prompt empuja a DUDOSO ante cualquier duda, y por eso el default de un dato roto
-- (enum inválido devuelto por el modelo) también es DUDOSO.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SicopEncaje') THEN
        CREATE TYPE "SicopEncaje" AS ENUM ('DENTRO', 'DUDOSO', 'FUERA');
    END IF;
END $$;

-- ── SicopLectura ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "SicopLectura" (
    "id"                TEXT          NOT NULL,
    -- La identidad. Re-analizar ACTUALIZA la fila, nunca duplica.
    "hubspotTicketId"   TEXT          NOT NULL,
    -- Huella del texto leído (sha256 truncado a 32). Distinto = el análisis quedó viejo.
    "fuenteSha"         TEXT          NOT NULL,
    -- Cuántas notas entraron. 0 = se leyó solo el título: la pantalla lo dice, porque una
    -- conclusión sacada de un título no vale lo mismo que una sacada del cartel resumido.
    "notasLeidas"       INTEGER       NOT NULL DEFAULT 0,
    -- ⚠ EL CARTEL SUELE SER UN PDF. Medido el 2026-08-23: 30 de las 61 notas del pipeline no
    -- tienen una sola letra de texto — son archivos adjuntos, casi siempre el cartel. Cinco
    -- licitaciones no tienen NINGUNA nota con texto. Guardar cuántos archivos quedaron sin
    -- leer es lo que separa "no había información" de "la información está ahí y nadie se la
    -- pasó al modelo": en pantalla las dos fichas se ven igual de pobres.
    "adjuntosSinLeer"   INTEGER       NOT NULL DEFAULT 0,
    -- La fuente se recortó por tamaño: hay texto que el modelo NO vio.
    "fuenteTruncada"    BOOLEAN       NOT NULL DEFAULT false,

    -- ── De qué es ───────────────────────────────────────────────────────────────
    "objeto"            TEXT,
    "institucion"       TEXT,
    -- Vocabulario CERRADO (lib/ventas/sicop-orden.ts). Array y no una sola: una contratación
    -- de "sitio web + hosting + capacitación" es las tres cosas, y filtrar por cualquiera de
    -- ellas tiene que encontrarla.
    "categorias"        TEXT[]        DEFAULT ARRAY[]::TEXT[],

    -- ── ¿Es para nosotros? ──────────────────────────────────────────────────────
    "encaje"            "SicopEncaje" NOT NULL DEFAULT 'DUDOSO',
    "encajeRazon"       TEXT,
    "puntajeEncaje"     INTEGER,

    -- ── ¿Lo podemos ganar? ──────────────────────────────────────────────────────
    -- Nullable a propósito: cuando el texto no alcanza para juzgarlo, el modelo lo OMITE en
    -- vez de adivinar. Un 50 inventado es peor que un hueco, porque ordena.
    "probabilidad"      INTEGER,
    "probabilidadRazon" TEXT,
    -- [{ titulo, detalle, severidad: BLOQUEA|RIESGO }] — lo que nos deja afuera o nos complica.
    "bloqueantes"       JSONB,

    -- ── Cómo se evalúa y qué hay que entregar ───────────────────────────────────
    "evaluacion"        TEXT,
    -- % del puntaje que se lleva el precio. 100 = subasta pura. NULL = el cartel no lo dice.
    "pesoPrecio"        INTEGER,
    "entregables"       TEXT,
    -- [{ etiqueta, fecha: AAAA-MM-DD|null, nota }] — aclaraciones, apertura, ejecución.
    "plazos"            JSONB,

    -- ── Plata ───────────────────────────────────────────────────────────────────
    -- ⚠ Es una ESTIMACIÓN leída de prosa, no un monto contratado: no se suma ni se factura.
    -- Sirve para ordenar. La moneda es NULL cuando el texto no la dice — el campo
    -- `presupuesto__sicop_` del CRM mezcla monedas y magnitudes y no sirve de pista.
    "monto"             DECIMAL(16,2),
    "moneda"            TEXT,

    -- ── Trazabilidad ────────────────────────────────────────────────────────────
    -- Cuánta información REAL había para leer (0-100). No es cuán segura suena la conclusión.
    "confianza"         INTEGER,
    "modelo"            TEXT,
    "analizadoEl"       TIMESTAMP(3)  NOT NULL,
    -- El análisis falló. Se guarda la fila igual: "falló y por esto" es información, y sin la
    -- fila la pantalla diría "sin analizar" para siempre y nadie sabría que se intentó.
    "error"             TEXT,

    "createdAt"         TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3)  NOT NULL,
    CONSTRAINT "SicopLectura_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SicopLectura_hubspotTicketId_key"
    ON "SicopLectura" ("hubspotTicketId");
-- El camino caliente de la pantalla: "traeme las lecturas de estos 45 tickets".
CREATE INDEX IF NOT EXISTS "SicopLectura_encaje_idx" ON "SicopLectura" ("encaje");

-- Los tres puntajes son porcentajes. Un 250 no rompe nada visible: solo ordena mal, para
-- siempre y en silencio.
ALTER TABLE "SicopLectura" DROP CONSTRAINT IF EXISTS "SicopLectura_puntajes_0_100";
ALTER TABLE "SicopLectura" ADD CONSTRAINT "SicopLectura_puntajes_0_100" CHECK (
       ("puntajeEncaje" IS NULL OR ("puntajeEncaje" BETWEEN 0 AND 100))
   AND ("probabilidad"  IS NULL OR ("probabilidad"  BETWEEN 0 AND 100))
   AND ("pesoPrecio"    IS NULL OR ("pesoPrecio"    BETWEEN 0 AND 100))
   AND ("confianza"     IS NULL OR ("confianza"     BETWEEN 0 AND 100))
);

-- Un monto negativo sería un error de lectura, no una licitación.
ALTER TABLE "SicopLectura" DROP CONSTRAINT IF EXISTS "SicopLectura_monto_no_negativo";
ALTER TABLE "SicopLectura" ADD CONSTRAINT "SicopLectura_monto_no_negativo"
    CHECK ("monto" IS NULL OR "monto" >= 0);

ALTER TABLE "SicopLectura" ENABLE ROW LEVEL SECURITY;

-- ⚠ Prisma NO modela un default en `updatedAt` (lo escribe el cliente): dejarlo con
-- DEFAULT CURRENT_TIMESTAMP le mete una línea de drift permanente al detector.
ALTER TABLE "SicopLectura" ALTER COLUMN "updatedAt" DROP DEFAULT;
