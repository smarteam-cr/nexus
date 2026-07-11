/**
 * POST /api/cobranza/reporte — genera el REPORTE DE FINANZAS de la cartera
 * agregada (fase 3, 2 voces). Sync sin polling (una llamada corta).
 *
 * Gate por voz SERVER-SIDE SIEMPRE: la voz "ejecutiva" es solo SUPER_ADMIN
 * (dirección); "operativa" la puede pedir cualquier rol con acceso a Cobranza.
 *
 * Concurrencia (patrón del borrador de cobro): mutex en-proceso POR VOZ (doble
 * click = 409) + chequeo en DB de un AgentRun RUNNING reciente por agentSlug
 * (cubre la otra PC de la DB compartida). Acceso: guardCobranzaAccess.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { reporteFinanzasSchema } from "@/lib/cobranza/schema";
import {
  runReporteFinanzas,
  REPORTE_AGENT_SLUG,
  ReporteAgentNotSeededError,
} from "@/lib/cobranza/agents/reporte-finanzas";
import { humanizeAgentError } from "@/lib/agents/anthropic-error";
import { crDateParts } from "@/lib/jobs/time";

const inFlight = new Set<string>(); // key = voz

export async function POST(req: NextRequest) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = reporteFinanzasSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input inválido" },
      { status: 400 },
    );
  }
  const { voz } = parsed.data;

  // Gate ejecutivo server-side SIEMPRE (la UI puede ocultar el botón, pero el
  // servidor es quien decide): solo dirección ve la voz ejecutiva.
  if (voz === "ejecutiva" && guard.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "La voz ejecutiva del reporte es solo para dirección (Super Admin)." },
      { status: 403 },
    );
  }

  if (inFlight.has(voz)) {
    return NextResponse.json({ error: "Ya hay un reporte generándose en esa voz." }, { status: 409 });
  }
  // Cross-machine: un run RUNNING reciente del reporter (la otra PC) también bloquea.
  const running = await prisma.agentRun.findFirst({
    where: {
      agentSlug: REPORTE_AGENT_SLUG,
      status: "RUNNING",
      createdAt: { gt: new Date(Date.now() - 2 * 60 * 1000) },
    },
    select: { id: true },
  });
  if (running) {
    return NextResponse.json({ error: "Ya hay un reporte de finanzas generándose." }, { status: 409 });
  }

  inFlight.add(voz);
  try {
    const todayISO = crDateParts(new Date()).dateKey;
    const result = await runReporteFinanzas(voz, guard.user.email, todayISO);
    return NextResponse.json({ titulo: result.titulo, cuerpo: result.cuerpo, runId: result.runId });
  } catch (e) {
    if (e instanceof ReporteAgentNotSeededError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    console.error("[cobranza/reporte] error:", e);
    return NextResponse.json({ error: humanizeAgentError(e) }, { status: 500 });
  } finally {
    inFlight.delete(voz);
  }
}
