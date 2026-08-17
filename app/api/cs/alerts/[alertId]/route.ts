/**
 * PATCH /api/cs/alerts/[alertId]   body: { status: "SEEN" | "RESOLVED" | "DISMISSED" | "OPEN" }
 *
 * Ciclo de vida de una alerta del watchdog desde el feed: marcar vista, resolver,
 * descartar (o reabrir). Registra quién y cuándo. Gateado con `customerSuccess.read`.
 *
 * ⚠ Y SE VERIFICA A QUÉ CLIENTE PERTENECE LA ALERTA. El gate viejo (`seeAllClients`) implicaba
 * acceso a todos los clientes; la celda nueva no. Sin este chequeo, un CSE con el id de una
 * alerta ajena podría resolverla o descartarla — y una alerta descartada deja de aparecerle a
 * quien SÍ tenía que actuar, sin dejar rastro de que la apagó alguien de afuera.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardPermission } from "@/lib/auth/api-guards";
import { accessibleClientWhere } from "@/lib/auth/access";
import { prisma } from "@/lib/db/prisma";
import { serializeAlert } from "@/lib/cs/load-panel";
import type { CsAlertStatus } from "@prisma/client";

const STATUSES = ["OPEN", "SEEN", "RESOLVED", "DISMISSED"] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ alertId: string }> },
) {
  const { alertId } = await params;
  const guard = await guardPermission("customerSuccess", "read");
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

  /* La alerta tiene que pasar el where del usuario. Se resuelve con `findFirst` y el filtro
     adentro —no con un findUnique + comparación después— para que no exista una rama donde el id
     se leyó y el chequeo se saltee. 404 y no 403: quien no tiene acceso tampoco tiene por qué
     enterarse de que esa alerta existe. */
  const clientWhere = await accessibleClientWhere(guard.user);
  const existing = await prisma.csAlert.findFirst({
    where: { id: alertId, ...(clientWhere ? { client: clientWhere } : {}) },
    select: { id: true },
  });
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
