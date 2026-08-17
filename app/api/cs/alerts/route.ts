/**
 * GET /api/cs/alerts?status=OPEN&severity=HIGH&since=<ISO>&clientId=<id>
 *
 * Lista alertas del watchdog de Éxito del cliente. Lo usan el feed del panel
 * (refetch tras acciones), el drill por cliente (historial completo con
 * ?clientId= sin filtro de status) y el poller de notificaciones del CSL
 * (?status=OPEN&severity=HIGH&since=watermark). Gateado con `customerSuccess.read`.
 *
 * ⚠ Y ACOTADO POR CLIENTE. Hasta el 2026-08-16 el gate era `seeAllClients`, que IMPLICABA ver
 * todos los clientes, así que esta ruta nunca necesitó filtrar. La celda nueva no implica nada de
 * eso —la tiene el CSE, acotado a SUS clientes— y sin este filtro un CSE leería las alertas de la
 * cartera entera. No es solo el título: el watchdog las redacta con un contexto que incluye MRR,
 * UUS y licencias, así que el texto puede traer datos de partner de cuentas ajenas.
 * `lib/cs/load-panel.ts` ya dejaba escrito el riesgo («si mañana un rol acotado gana acceso…»);
 * esta ruta era el camino que se salteó esa previsión.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardPermission } from "@/lib/auth/api-guards";
import { accessibleClientWhere } from "@/lib/auth/access";
import { prisma } from "@/lib/db/prisma";
import { serializeAlert } from "@/lib/cs/load-panel";
import type { CsAlertStatus, CsAlertSeverity, Prisma } from "@prisma/client";

const STATUSES = ["OPEN", "SEEN", "RESOLVED", "DISMISSED"] as const;
const SEVERITIES = ["LOW", "MEDIUM", "HIGH"] as const;

export async function GET(req: NextRequest) {
  const guard = await guardPermission("customerSuccess", "read");
  if (guard instanceof NextResponse) return guard;

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const severity = sp.get("severity");
  const since = sp.get("since");
  const clientId = sp.get("clientId");

  /* El where del usuario: `null` = ve todos (los roles que antes tenían seeAllClients). Para el
     CSE devuelve el filtro de SUS clientes, y sin aplicarlo acá la lista se le abriría entera. */
  const clientWhere = await accessibleClientWhere(guard.user);

  const where: Prisma.CsAlertWhereInput = clientWhere ? { client: clientWhere } : {};
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
