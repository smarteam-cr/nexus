/**
 * lib/timeline/leer-autoria.ts — quién dejó cada propuesta del cronograma y cuándo, leído en LOTE
 * (E2b P7). SERVER-ONLY: lee la base.
 *
 * Una consulta de corridas y una de nombres para todas las propuestas juntas (el mismo patrón que el
 * historial de corridas de un proyecto, app/api/projects/[projectId]/agent-runs/route.ts), y ninguna
 * si no hay propuesta con token. La ficha del cliente lo llama con todas sus filas de una vez.
 */
import { prisma } from "@/lib/db/prisma";
import { autoriaDeLaPropuesta, type AutoriaDeLaPropuesta } from "./autoria-de-la-propuesta";

/**
 * Para cada propuesta, en el mismo orden: su autoría, o null si no hay propuesta guardada.
 * `token` = `pendingProposalRunId` (la corrida que la dejó); `guardado` = `pendingProposal`.
 */
export async function leerAutoriaDeLasPropuestas(
  ps: ReadonlyArray<{ token: string | null; guardado: unknown }>,
): Promise<Array<AutoriaDeLaPropuesta | null>> {
  const tokens = [...new Set(ps.flatMap((p) => (p.guardado != null && p.token ? [p.token] : [])))];
  const corridas = tokens.length
    ? await prisma.agentRun.findMany({
        where: { id: { in: tokens } },
        select: { id: true, createdAt: true, triggeredByEmail: true },
      })
    : [];
  const emails = [...new Set(corridas.map((c) => c.triggeredByEmail).filter((e): e is string => !!e))];
  const miembros = emails.length
    ? await prisma.teamMember.findMany({
        where: { email: { in: emails } },
        select: { email: true, name: true },
      })
    : [];
  const corridaPorId = new Map(corridas.map((c) => [c.id, c]));
  const nombrePorEmail = new Map(miembros.map((m) => [m.email, m.name]));
  return ps.map((p) => {
    if (p.guardado == null) return null;
    const corrida = p.token ? (corridaPorId.get(p.token) ?? null) : null;
    const nombre = corrida?.triggeredByEmail ? (nombrePorEmail.get(corrida.triggeredByEmail) ?? null) : null;
    return autoriaDeLaPropuesta({ guardado: p.guardado, corrida, nombre });
  });
}
