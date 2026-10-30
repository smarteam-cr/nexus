/**
 * lib/planificacion/plantilla-sugerida-server.ts — junta los hechos del proyecto para la plantilla sugerida de la
 * Planificación (2026-10-29, pregunta 44). SERVIDOR, solo lectura. La regla vive en ./plantilla-sugerida.ts (pura).
 *
 * Los hechos: las etiquetas del proyecto (lo vendido), los asientos comprados y el tamaño de la cuenta en HubSpot Partner
 * (la misma copia que lee la cuenta de licencias), la modalidad de adopción (la confirmada o la sugerida por tamaño, como
 * el runner) y si ya se trajo el Brief de la hoja. Si algo falla, null: el selector queda como antes, sin sugerencia.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { suggestAdoptionMode } from "@/lib/lifecycle/stage-engine";
import { estadoDelBriefEnLaPlanificacion } from "./brief-importado-server";
import { plantillaSugeridaDeLaPlanificacion, totalDeAsientos, type PlantillaSugerida } from "./plantilla-sugerida";

export async function plantillaSugeridaDelProyecto(projectId: string): Promise<PlantillaSugerida | null> {
  try {
    const p = await prisma.project.findUnique({ where: { id: projectId }, select: { tags: true, adoptionMode: true, clientId: true } });
    if (!p) return null;
    const [snap, brief] = await Promise.all([
      p.clientId
        ? prisma.clientPartnerSnapshot.findFirst({
            where: { clientId: p.clientId },
            orderBy: { fetchedAt: "desc" },
            select: { seats: true, marketingContactsLimit: true },
          })
        : Promise.resolve(null),
      estadoDelBriefEnLaPlanificacion(projectId),
    ]);
    const asientos = totalDeAsientos(snap?.seats);
    const adopcion =
      p.adoptionMode === "por_pilotos" || p.adoptionMode === "directa"
        ? p.adoptionMode
        : suggestAdoptionMode({ seatsTotal: asientos, marketingContactsLimit: snap?.marketingContactsLimit ?? null });
    return plantillaSugeridaDeLaPlanificacion({ etiquetas: p.tags ?? [], asientos, adopcion, tieneBrief: brief.yaTieneBrief });
  } catch (e) {
    console.warn("[plantilla-sugerida] no se pudo sugerir (no bloqueante):", e instanceof Error ? e.message : e);
    return null;
  }
}
