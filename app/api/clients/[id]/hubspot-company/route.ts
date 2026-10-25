import { withClientAccess } from "@/lib/api";
import { prisma } from "@/lib/db/prisma";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { NextResponse } from "next/server";
import { asignarEmpresaDeHubspot } from "@/lib/clients/empresa-de-hubspot";
import { cuerpoDeEmpresaRepetida } from "@/lib/clients/empresa-de-hubspot-aviso";

/**
 * PUT — guarda el hubspotCompanyId elegido por el usuario.
 *
 * ⛔ Auditoría 2026-09-03: entraba con `withAuth` (cualquier sesión) y aceptaba CUALQUIER
 * `hubspotCompanyId` sin verificar que existiera. Re-apuntar el vínculo de un cliente a otra
 * empresa de HubSpot contamina después handoffs, CS360 y cobranza con datos ajenos. Ahora: acceso
 * al cliente, y la empresa tiene que EXISTIR en el HubSpot de Smarteam.
 *
 * R7b (2026-10-24): el campo es SOLO la empresa en el HubSpot de Smarteam (Elías): un cliente con su propio portal
 * conectado no la guarda (409), porque su empresa es de otro espacio de ids. Y una empresa es de una sola ficha: si otra
 * ya la tiene, 409 con cuál es (antes quedaban dos fichas para la misma empresa, y con el índice único sería un 500).
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
    /* R7b (Elías, 24 oct): el campo es SOLO la empresa en el HubSpot de Smarteam. Un cliente con su propio portal no la
       guarda: Nexus la busca en su portal cada vez. */
    if (cuenta) {
      return NextResponse.json(
        { error: "Este cliente tiene su propio HubSpot conectado: Nexus busca su empresa en ese portal, no se guarda acá." },
        { status: 409 },
      );
    }
    const existe = await empresaExisteEnSmarteam(hubspotCompanyId);
    if (!existe) {
      return NextResponse.json(
        { error: "Esa empresa no existe en el portal de HubSpot desde el que Nexus lee este cliente" },
        { status: 404 },
      );
    }
  }

  const r = await asignarEmpresaDeHubspot(clientId, hubspotCompanyId);
  if (!r.ok) return NextResponse.json(await cuerpoDeEmpresaRepetida(r.ficha), { status: 409 });

  return NextResponse.json({ id: clientId, hubspotCompanyId });
});

/** GET de la empresa por id en el HubSpot de Smarteam. Cualquier fallo cuenta como «no existe». */
async function empresaExisteEnSmarteam(companyId: string): Promise<boolean> {
  try {
    const hs = await getSystemHubspotClient();
    const res = await hs.apiRequest({
      method: "GET",
      path: `/crm/v3/objects/companies/${companyId}?properties=name`,
    });
    return res.ok;
  } catch {
    return false;
  }
}
