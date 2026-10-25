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
 * Remedio: scripts/limpiar-analisis-de-venta-ajenos.ts --apply, y volver a analizar la reunión si sigue siendo de venta.
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
      "    Remedio: npx tsx scripts/limpiar-analisis-de-venta-ajenos.ts (en seco) y después con --apply; si la reunión sigue siendo de venta, volver a analizarla desde su página.",
    );
  },
};
