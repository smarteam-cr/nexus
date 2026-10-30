/**
 * lib/invariantes/documentos-de-la-empresa.ts — el enlace de un documento de la empresa (R3 etapas 2 y 3, 2026-10-27).
 */
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { cumple, viola, type Invariante } from "./contrato";

/**
 * INV64 · Cada enlace vigente de un documento abre un documento de SU empresa (enmendado el 2026-10-29, etapa V4 de
 *   docs/artefactos-plan.md). El enlace (`AccesoAlDocumento`) guarda su empresa, y las dos vistas del enlace
 *   (lib/external/documento-de-la-empresa-view.ts y lib/external/artefacto-view.ts) la comparan en cada render. Esta
 *   invariante mira que ninguno quede cruzado en la base: el documento es de esa empresa (sin proyecto) o de un PROYECTO
 *   de esa empresa (desde la V4 cada copia de un proyecto se comparte con su propio enlace), y nunca de una propuesta.
 *   Sería la invariante 1 —no mezclar clientes— rota en lo que ve el cliente.
 */
export const INV64: Invariante = {
  id: "64",
  nombre: "cada enlace de un documento abre un documento de su empresa",
  async correr(db) {
    let filas: Array<{
      id: string;
      clientId: string;
      canvas: { clientId: string | null; projectId: string | null; businessCaseId: string | null; project: { clientId: string } | null } | null;
    }>;
    try {
      // Solo los VIGENTES: uno revocado no abre nada (es el remedio de esta misma invariante).
      filas = await db.accesoAlDocumento.findMany({
        where: { revokedAt: null },
        select: {
          id: true,
          clientId: true,
          canvas: { select: { clientId: true, projectId: true, businessCaseId: true, project: { select: { clientId: true } } } },
        },
      });
    } catch (e) {
      if (esquemaDesactualizado(e)) return viola("✗ INV64 VIOLADO: falta aplicar scripts/sql/2026-10-27-kickoff-planificacion.sql (la tabla AccesoAlDocumento).");
      throw e;
    }
    const cruzados = filas.filter((f) => !abreUnDocumentoDeSuEmpresa(f));
    if (!cruzados.length) return cumple(`✓ INV64: los ${filas.length} enlaces vigentes de documentos abren un documento de su empresa.`);
    return viola(
      `✗ INV64 VIOLADO: ${cruzados.length} enlace(s) de documento que no abren un documento de su empresa (${cruzados.slice(0, 5).map((f) => f.id).join(", ")}).` +
        `
    Remedio: revocarlos (revokedAt) y revisar a mano de quién es cada documento; las vistas ya no los abren (comparan` +
        `
    la empresa en cada render). Reglas: lib/clients/documentos-de-la-empresa-compartir.ts y lib/artefactos/compartir-server.ts.`,
    );
  },
};

/** El documento del enlace es de la empresa del enlace: suyo y sin proyecto, o de un proyecto suyo. Nunca de una propuesta. */
function abreUnDocumentoDeSuEmpresa(f: {
  clientId: string;
  canvas: { clientId: string | null; projectId: string | null; businessCaseId: string | null; project: { clientId: string } | null } | null;
}): boolean {
  const c = f.canvas;
  if (!c || c.businessCaseId !== null) return false;
  if (c.projectId === null) return c.clientId === f.clientId;
  return c.clientId === null && c.project?.clientId === f.clientId;
}
