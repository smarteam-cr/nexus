/**
 * PATCH /api/cs/alerts/[alertId]   body: { status: "SEEN" | "RESOLVED" | "DISMISSED" | "OPEN" }
 *
 * Ciclo de vida de una alerta del watchdog desde el feed: marcar vista, resolver,
 * descartar (o reabrir). Registra quién y cuándo. Gateado con seeAllClients.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCapability } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { serializeAlert } from "@/lib/cs/load-panel";
import type { CsAlertStatus } from "@prisma/client";

const STATUSES = ["OPEN", "SEEN", "RESOLVED", "DISMISSED"] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ alertId: string }> },
) {
  const { alertId } = await params;
  const guard = await guardCapability("seeAllClients");
  if (guard instanceof NextResponse) return guard;

  let body: { status?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const status = typeof body.status === "string" ? body.status : "";
  if (!(STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: `status debe ser uno de ${STATUSES.join("|")}` }, { status: 400 });
  }

  const existing = await prisma.csAlert.findUnique({ where: { id: alertId }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Alerta no encontrada" }, { status: 404 });

  const now = new Date();
  const email = guard.user.email ?? null;
  const updated = await prisma.csAlert.update({
    where: { id: alertId },
    data: {
      status: status as CsAlertStatus,
      ...(status === "SEEN" ? { seenAt: now, seenByEmail: email } : {}),
      ...(status === "RESOLVED" || status === "DISMISSED" ? { resolvedAt: now, resolvedByEmail: email } : {}),
      ...(status === "OPEN" ? { seenAt: null, seenByEmail: null, resolvedAt: null, resolvedByEmail: null } : {}),
    },
    include: { client: { select: { name: true } }, project: { select: { name: true } } },
  });
  return NextResponse.json({ alert: serializeAlert(updated) });
}
