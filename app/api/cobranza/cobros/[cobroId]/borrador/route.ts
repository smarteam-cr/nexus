/**
 * POST /api/cobranza/cobros/[cobroId]/borrador — genera el BORRADOR de correo de
 * cobro (feature 1, CommunicationPort v1 "bitacora"). Sync sin polling (una
 * llamada corta). SIN envío automático: la persona edita y copia/abre en correo.
 *
 * Concurrencia (patrón account-brief): mutex en-proceso por cobro (doble click
 * = 409) + chequeo en DB de un AgentRun RUNNING reciente (cubre la otra PC de
 * la DB compartida). Acceso: guardCobranzaAccess (ADMIN + SUPER_ADMIN).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { runBorradorCobro, BORRADOR_AGENT_SLUG } from "@/lib/cobranza/agents/borrador-cobro";
import { humanizeAgentError } from "@/lib/agents/anthropic-error";
import { crDateParts } from "@/lib/jobs/time";

const inFlight = new Set<string>();

const SKIP_MSG: Record<string, string> = {
  agent_not_seeded: "El agente de borradores no está creado (correr el seed create-cobranza-borrador-agent).",
  cobro_no_existe: "El cobro no existe.",
  cobro_ya_cobrado: "Este cobro ya está COBRADO — no hay nada que cobrar.",
};

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ cobroId: string }> },
) {
  const { cobroId } = await params;
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;

  if (inFlight.has(cobroId)) {
    return NextResponse.json({ error: "Ya hay un borrador generándose para este cobro." }, { status: 409 });
  }
  // Cross-machine: un run RUNNING reciente (la otra PC) también bloquea.
  const cobro = await prisma.cobro.findUnique({
    where: { id: cobroId },
    select: { cuenta: { select: { clientId: true } } },
  });
  if (!cobro) return NextResponse.json({ error: "El cobro no existe." }, { status: 404 });
  const running = await prisma.agentRun.findFirst({
    where: {
      agentSlug: BORRADOR_AGENT_SLUG,
      clientId: cobro.cuenta.clientId,
      status: "RUNNING",
      createdAt: { gt: new Date(Date.now() - 2 * 60 * 1000) },
    },
    select: { id: true },
  });
  if (running) {
    return NextResponse.json({ error: "Ya hay un borrador generándose para este cliente." }, { status: 409 });
  }

  inFlight.add(cobroId);
  try {
    const todayISO = crDateParts(new Date()).dateKey;
    const result = await runBorradorCobro(cobroId, guard.user.email, todayISO);
    if (result.status === "skipped") {
      return NextResponse.json({ error: SKIP_MSG[result.reason] ?? "No se pudo generar." }, { status: 409 });
    }
    return NextResponse.json({
      borrador: result.borrador,
      mailtoUrl: result.mailtoUrl,
      correoCobro: result.correoCobro,
      runId: result.runId,
    });
  } catch (e) {
    console.error("[cobranza/borrador] error:", e);
    return NextResponse.json({ error: humanizeAgentError(e) }, { status: 500 });
  } finally {
    inFlight.delete(cobroId);
  }
}
