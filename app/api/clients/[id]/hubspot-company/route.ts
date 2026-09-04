import { withClientAccess } from "@/lib/api";
import { prisma } from "@/lib/db/prisma";
import { getHubspotClient, getSystemHubspotClient } from "@/lib/hubspot/client";
import { NextResponse } from "next/server";

/**
 * PUT — guarda el hubspotCompanyId elegido por el usuario.
 *
 * ⛔ Auditoría 2026-09-03: entraba con `withAuth` (cualquier sesión) y aceptaba CUALQUIER
 * `hubspotCompanyId` sin verificar que existiera. Re-apuntar el vínculo de un cliente a otra
 * empresa de HubSpot contamina después handoffs, CS360 y cobranza con datos ajenos. Ahora: acceso
 * al cliente, y la empresa tiene que EXISTIR en el portal desde el que Nexus lee para ese cliente
 * (el suyo si tiene cuenta propia; si no, el del sistema). Es el mismo portal contra el que busca
 * `hubspot-company/search`, así que lo que se ofrece para elegir es lo que se acepta.
 */
export const PUT = withClientAccess(async (
  request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id: clientId } = await params;
  const body = await request.json() as { hubspotCompanyId: string | null };
  const hubspotCompanyId = body.hubspotCompanyId?.trim() || null;

  if (hubspotCompanyId) {
    if (!/^\d+$/.test(hubspotCompanyId)) {
      return NextResponse.json({ error: "hubspotCompanyId inválido" }, { status: 400 });
    }
    const cuenta = await prisma.hubspotAccount.findFirst({
      where: { clientId },
      select: { id: true },
    });
    const existe = await empresaExisteEnElPortal(cuenta?.id, hubspotCompanyId);
    if (!existe) {
      return NextResponse.json(
        { error: "Esa empresa no existe en el portal de HubSpot desde el que Nexus lee este cliente" },
        { status: 404 },
      );
    }
  }

  const updated = await prisma.client.update({
    where: { id: clientId },
    data: { hubspotCompanyId },
    select: { id: true, hubspotCompanyId: true },
  });

  return NextResponse.json(updated);
});

/** GET de la empresa por id contra el portal que corresponde. Cualquier fallo cuenta como «no existe». */
async function empresaExisteEnElPortal(accountId: string | undefined, companyId: string): Promise<boolean> {
  try {
    const hs = accountId ? await getHubspotClient(accountId) : await getSystemHubspotClient();
    const res = await hs.apiRequest({
      method: "GET",
      path: `/crm/v3/objects/companies/${companyId}?properties=name`,
    });
    return res.ok;
  } catch {
    return false;
  }
}
