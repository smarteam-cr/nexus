/**
 * lib/tareas/toques.ts — la última vez que una PERSONA hizo algo con cada tarea. SERVIDOR.
 *
 * Lo usa `sugerenciaDeCierre` (lib/tareas/aligerar.ts): «nadie la tocó» quiere decir que no hay un evento de una
 * persona desde su fecha. `updatedAt` no sirve: lo mueven el job del lunes, la copia de HubSpot y el seguimiento
 * agrupado. Lo que hacen Nexus («agente»), el sistema o HubSpot no cuenta como un toque.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { SISTEMA } from "./estados";

/** Quién no cuenta como persona al mirar si alguien tocó una tarea. */
export const NO_SON_PERSONAS = [SISTEMA, "agente", "hubspot"];

/** Por id de tarea, el último evento de una persona. Las que no tienen ninguno no están en el mapa. */
export async function ultimosToquesDePersonas(ids: readonly string[]): Promise<Map<string, Date>> {
  const mapa = new Map<string, Date>();
  if (!ids.length) return mapa;
  const filas = await prisma.tareaEvento.groupBy({
    by: ["tareaId"],
    where: { tareaId: { in: [...ids] }, porEmail: { notIn: NO_SON_PERSONAS } },
    _max: { createdAt: true },
  });
  for (const f of filas) if (f.tareaId && f._max.createdAt) mapa.set(f.tareaId, f._max.createdAt);
  return mapa;
}
