/**
 * POST /api/roles/[id]/assist — el ASSIST de documento de un perfil de puesto.
 *
 * { instruction } → runDocumentAssist con el contrato de las 11 secciones + hero
 * (rolesAssistContract) y el systemPrompt del agente "agent-roles-assist" (DB,
 * calibrable en /agents). Devuelve la PROPUESTA — NO escribe: el apply lo hace
 * RoleWorkspace por el autosave de siempre (PATCH /api/roles/[id]), tras revisar
 * en <AgentProposal>. La IA puede investigar en línea (web_search, a su criterio).
 *
 * Trazabilidad (§6.5): persiste un AgentRun DONE/ERROR con la propuesta como
 * output. Sin clientId/projectId (un puesto no pertenece a un cliente) → en el
 * centro de corridas solo lo ve SUPER_ADMIN, que es exactamente quién usa Roles.
 *
 * SÍNCRONO a propósito (precedente timeline/assist): una llamada, sin worker.
 * Si la latencia de la investigación duele, el escape es mover ESTE endpoint a
 * AgentRun async + useAgentRun — el núcleo no cambia.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardRolesAdmin } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { getRole } from "@/lib/roles/queries";
import { runDocumentAssist } from "@/lib/ai/assist";
import { rolesAssistContract } from "@/components/landing/configs/roles.defs";

const AGENT_ID = "agent-roles-assist";

const bodySchema = z.object({ instruction: z.string().trim().min(4).max(2000) });

type Params = Promise<{ id: string }>;

export async function POST(req: NextRequest, { params }: { params: Params }) {
  const guard = await guardRolesAdmin();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Escribe una instrucción (4 a 2000 caracteres)." }, { status: 400 });
  }

  const role = await getRole(id);
  if (!role) return NextResponse.json({ error: "Rol no encontrado" }, { status: 404 });

  const agent = await prisma.agent.findUnique({
    where: { id: AGENT_ID },
    select: { systemPrompt: true, additionalInstructions: true },
  });
  if (!agent) {
    return NextResponse.json(
      { error: "Falta el agente del assist — corre npx tsx scripts/seed-roles-assist-agent.ts" },
      { status: 503 },
    );
  }
  const systemPrompt = agent.additionalInstructions
    ? `${agent.systemPrompt}\n\n${agent.additionalInstructions}`
    : agent.systemPrompt;

  // AgentRun RUNNING upfront (patrón analyze): si el LLM falla, el rastro queda.
  const run = await prisma.agentRun.create({
    data: { agentId: AGENT_ID, status: "RUNNING", stepLabel: role.title },
    select: { id: true },
  });

  try {
    const result = await runDocumentAssist({
      docLabel: "perfil de puesto",
      systemPrompt,
      sections: rolesAssistContract({
        title: role.title,
        area: role.area,
        summary: role.summary,
        content: (role.content ?? {}) as Record<string, unknown>,
      }),
      instruction: parsed.data.instruction,
      maxWebSearches: 5,
    });
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "DONE", output: JSON.stringify(result) },
    });
    return NextResponse.json({ ...result, runId: run.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "el assist falló — prueba de nuevo";
    await prisma.agentRun
      .update({ where: { id: run.id }, data: { status: "ERROR", output: JSON.stringify({ error: message }) } })
      .catch(() => {});
    console.error("[roles/assist] error:", e);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
