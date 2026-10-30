/**
 * lib/invariantes/artefactos.ts — las copias de un tipo de artefacto (etapa V3 de docs/artefactos-plan.md, 2026-10-29).
 */
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { pieceByName } from "@/lib/pieces/registry";
import { admiteCopias } from "@/lib/artefactos/tipos";
import { cumple, viola, type Invariante } from "./contrato";

/**
 * INV65 · Cada copia de un artefacto es una copia sana. Una COPIA es la fila con `tipoArtefacto`; el documento de siempre
 * de cada tipo conserva su `slug` y lo buscan 105 lugares. Cuatro cosas que, rotas, hacen que una copia se lea como si fuera
 * el documento de siempre (y los botones de la pieza escriban sobre el que no es) o que quede colgando de nada:
 *   1. tiene `slug` (la base lo impide con el CHECK ProjectCanvas_copia_sin_slug, que es NOT VALID: esto mira lo de antes);
 *   2. su tipo no existe o no admite copias (lib/artefactos/tipos.ts);
 *   3. no es de un proyecto (las copias de la empresa todavía no existen);
 *   4. se llama como una pieza («Kickoff», «Planificación»…): la lectura doble por nombre de lib/pieces/canvas-query.ts
 *      la confundiría con el documento de siempre (lib/artefactos/copias.ts › nombreGuardableDeUnaCopia lo evita al guardar).
 */
export const INV65: Invariante = {
  id: "65",
  nombre: "cada copia de un artefacto es una copia sana",
  async correr(db) {
    let filas: Array<{ id: string; slug: string | null; tipoArtefacto: string | null; projectId: string | null; name: string }>;
    try {
      filas = await db.projectCanvas.findMany({
        where: { tipoArtefacto: { not: null } },
        select: { id: true, slug: true, tipoArtefacto: true, projectId: true, name: true },
      });
    } catch (e) {
      if (esquemaDesactualizado(e)) return viola("✗ INV65 VIOLADO: falta aplicar scripts/sql/2026-10-29-artefactos-copias.sql (la columna tipoArtefacto).");
      throw e;
    }
    const malas = filas
      .map((f) => ({ id: f.id, motivo: motivoDeLaCopia(f) }))
      .filter((f): f is { id: string; motivo: string } => f.motivo !== null);
    if (!malas.length) return cumple(`✓ INV65: las ${filas.length} copias de artefactos son copias sanas.`);
    return viola(
      `✗ INV65 VIOLADO: ${malas.length} copia(s) de artefactos mal formadas (${malas.slice(0, 5).map((m) => `${m.id}: ${m.motivo}`).join("; ")}).` +
        `\n    Remedio: revisar cada fila a mano (una copia no tiene slug, es de un proyecto, su tipo admite copias y no se llama` +
        `\n    como una pieza). Regla: lib/artefactos/copias.ts.`,
    );
  },
};

/** Por qué una copia no es sana, o null. */
export function motivoDeLaCopia(f: { slug: string | null; tipoArtefacto: string | null; projectId: string | null; name: string }): string | null {
  if (f.slug) return "tiene slug";
  if (!admiteCopias(f.tipoArtefacto)) return `el tipo «${f.tipoArtefacto}» no admite copias`;
  if (!f.projectId) return "no es de un proyecto";
  if (pieceByName(f.name.trim())) return `se llama como una pieza («${f.name}»)`;
  return null;
}
