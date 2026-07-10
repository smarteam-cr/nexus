/**
 * POST /api/cs/account-brief/[clientId]
 *
 * Genera (o regenera) el RESUMEN EJECUTIVO CITADO de la cuenta — botón de la
 * vista /customer-success/[clientId]. On-demand a propósito (nada de regeneración
 * LLM masiva): el partner-sync solo marca staleAt y la líder decide regenerar.
 *
 * Concurrencia: mutex en-proceso por cliente (doble click = 409) + chequeo en DB
 * de un AgentRun RUNNING reciente (cubre la otra máquina de la DB compartida —
 * peor caso residual: costo duplicado de UNA llamada; el upsert es consistente).
 * Gateado con seeAllClients.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCapability } from "@/lib/auth/api-guards";
import { accessibleClientWhere } from "@/lib/auth/access";
import { prisma } from "@/lib/db/prisma";
import { runAccountBrief } from "@/lib/cs/account-brief";
import { humanizeAgentError } from "@/lib/agents/anthropic-error";

const inFlight = new Set<string>();

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const { clientId } = await params;
  const guard = await guardCapability("seeAllClients");
  if (guard instanceof NextResponse) return guard;

  // El cliente debe pasar el where del usuario (mismo criterio que la página).
  const where = await accessibleClientWhere(guard.user);
  const client = await prisma.client.findFirst({ where: { id: clientId, ...(where ?? {}) }, select: { id: true } });
  if (!client) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

  if (inFlight.has(clientId)) {
    return NextResponse.json({ error: "Ya hay una generación corriendo para esta cuenta." }, { status: 409 });
  }
  // Cross-machine: un run RUNNING reciente en la DB (la otra PC) también bloquea.
  const running = await prisma.agentRun.findFirst({
    where: {
      agentSlug: "cs-account-brief",
      clientId,
      status: "RUNNING",
      createdAt: { gt: new Date(Date.now() - 2 * 60 * 1000) },
    },
    select: { id: true },
  });
  if (running) {
    return NextResponse.json({ error: "Ya hay una generación corriendo para esta cuenta." }, { status: 409 });
  }
  inFlight.add(clientId);
  try {
    const result = await runAccountBrief(clientId);
    if (result.status === "skipped") {
      return NextResponse.json(
        { error: result.reason === "agent_not_seeded" ? "El agente de resumen no está creado (correr el seed)." : "No se pudo armar el contexto." },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, statements: result.statements?.length ?? 0, discarded: result.discarded ?? 0 });
  } catch (e) {
    console.error("[cs/account-brief] error:", e);
    return NextResponse.json({ error: humanizeAgentError(e) }, { status: 500 });
  } finally {
    inFlight.delete(clientId);
  }
}
