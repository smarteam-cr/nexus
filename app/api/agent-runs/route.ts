import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/supabase";
import { accessibleClientWhere } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions/engine";
import { parseRunError } from "@/lib/agents/run-error";

/**
 * GET /api/agent-runs — el feed del CENTRO DE CORRIDAS (RunsIndicator).
 *
 * AgentRun se persiste SIEMPRE (cada corrida, con currentPhase y error humanizado)
 * pero era invisible: si cerrabas la pestaña, el resultado se perdía de vista.
 * Este endpoint lo hace visible: corridas en curso + las últimas terminadas,
 * SCOPEADAS por el mismo modelo de acceso de la lista de clientes
 * (accessibleClientWhere — server-side, no cosmético). Runs sin cliente
 * (reportes de cartera de Cobranza) solo para quien lee cobranza.
 */
export async function GET(req: NextRequest) {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tm = user.teamMember;
  if (user.kind === "EXTERNAL" || !tm || tm.deactivatedAt) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const take = Math.min(Math.max(Number(req.nextUrl.searchParams.get("take")) || 10, 1), 25);

  const clientWhere = await accessibleClientWhere(user);
  const canCobranza = tm.roleEnum === "SUPER_ADMIN" || (await can(tm, "cobranza", "read"));

  // Runs de clientes visibles (el filtro de relación excluye clientId null) ∪
  // runs globales (clientId null) si puede ver cobranza.
  const scope: Prisma.AgentRunWhereInput = {
    OR: [
      { client: clientWhere ?? { isProspect: false } },
      ...(canCobranza ? [{ clientId: null }] : []),
    ],
  };

  const select = {
    id: true,
    status: true,
    currentPhase: true,
    createdAt: true,
    updatedAt: true,
    clientId: true,
    stepLabel: true,
    output: true,
    agent: { select: { name: true } },
    client: { select: { name: true } },
  } satisfies Prisma.AgentRunSelect;

  const [running, recent] = await Promise.all([
    prisma.agentRun.findMany({
      where: { AND: [scope, { status: { in: ["PENDING", "RUNNING"] } }] },
      orderBy: { createdAt: "desc" },
      take: 10,
      select,
    }),
    prisma.agentRun.findMany({
      where: { AND: [scope, { status: { in: ["DONE", "ERROR"] } }] },
      orderBy: { updatedAt: "desc" },
      take,
      select,
    }),
  ]);

  const serialize = (r: (typeof running)[number]) => ({
    id: r.id,
    status: r.status,
    currentPhase: r.currentPhase,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    clientId: r.clientId,
    clientName: r.client?.name ?? null,
    agentName: r.agent?.name ?? r.stepLabel ?? "Agente",
    error: r.status === "ERROR" ? parseRunError(r.output) : null,
  });

  return NextResponse.json({
    running: running.map(serialize),
    recent: recent.map(serialize),
  });
}
