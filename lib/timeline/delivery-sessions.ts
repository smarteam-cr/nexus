/**
 * lib/timeline/delivery-sessions.ts
 *
 * Cuenta, por fase del cronograma, las SESIONES DE ENTREGA DE SERVICIO realmente
 * ejecutadas: una sesión cuenta si su fecha cae en la ventana de la fase Y tiene
 * ≥1 participante del equipo de entrega (CSE ∪ Desarrollo) Y ≥1 participante del
 * cliente (externo, no interno). Es el "real ejecutado" que reemplaza al estimado
 * del agente en las fases ya iniciadas.
 *
 * Fuente de sesiones: el chokepoint `getProjectHandoffSessions` (sesiones ligadas
 * al proyecto vía SessionProject, ya filtradas por ownership del cliente) — NO se
 * re-implementa el matching sesión→cliente (invariante medular).
 *
 * Se CALCULA en lectura (GET /timeline); no se persiste. Requiere anchorStartDate.
 */
import { prisma } from "@/lib/db/prisma";
import { getProjectHandoffSessions } from "@/lib/sessions/project-sources";
import { classifyTeamEmailsByArea } from "@/lib/sessions/areas";
import { addWeeks, computePhaseRanges, currentWeekIndex } from "@/lib/timeline/weeks";

interface PhaseLite {
  id: string;
  durationWeeks: number;
  startWeek?: number | null; // inicio explícito (paralelo); null = contigua
}

/**
 * Devuelve un Map<phaseId, number | null>:
 *  - número = sesiones de entrega ejecutadas en la ventana de la fase (fase iniciada).
 *  - null   = fase aún no iniciada (futura) → la UI usa el estimado.
 * Devuelve null entero si no hay anchorStartDate (sin ventana de fechas posible).
 */
export async function countDeliverySessionsByPhase(args: {
  projectId: string;
  anchorStartDate: Date | null;
  phases: PhaseLite[];
}): Promise<Map<string, number | null> | null> {
  const { projectId, anchorStartDate, phases } = args;
  if (!anchorStartDate || phases.length === 0) return null;

  const anchorIso = anchorStartDate.toISOString();
  const curWeek = currentWeekIndex(anchorIso);
  if (curWeek === null) return null;

  const ranges = computePhaseRanges(phases);

  const [{ sessions }, team] = await Promise.all([
    getProjectHandoffSessions(projectId),
    prisma.teamMember.findMany({ select: { email: true, area: true, roleEnum: true } }),
  ]);
  const { deliveryEmails, internalEmails } = classifyTeamEmailsByArea(team);

  // Pre-clasificar cada sesión: ¿es de entrega (CSE/dev + cliente)? + su fecha (epoch).
  const deliverySessions = sessions
    .filter((s) => {
      const emails = s.participants.map((p) => p.toLowerCase());
      const hasDelivery = emails.some((e) => deliveryEmails.has(e));
      const hasClient = emails.some((e) => !internalEmails.has(e));
      return hasDelivery && hasClient;
    })
    .map((s) => s.date); // epoch ms

  const result = new Map<string, number | null>();
  phases.forEach((p, i) => {
    const range = ranges[i];
    if (range.start > curWeek) {
      result.set(p.id, null); // fase futura: sin real, la UI usa el estimado
      return;
    }
    const startMs = addWeeks(anchorIso, range.start).getTime();
    const endMs = addWeeks(anchorIso, range.end).getTime();
    const count = deliverySessions.filter((d) => d >= startMs && d < endMs).length;
    result.set(p.id, count);
  });
  return result;
}
