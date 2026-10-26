/**
 * lib/invariantes/analizador-venta.ts — el invariante del ANALIZADOR DE REUNIONES DE VENTA (S3, 2026-10-25;
 * docs/analizador-reuniones-venta-plan.md).
 */
import { duenoDeLaSesion } from "@/lib/sessions/project-sources";
import { cumple, viola, type Invariante } from "./contrato";

const lista = (xs: string[], max = 8) => xs.slice(0, max).map((x) => `    · ${x}`).join("\n") + (xs.length > max ? `\n    · y ${xs.length - max} más` : "");

/** ¿La base todavía no tiene la tabla del analizador? (el SQL 2026-10-26-analizador-venta.sql). */
function faltaLaTabla(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  return code === "P2021" || code === "42P01";
}

/**
 * INV57 · Todo análisis de una reunión de venta es de la empresa dueña de esa reunión HOY (invariante 1: un análisis
 * habla de una sola empresa). Si la reunión cambia de dueña, la re-atribución suelta el análisis viejo
 * (lib/analizador-venta/ajenos.ts); si igual quedó uno, la pantalla no lo muestra y este invariante lo dice. Nace
 * bloqueante: el día que se escribió la tabla estaba vacía.
 * Remedio: scripts/limpiar-analisis-de-venta-ajenos.ts --apply, y volver a analizar la reunión si sigue siendo de venta
 * (desde su preventa: Exploración › la sesión › Análisis, o la pieza «Análisis»).
 */
export const INV57: Invariante = {
  id: "57",
  nombre: "cada análisis de venta es de la empresa dueña de su reunión",
  async correr(db) {
    let filas: { sessionId: string; clientId: string; session: { title: string; resolvedClientId: string | null; manualClientId: string | null } }[];
    try {
      filas = await db.analisisDeVenta.findMany({
        select: { sessionId: true, clientId: true, session: { select: { title: true, resolvedClientId: true, manualClientId: true } } },
      });
    } catch (e) {
      if (faltaLaTabla(e)) return cumple("✓ INV57: no aplica todavía — esta base no tiene la tabla del analizador (falta scripts/sql/2026-10-26-analizador-venta.sql).");
      throw e;
    }
    const cruzados = filas.filter((f) => duenoDeLaSesion(f.session) !== f.clientId);
    if (!cruzados.length) return cumple(`✓ INV57: los ${filas.length} análisis de venta son de la empresa dueña de su reunión.`);
    return viola(
      `✗ INV57 VIOLADO: ${cruzados.length} análisis de venta quedaron colgados de una empresa que ya no es la dueña de su reunión.`,
      lista(cruzados.map((f) => `«${f.session.title}» (${f.sessionId})`)),
      "    Remedio: npx tsx scripts/limpiar-analisis-de-venta-ajenos.ts (en seco) y después con --apply; si la reunión sigue siendo de venta, volver a analizarla desde su preventa (Exploración › la sesión › Análisis, o la pieza «Análisis»).",

    );
  },
};

/** ¿La base todavía no tiene las columnas de la revisión? (el SQL 2026-10-27-analisis-de-venta.sql). */
function faltaLaColumna(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  return code === "P2022" || code === "42703";
}

/**
 * INV62 · Todo análisis de venta CONFIRMADO es una confirmación entera y vigente (S4, 2026-10-27): tiene quién y cuándo,
 * terminó bien (PROPUESTO con resultado) y se confirmó DESPUÉS de analizarse. Volver a analizar borra la confirmación
 * (analizar-server.ts): una confirmación anterior al análisis diría «confirmado» sobre un análisis que nadie leyó, y la
 * tendencia de cada vendedor (S7) lo contaría. Nace bloqueante: el día que se escribió no había ninguna confirmación.
 * Remedio: quitar la confirmación desde la sesión (Exploración › la sesión › Análisis › «Quitar la confirmación») y volver
 * a confirmarla después de leerla.
 */
export const INV62: Invariante = {
  id: "62",
  nombre: "cada análisis de venta confirmado tiene quién, cuándo y resultado, y es posterior al análisis",
  async correr(db) {
    let filas: { sessionId: string; estado: string; resultado: unknown; analizadoAt: Date; confirmadoPor: string | null; confirmadoAt: Date | null; session: { title: string } }[];
    try {
      filas = await db.analisisDeVenta.findMany({
        where: { OR: [{ confirmadoPor: { not: null } }, { confirmadoAt: { not: null } }] },
        select: { sessionId: true, estado: true, resultado: true, analizadoAt: true, confirmadoPor: true, confirmadoAt: true, session: { select: { title: true } } },
      });
    } catch (e) {
      if (faltaLaTabla(e) || faltaLaColumna(e)) return cumple("✓ INV62: no aplica todavía — a esta base le falta scripts/sql/2026-10-27-analisis-de-venta.sql.");
      throw e;
    }
    const rotas = filas.filter(
      (f) =>
        !f.confirmadoPor ||
        !f.confirmadoAt ||
        f.estado !== "PROPUESTO" ||
        f.resultado === null ||
        f.resultado === undefined ||
        f.confirmadoAt.getTime() < f.analizadoAt.getTime(),
    );
    if (!rotas.length) return cumple(`✓ INV62: los ${filas.length} análisis de venta confirmados están enteros y son posteriores a su análisis.`);
    return viola(
      `✗ INV62 VIOLADO: ${rotas.length} análisis de venta dicen estar confirmados sin una confirmación entera o vigente.`,
      lista(rotas.map((f) => `«${f.session.title}» (${f.sessionId})`)),
      "    Remedio: en la preventa, abrir la sesión › Análisis › «Cómo trabajaste esta sesión», quitar la confirmación y volver a confirmarla después de leerla.",
    );
  },
};
