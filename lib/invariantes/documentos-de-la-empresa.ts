/**
 * lib/invariantes/documentos-de-la-empresa.ts — el enlace de un documento de la empresa (R3 etapas 2 y 3, 2026-10-27).
 */
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { cumple, viola, type Invariante } from "./contrato";

/**
 * INV64 · Cada enlace de un documento de la empresa abre un documento de ESA empresa, y solo uno de la empresa.
 *   El enlace (`AccesoAlDocumento`) guarda su empresa, y la vista (lib/external/documento-de-la-empresa-view.ts) la
 *   compara con la del documento en cada render. Esta invariante mira que ninguno quede cruzado en la base: un enlace de
 *   una empresa que apunta al documento de otra, o a un documento que pasó a ser de un proyecto o de una propuesta (los
 *   de proyecto se comparten por su propio acceso). Sería la invariante 1 —no mezclar clientes— rota en lo que ve el
 *   cliente.
 */
export const INV64: Invariante = {
  id: "64",
  nombre: "cada enlace de un documento de la empresa abre un documento de esa empresa",
  async correr(db) {
    let filas: Array<{ id: string; clientId: string; canvas: { clientId: string | null; projectId: string | null; businessCaseId: string | null } | null }>;
    try {
      // Solo los VIGENTES: uno revocado no abre nada (es el remedio de esta misma invariante).
      filas = await db.accesoAlDocumento.findMany({
        where: { revokedAt: null },
        select: { id: true, clientId: true, canvas: { select: { clientId: true, projectId: true, businessCaseId: true } } },
      });
    } catch (e) {
      if (esquemaDesactualizado(e)) return viola("✗ INV64 VIOLADO: falta aplicar scripts/sql/2026-10-27-kickoff-planificacion.sql (la tabla AccesoAlDocumento).");
      throw e;
    }
    const cruzados = filas.filter((f) => !f.canvas || f.canvas.clientId !== f.clientId || f.canvas.projectId !== null || f.canvas.businessCaseId !== null);
    if (!cruzados.length) return cumple(`✓ INV64: los ${filas.length} enlaces vigentes de documentos de la empresa abren un documento de su empresa.`);
    return viola(
      `✗ INV64 VIOLADO: ${cruzados.length} enlace(s) de documento de la empresa que no abren un documento de su empresa (${cruzados.slice(0, 5).map((f) => f.id).join(", ")}).` +
        `\n    Remedio: revocarlos (revokedAt) y revisar a mano de quién es cada documento; la vista ya no los abre (compara` +
        `\n    la empresa en cada render). Regla: lib/clients/documentos-de-la-empresa-compartir.ts.`,
    );
  },
};
