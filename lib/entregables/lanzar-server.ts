/**
 * lib/entregables/lanzar-server.ts — LANZAR la generación de un entregable para una persona EXPLÍCITA, como el botón:
 * la corrida nace en RUNNING, el trabajo corre aparte y la corrida termina en DONE o ERROR con su motivo. SERVER-ONLY.
 *
 * Es lo que /analyze hace alrededor de `generarEntregable` (la corrida upfront, el medidor y el cierre), para quien no
 * pasa por esa ruta: el chat de Nexus (operación «documento.generar», lib/operaciones/documentos-server.ts). Lo que se
 * genera es EXACTAMENTE lo mismo; la corrida se ve en el centro de corridas y el documento la sigue por polling, igual
 * que con el botón.
 *
 * ⚠ La persona va explícita (regla de la capa de operaciones): el permiso se pregunta con su `TeamMember`, con la MISMA
 * celda del artifact-gate que pide /analyze (`generate` si el documento no tiene nada de la IA, `regenerate` si ya tiene).
 */
import "server-only";
import type { TeamMember } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { proyectoDelCliente } from "@/lib/projects/proyecto-del-cliente";
import { resolveArtifactGate, artifactGateMessage, type ArtifactGate } from "@/lib/auth/permissions/artifact-gate";
import { canCell } from "@/lib/auth/permissions/engine";
import { conContextoDeIA } from "@/lib/ai/contexto-de-corrida";
import { humanizeAgentError } from "@/lib/agents/anthropic-error";
import { ErrorDelEntregable, generarEntregable, porQueNoSePuedeGenerar, resolverPlantilla } from "./generar-server";
import { entregableDe } from "./registro";

/** La celda que pide generar este entregable en este proyecto, o el motivo por el que la persona no la tiene. */
export async function permisoParaGenerar(
  persona: Pick<TeamMember, "roleEnum" | "permissionOverrides">,
  o: { clientId: string; projectId: string; slug: string },
): Promise<{ ok: true; gate: ArtifactGate | null } | { ok: false; motivo: string }> {
  const e = entregableDe(o.slug);
  if (!e) return { ok: false, motivo: `«${o.slug}» no es un entregable del proyecto.` };
  const agent = await prisma.agent.findFirst({ where: { id: e.agentId, status: "ACTIVE" }, select: { id: true, agentGroup: true } });
  if (!agent) return { ok: false, motivo: "El agente de ese documento no está configurado en la base (falta su seed)." };
  const gate = await resolveArtifactGate(agent, o.clientId, o.projectId);
  if (gate && !(await canCell(persona, gate))) return { ok: false, motivo: artifactGateMessage(gate) };
  return { ok: true, gate };
}

/** ¿Ya se está generando este documento? (una corrida RUNNING de su agente en los últimos 15 minutos) */
export async function seEstaGenerando(projectId: string, slug: string): Promise<boolean> {
  const e = entregableDe(slug);
  if (!e) return false;
  const n = await prisma.agentRun.count({
    where: { projectId, agentId: e.agentId, status: "RUNNING", createdAt: { gte: new Date(Date.now() - 15 * 60_000) } },
  });
  return n > 0;
}

export interface Lanzado {
  runId: string;
}

export async function lanzarEntregable(o: {
  persona: TeamMember;
  clientId: string;
  projectId: string;
  slug: string;
  plantillaId?: string | null;
  instrucciones?: string | null;
  /** De dónde se pidió, para el medidor («nexus-chat/documento»). */
  origen: string;
}): Promise<Lanzado> {
  const e = entregableDe(o.slug);
  if (!e) throw new ErrorDelEntregable(400, `«${o.slug}» no es un entregable del proyecto.`);
  resolverPlantilla(o.slug, o.plantillaId); // tira con su motivo si no es de ese entregable
  const propio = await proyectoDelCliente(prisma, { projectId: o.projectId, clientId: o.clientId });
  if (!propio) throw new ErrorDelEntregable(404, "Ese proyecto no es de esta empresa.");
  const permiso = await permisoParaGenerar(o.persona, o);
  if (!permiso.ok) throw new ErrorDelEntregable(403, permiso.motivo);
  const motivo = await porQueNoSePuedeGenerar(o.projectId, o.slug);
  if (motivo) throw new ErrorDelEntregable(409, motivo);
  if (await seEstaGenerando(o.projectId, o.slug)) throw new ErrorDelEntregable(409, "Ese documento ya se está generando: espera a que termine.");

  const agent = await prisma.agent.findUniqueOrThrow({ where: { id: e.agentId }, select: { id: true, sectionLabel: true } });
  // Los mismos campos que /analyze le pone a la corrida del botón (stage 1, step 0, sin stepLabel).
  const pre = await prisma.agentRun.create({
    data: {
      agentId: agent.id,
      clientId: o.clientId,
      projectId: o.projectId,
      stage: 1,
      step: 0,
      stepLabel: null,
      sectionLabel: agent.sectionLabel ?? null,
      status: "RUNNING",
      output: "{}",
      triggeredByEmail: o.persona.email,
    },
    select: { id: true },
  });

  const ctxDeGasto = {
    agentSlug: agent.id,
    agentRunId: pre.id,
    clientId: o.clientId,
    projectId: o.projectId,
    triggeredByEmail: o.persona.email,
    origen: o.origen,
  };
  const setPhase = (phase: string) => {
    prisma.agentRun.update({ where: { id: pre.id }, data: { currentPhase: phase } }).catch(() => {});
  };

  // Aparte, como el botón (async): la corrida la siguen el documento y el centro de corridas.
  void (async () => {
    try {
      const r = await conContextoDeIA(ctxDeGasto, () =>
        generarEntregable({
          projectId: o.projectId,
          slug: o.slug,
          plantillaId: o.plantillaId ?? null,
          instrucciones: o.instrucciones ?? null,
          agentRunId: pre.id,
          porEmail: o.persona.email,
          alFase: setPhase,
        }),
      );
      await prisma.agentRun
        .update({
          where: { id: pre.id },
          data: {
            status: "DONE",
            // El kickoff ya dejó su salida entera en la corrida: no se pisa (como en /analyze).
            ...(r.salidaEnLaCorrida === undefined ? { output: JSON.stringify({ sectionCount: r.sectionCount }) } : {}),
          },
        })
        .catch(() => {});
    } catch (err) {
      await prisma.agentRun
        .update({ where: { id: pre.id }, data: { status: "ERROR", output: JSON.stringify({ error: humanizeAgentError(err) }) } })
        .catch(() => {});
    }
  })();

  return { runId: pre.id };
}
