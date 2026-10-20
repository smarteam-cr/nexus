/**
 * lib/exploraciones/historia-de-las-sesiones-server.ts — los acuerdos y las decisiones de la minuta de cada reunión de la
 * exploración, para la historia de sus sesiones (./historia-de-las-sesiones.ts). SERVER-ONLY.
 *
 * Ahí suele estar lo que alguien pidió explorar en la sesión siguiente: en CEMACO, el 19 oct, «La sesión del día
 * siguiente se enfocará en analizar cada canal de marketing y sus volumetrías» (lo pidió Marco). El resumen de la lectura
 * lo nombra de pasada y la memoria del proyecto lo recorta.
 *
 * ⛔ Invariante 1: solo reuniones de ESTA empresa, por la regla única de pertenencia (`whereBelongsToClient`, el
 * chokepoint de lib/sessions/project-sources.ts). Una clave de otra empresa no devuelve nada.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { whereBelongsToClient } from "@/lib/sessions/project-sources";
import type { AcuerdosDeLaReunion } from "./historia-de-las-sesiones";

const textos = (x: unknown): string[] =>
  Array.isArray(x)
    ? x.flatMap((i) => {
        const t = typeof i === "string" ? i : i && typeof i === "object" && typeof (i as { text?: unknown }).text === "string" ? (i as { text: string }).text : "";
        return t.trim() ? [t.trim()] : [];
      })
    : [];

/** Por clave de lectura (`meet:<id>`): los acuerdos y las decisiones de su minuta. Las de HubSpot no tienen minuta. */
export async function acuerdosDeLasReuniones(
  clientId: string,
  claves: readonly string[],
  ahora: Date = new Date(),
): Promise<Record<string, AcuerdosDeLaReunion>> {
  const ids = [...new Set(claves.filter((k) => k.startsWith("meet:")).map((k) => k.slice("meet:".length)))].slice(0, 30);
  if (!ids.length) return {};
  // Son reuniones ya leídas, pero el techo va igual: esto le llega a un modelo (lib/sessions/ocurridas.test.ts).
  const filas = await prisma.firefliesSession.findMany({
    where: { ...whereBelongsToClient(clientId), id: { in: ids }, date: { lte: ahora } },
    select: { id: true, minute: { select: { agreements: true, decisions: true, status: true } } },
  });
  const out: Record<string, AcuerdosDeLaReunion> = {};
  for (const f of filas) {
    if (!f.minute) continue;
    const a = { acuerdos: textos(f.minute.agreements), decisiones: textos(f.minute.decisions), revisada: f.minute.status !== "DRAFT" };
    if (a.acuerdos.length || a.decisiones.length) out[`meet:${f.id}`] = a;
  }
  return out;
}
