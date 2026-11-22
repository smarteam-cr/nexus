/**
 * lib/impacto/impacto-server.ts — corre el agente de impacto (./impacto.ts) con su trazabilidad. SERVIDOR.
 *
 * Una llamada a Haiku por `lib/anthropic.ts`, medida (`conContextoDeIA`: el gasto de IA la atribuye al agente, al cliente
 * y a quien guardó la nota) y con su `AgentRun` (ARCHITECTURE §6 regla 5). Si el código decide antes que no hace falta
 * (`antesDeLlamar`), no llama ni deja corrida. Si la IA falla, responde «no cambia»: la nota ya está guardada y el
 * vendedor puede rehacer a mano; un aviso que no sale no rompe nada.
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { getAnthropic } from "@/lib/anthropic";
import { conContextoDeIA } from "@/lib/ai/contexto-de-corrida";
import { OMITIDO_POR_EL_TOPE } from "@/lib/ai/tope-de-nexus";
import { topeDeNexusHoy } from "@/lib/ai/tope-de-nexus-server";
import { prisma } from "@/lib/db/prisma";
import { antesDeLlamar, leerElImpacto, pedidoDelImpacto, SIN_IMPACTO, type EntregableParaElImpacto, type ImpactoDeLaNota, type NotaDelEquipo } from "./impacto";

export interface DondeCorre {
  /** El agente al que se le carga el gasto (el de su módulo). */
  agentSlug: string;
  /** Qué entregable, para filtrar las corridas: «escala». */
  entregable: string;
  clientId: string;
  projectId: string | null;
  email: string | null;
  /** Lo que identifica la corrida en `filters` (la exploración, la nota). */
  filtros: Record<string, string>;
}

export async function evaluarElImpacto(nota: NotaDelEquipo, entregable: EntregableParaElImpacto, d: DondeCorre): Promise<ImpactoDeLaNota & { omitido?: string }> {
  const omitido = antesDeLlamar(nota, entregable);
  if (omitido) return { ...SIN_IMPACTO, omitido };
  // Cuenta en el tope del mes de Nexus conversando (lib/ai/tope-de-nexus.ts): al llegar, no llama a la IA.
  if ((await topeDeNexusHoy()).estado === "agotado") return { ...SIN_IMPACTO, omitido: OMITIDO_POR_EL_TOPE };
  const run = await prisma.agentRun.create({
    data: {
      agentSlug: d.agentSlug,
      clientId: d.clientId,
      projectId: d.projectId,
      status: "RUNNING",
      stepLabel: `¿La nota cambia ${entregable.nombre}?`,
      triggeredByEmail: d.email,
      filters: { modo: "impacto-del-contexto", entregable: d.entregable, ...d.filtros } as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  const ia = { agentSlug: d.agentSlug, agentRunId: run.id, clientId: d.clientId, projectId: d.projectId, triggeredByEmail: d.email, origen: `impacto:${d.entregable}` };
  try {
    const respuesta = await conContextoDeIA(ia, () => getAnthropic().messages.create(pedidoDelImpacto(nota, entregable)));
    const impacto = leerElImpacto(respuesta, entregable);
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "DONE", output: JSON.stringify(impacto) } });
    return impacto;
  } catch (e) {
    console.error("[impacto] la IA no respondió", e);
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "ERROR", output: JSON.stringify({ error: e instanceof Error ? e.message : String(e) }) } }).catch(() => {});
    return { ...SIN_IMPACTO, omitido: "error" };
  }
}
