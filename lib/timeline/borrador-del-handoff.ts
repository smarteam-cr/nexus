/**
 * lib/timeline/borrador-del-handoff.ts — la propuesta de fases que deja el HANDOFF cuando el proyecto
 * ya tiene cronograma (E2b). SERVER-ONLY: lee y escribe la base.
 *
 * Antes vivía dentro de `persistTimelineFromAgentOutput` (app/api/clients/[id]/analyze/route.ts), una
 * función privada de una ruta de 3.400 líneas, sin pruebas de conducta. Acá se prueba llamándola, con
 * la base falsa (borrador-del-handoff.test.ts). La rama «el proyecto nunca tuvo cronograma» (crea las
 * fases directo, sin propuesta) sigue en analyze.
 *
 * Qué hace, en este orden:
 *   1. lee el cronograma (sin tareas). Sin fila → «sin-cronograma» y analyze crea las fases;
 *   2. empareja lo que propuso el agente con lo que hay (`reconcileAgentProposal`: nunca pisa una
 *      fase, conserva sus ids);
 *   3. arma el `borrador-v1` contra ESA MISMA lectura (`borradorDelHandoff`): el `desde` de cada
 *      cambio queda fijado en el servidor, así los choques son los mismos en cualquier computadora.
 *      Nada aplicable → «sin-cambios»: no escribe ni avisa;
 *   4. ⛔ una propuesta abierta con algo por decidir NO se pisa, sea de las reuniones o de un handoff
 *      anterior (respuesta 1 de Elías, 2026-09-24): se queda la abierta y se avisa a quien regeneró;
 *   5. escribe condicionado a lo que leyó (DbNull, o el mismo token y la misma versión). Si en el
 *      medio entró otra, no se pisa y se avisa.
 * Solo se reemplaza una abierta que ya no tiene nada por decidir: la pantalla la descartaría sola,
 * así que no se guarda en ningún lado (no hay nada que recuperar).
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getKickoffSessionDate } from "@/lib/sessions/project-sessions";
import { borradorDelHandoff, propuestaPorDecidir, versionDelBorrador, type Vivo } from "./borrador";
import {
  AVISO_OTRA_PROPUESTA_ENTRO,
  AVISO_PROPUESTA_DE_LAS_REUNIONES_PENDIENTE,
  AVISO_PROPUESTA_DEL_HANDOFF_PENDIENTE,
  origenDePropuesta,
} from "./proposal-deltas";
import { reconcileAgentProposal, type AgentProposedPhase } from "./reconcile-proposal";

export type ResultadoDelHandoff =
  | { tipo: "sin-cronograma" }
  | { tipo: "sin-cambios" }
  | { tipo: "aviso"; aviso: string }
  | { tipo: "propuesta" };

/**
 * Qué hace analyze con el resultado (puro). «sin-cronograma»: el proyecto nunca tuvo cronograma y
 * analyze crea las fases. Los demás no crean nada, y el CSE se entera por `timelineSyncError` solo con
 * un aviso (su handoff no guardó las sugerencias). Revisión de E2b: el reparto vivía en analyze sin
 * ninguna guarda; cambiarlo callaba el aviso, o mandaba «sin-cambios» a crear un cronograma que ya existe.
 */
export function timelineSyncErrorDelHandoff(
  r: ResultadoDelHandoff,
): { crear: true } | { crear: false; timelineSyncError: string | null } {
  switch (r.tipo) {
    case "sin-cronograma":
      return { crear: true };
    case "aviso":
      return { crear: false, timelineSyncError: r.aviso };
    case "sin-cambios":
    case "propuesta":
      return { crear: false, timelineSyncError: null };
  }
}

export async function guardarPropuestaDelHandoff(i: {
  projectId: string;
  corrida: string;
  fases: AgentProposedPhase[];
  nuevaClave?: () => string;
}): Promise<ResultadoDelHandoff> {
  const existing = await prisma.projectTimeline.findUnique({
    where: { projectId: i.projectId },
    select: {
      anchorStartDate: true,
      pendingProposal: true,
      pendingProposalRunId: true,
      phases: {
        orderBy: { order: "asc" },
        select: { id: true, name: true, durationWeeks: true, startWeek: true, sessionCount: true, notes: true, activityType: true },
      },
    },
  });
  if (!existing) return { tipo: "sin-cronograma" };

  // Si el arranque sigue vacío, la propuesta lleva el del kickoff (y solo entonces lo propone:
  // su `desde` es null). Si ya está, se conserva. Este fallback pega a la base: por eso vive acá y no
  // dentro de reconcileAgentProposal, que es pura.
  const existingAnchorISO = existing.anchorStartDate?.toISOString() ?? null;
  const resolvedAnchorISO = existingAnchorISO ?? (await getKickoffSessionDate(i.projectId))?.toISOString() ?? null;
  const reconciled = reconcileAgentProposal(i.fases, existing.phases, existingAnchorISO, resolvedAnchorISO);

  // Lo que se lee es lo que se compara: el `desde` sale de esta misma lectura, sin tareas.
  const vivo: Vivo = { ancla: existingAnchorISO, fases: existing.phases };
  // Regenerar el handoff para refrescar CONTEXTO no debe dejar ruido en el cronograma.
  const borrador = reconciled.isNoOp ? null : borradorDelHandoff({ propuesta: reconciled, vivo, nuevaClave: i.nuevaClave });
  if (!borrador) {
    console.log(
      `[analyze] el handoff no propone cambios de fases que se puedan aplicar — no se guarda (project ${i.projectId}, run ${i.corrida}).`,
    );
    return { tipo: "sin-cambios" };
  }

  if (existing.pendingProposal !== null && propuestaPorDecidir(existing.pendingProposal, vivo)) {
    const origenAbierta = origenDePropuesta(existing.pendingProposal as { origen?: unknown } | null);
    console.log(
      `[analyze] la propuesta del handoff NO se guardó: hay una propuesta (${origenAbierta}) sin decidir (project ${i.projectId}, run ${i.corrida}).`,
    );
    return {
      tipo: "aviso",
      aviso: origenAbierta === "contexto" ? AVISO_PROPUESTA_DE_LAS_REUNIONES_PENDIENTE : AVISO_PROPUESTA_DEL_HANDOFF_PENDIENTE,
    };
  }

  const version = existing.pendingProposal === null ? null : versionDelBorrador(existing.pendingProposal);
  const escrita = await prisma.projectTimeline.updateMany({
    where: {
      projectId: i.projectId,
      ...(existing.pendingProposal === null
        ? { pendingProposal: { equals: Prisma.DbNull } }
        : {
            pendingProposalRunId: existing.pendingProposalRunId,
            ...(version !== null ? { pendingProposal: { path: ["version"], equals: version } } : {}),
          }),
    },
    data: {
      pendingProposal: borrador as unknown as Prisma.InputJsonValue,
      pendingProposalRunId: i.corrida,
    },
  });
  if (escrita.count === 0) {
    console.log(
      `[analyze] la propuesta del handoff NO se guardó: otra propuesta entró mientras se generaba (project ${i.projectId}, run ${i.corrida}).`,
    );
    return { tipo: "aviso", aviso: AVISO_OTRA_PROPUESTA_ENTRO };
  }
  console.log(
    `[analyze] ✓ propuesta del handoff guardada (${borrador.cambios.length} cambios; ${i.fases.length} fases propuestas por el agente) para project ${i.projectId} (run ${i.corrida}).`,
  );
  return { tipo: "propuesta" };
}
