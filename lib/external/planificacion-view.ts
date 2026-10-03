/**
 * lib/external/planificacion-view.ts
 *
 * CHOKEPOINT de seguridad del PLANIFICACIÓN externo (2026-10-02). Único lugar donde un token de acceso se
 * resuelve al contenido de ese documento. Corre SIEMPRE server-side. Mismo molde que
 * `entrega-view.ts`, con los DOS checks a la vista en cada lectura:
 *   1. token → acceso ACTIVO no revocado y que sea el que nombra la dirección.
 *   2. `planificacionPublishedAt != null`: el token es POR PROYECTO y se comparte con las otras superficies;
 *      sin este flag el cliente vería un borrador. Despublicar corta en el render siguiente.
 *
 * Sirve el SNAPSHOT congelado al publicar (ver lib/external/snapshot-de-documento.ts).
 */
import { resolveActiveAccess } from "./access";
import { vistaDelSnapshot, type DocumentoPublicadoViewData } from "./snapshot-de-documento";

export type PlanificacionViewData = DocumentoPublicadoViewData;

export async function getPlanificacionForToken(credencial: string, accesoId: string): Promise<PlanificacionViewData | null> {
  const access = await resolveActiveAccess(credencial, accesoId);
  if (!access) return null;
  if (!access.project.planificacionPublishedAt) return null;
  return vistaDelSnapshot(access, "planning");
}
