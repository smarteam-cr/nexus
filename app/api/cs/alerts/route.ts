/**
 * GET /api/cs/alerts?status=OPEN&severity=HIGH&since=<ISO>&clientId=<id>
 *
 * Lista alertas del watchdog de Éxito del cliente. Lo usan el feed del panel
 * (refetch tras acciones), el drill por cliente (historial completo con
 * ?clientId= sin filtro de status) y el poller de notificaciones del CSL
 * (?status=OPEN&severity=HIGH&since=watermark). Gateado con seeAllClients.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCapability } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { serializeAlert } from "@/lib/cs/load-panel";
import type { CsAlertStatus, CsAlertSeverity, Prisma } from "@prisma/client";

const STATUSES = ["OPEN", "SEEN", "RESOLVED", "DISMISSED"] as const;
const SEVERITIES = ["LOW", "MEDIUM", "HIGH"] as const;

export async function GET(req: NextRequest) {
  const guard = await guardCapability("seeAllClients");
  if (guard instanceof NextResponse) return guard;

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const severity = sp.get("severity");
  const since = sp.get("since");
  const clientId = sp.get("clientId");

  const where: Prisma.CsAlertWhereInput = {};
  if (status && (STATUSES as readonly string[]).includes(status)) where.status = status as CsAlertStatus;
  if (severity && (SEVERITIES as readonly string[]).includes(severity)) where.severity = severity as CsAlertSeverity;
  if (clientId) where.clientId = clientId;
  if (since) {
    const d = new Date(since);
    // lastDetectedAt (no createdAt): el dedup del watchdog ESCALA severidad sobre la
    // fila existente sin tocar createdAt — con createdAt, una alerta que nace MEDIUM
    // y escala a HIGH quedaría invisible para el poller de notificaciones.
    if (!isNaN(d.getTime())) where.lastDetectedAt = { gt: d };
  }

  const alerts = await prisma.csAlert.findMany({
    where,
    include: { client: { select: { name: true } }, project: { select: { name: true } } },
    orderBy: { lastDetectedAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ alerts: alerts.map(serializeAlert) });
}
