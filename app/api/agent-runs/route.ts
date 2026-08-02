import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/supabase";
import { accessibleClientWhere } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions/engine";
import { parseRunError } from "@/lib/agents/run-error";
import { MOTIVO_COLGADA, cortePorLatido, estaColgada } from "@/lib/agents/run-colgada";
import { resolveRunResultUrl } from "@/lib/agents/run-url";
import { CS_CLIENT_WHERE } from "@/lib/clients/kind";

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
  const email = user.email?.toLowerCase() ?? null;

  const clientWhere = await accessibleClientWhere(user);
  const canCobranza = tm.roleEnum === "SUPER_ADMIN" || (await can(tm, "cobranza", "read"));

  // Runs de clientes visibles (el filtro de relación excluye clientId null) ∪
  // runs globales (clientId null) si puede ver cobranza.
  const scope: Prisma.AgentRunWhereInput = {
    OR: [
      { client: clientWhere ?? { ...CS_CLIENT_WHERE } },
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
    projectId: true,
    businessCaseId: true,
    stepLabel: true,
    output: true,
    triggeredByEmail: true,
    agent: { select: { name: true } },
    client: { select: { name: true } },
    // Un solo bloque alcanza para saber EN QUÉ CANVAS aterrizó lo generado — es lo
    // que convierte el aviso de "listo" en un enlace al resultado y no a la home
    // del cliente. Las corridas que no escriben bloques (cronograma, análisis) caen
    // solas al deep-link de proyecto.
    blocks: { take: 1, select: { section: { select: { canvasId: true } } } },
  } satisfies Prisma.AgentRunSelect;

  /* ── UNA CORRIDA `RUNNING` NO ALCANZA PARA CREERLE ──────────────────────────
     Si el proceso muere en el medio, nadie escribe el estado final y la fila queda `RUNNING`
     para siempre: el 2026-08-02 había una del detalle de cronograma con 23 días así. El estado
     en la base es lo que la corrida ALCANZÓ A DECIR de sí misma, no lo que le pasó.

     Se resuelve en la LECTURA y no con otro barredor: los dos que existen están acotados a su
     familia (CS solo mira `cs-account-brief`, Marketing solo lo suyo) y el resto queda afuera
     por omisión. Acá el corte se aplica a todas por igual, incluidas las que no existen aún.
     Ver lib/agents/run-colgada.ts. */
  const corte = cortePorLatido();
  const enCurso: Prisma.AgentRunWhereInput = { status: { in: ["PENDING", "RUNNING"] } };

  const [running, recent] = await Promise.all([
    prisma.agentRun.findMany({
      // Viva = dice que corre Y dio señales hace poco.
      where: { AND: [scope, enCurso, { updatedAt: { gte: corte } }] },
      orderBy: { createdAt: "desc" },
      take: 10,
      select,
    }),
    prisma.agentRun.findMany({
      /* Las colgadas entran acá, no desaparecen. Si se cuelga una que lanzaste vos, tiene que
         aparecer arriba de todo explicando que se cortó — no esfumarse sin decir nada. Y como
         el orden es por `updatedAt`, una vieja de 23 días cae sola al fondo y se va del feed. */
      where: {
        AND: [scope, { OR: [{ status: { in: ["DONE", "ERROR"] } }, { AND: [enCurso, { updatedAt: { lt: corte } }] }] }],
      },
      orderBy: { updatedAt: "desc" },
      take,
      select,
    }),
  ]);

  const serialize = (r: (typeof running)[number]) => {
    /* Una colgada se REPORTA como fallada aunque la base diga `RUNNING`. La fila no se toca:
       esto es una lectura, y arreglar el dato es otra decisión (hay un script para eso). */
    const colgada = estaColgada(r);
    const status = colgada ? "ERROR" : r.status;
    return {
    id: r.id,
    status,
    currentPhase: colgada ? null : r.currentPhase,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    clientId: r.clientId,
    clientName: r.client?.name ?? null,
    agentName: r.agent?.name ?? r.stepLabel ?? "Agente",
    /* El motivo se escribe acá y no se deduce del `output`: una corrida colgada no dejó
       output —murió antes—, así que `parseRunError` devolvería el genérico "no pudo completar
       la tarea", que no distingue "falló" de "la mataron". */
    error: colgada ? MOTIVO_COLGADA : r.status === "ERROR" ? parseRunError(r.output) : null,
    // ¿La lancé YO? Gobierna el aviso emergente (solo lo tuyo interrumpe) y el
    // filtro por defecto del panel. Las corridas de sistema tienen el campo null,
    // así que jamás son "mías" — nunca avisan, que es lo correcto.
    mine: !!r.triggeredByEmail && r.triggeredByEmail === email,
    // A dónde lleva "Ver" en el aviso y el click en el ítem del panel.
    resultUrl: resolveRunResultUrl({
      clientId: r.clientId,
      projectId: r.projectId,
      businessCaseId: r.businessCaseId,
      canvasId: r.blocks[0]?.section.canvasId ?? null,
    }),
    };
  };

  return NextResponse.json({
    running: running.map(serialize),
    recent: recent.map(serialize),
  });
}
