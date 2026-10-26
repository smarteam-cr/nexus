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
 * Sirve el SNAPSHOT congelado al publicar (ver lib/external/snapshot-de-documento.ts). Desde el 2026-10-27 (L4 etapa 6)
 * las secciones que el CSE le ABRIÓ al cliente (sus usuarios, sus canales, sus personas) se leen EN VIVO, con la marca
 * que le deja escribir: lib/planificacion/lo-del-cliente.ts. Las demás, la foto.
 */
import { prisma } from "@/lib/db/prisma";
import { canvasOf } from "@/lib/pieces/canvas-query";
import { hiddenKeysFrom } from "@/lib/business-cases/section-briefs";
import { PLANIFICACION_DEF_BY_KEY } from "@/components/landing/configs/planificacion.defs";
import { conLasSeccionesDelCliente, SECCIONES_DEL_CLIENTE } from "@/lib/planificacion/lo-del-cliente";
import type { LandingSectionRow } from "@/components/landing/build-landing";
import { resolveActiveAccess } from "./access";
import { vistaDelSnapshot, type DocumentoPublicadoViewData } from "./snapshot-de-documento";

export type PlanificacionViewData = DocumentoPublicadoViewData;

export async function getPlanificacionForToken(credencial: string, accesoId: string): Promise<PlanificacionViewData | null> {
  const access = await resolveActiveAccess(credencial, accesoId);
  if (!access) return null;
  if (!access.project.planificacionPublishedAt) return null;
  const vista = await vistaDelSnapshot(access, "planning");
  if (!vista) return null;
  return { ...vista, rows: (await seccionesDelClienteEnVivo(access.project.id, vista.rows)) as LandingSectionRow[] };
}

/** Las secciones abiertas al cliente, del documento vivo de ESTE proyecto (lo oculto, afuera). */
async function seccionesDelClienteEnVivo(projectId: string, rows: LandingSectionRow[]) {
  const canvas = await prisma.projectCanvas.findFirst({
    where: { projectId, ...canvasOf("planning") },
    select: {
      sections: true,
      canvasSections: {
        where: { key: { in: SECCIONES_DEL_CLIENTE } },
        orderBy: { order: "asc" },
        select: {
          key: true,
          titleOverride: true,
          eyebrowOverride: true,
          // La MISMA tarjeta que escribe la acción del cliente: la primera confirmada, por orden.
          blocks: { where: { blockType: "CARD", status: "CONFIRMED" }, orderBy: { order: "asc" }, select: { data: true }, take: 1 },
        },
      },
    },
  });
  if (!canvas) return rows;
  const ocultas = hiddenKeysFrom(canvas.sections);
  // El encabezado se resuelve como al publicar (lib/projects/publicar-documento.ts): el del CSE, o el de la definición.
  const vivas = canvas.canvasSections
    .filter((s) => !ocultas.has(s.key) && s.blocks[0])
    .map((s) => {
      const def = PLANIFICACION_DEF_BY_KEY[s.key];
      return {
        key: s.key,
        titleOverride: (s.titleOverride ?? "").trim() || def?.label || null,
        eyebrowOverride: s.eyebrowOverride ?? def?.eyebrow ?? null,
        data: s.blocks[0].data,
      };
    });
  return conLasSeccionesDelCliente(rows, vivas);
}
