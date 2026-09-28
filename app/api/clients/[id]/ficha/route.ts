import { NextRequest, NextResponse } from "next/server";
import { guardAccessToClient } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { hubspotCompanyUrl } from "@/lib/hubspot/urls";
import {
  camposQueCambiaron,
  escrituraEnHubspot,
  fichaTieneContenido,
  leerFicha,
  validarValores,
  type FichaGuardada,
} from "@/lib/clients/ficha";
import { sincronizarFichaConHubspot } from "@/lib/clients/ficha-hubspot";

/**
 * /api/clients/[id]/ficha — la ficha del cliente (lib/clients/ficha.ts).
 *
 * GET  → la ficha (confirmada + propuesta pendiente + estado en HubSpot) y el link a la empresa.
 * PUT  → { valores } CONFIRMA: guarda en Nexus y DESPUÉS escribe en HubSpot. Guardar primero es a
 *        propósito: si HubSpot falla, lo que el CSE escribió no se pierde y se reintenta
 *        confirmando de nuevo (sin cambios, solo re-sincroniza).
 *      → { descartarPropuesta: true } borra la propuesta de la IA sin tocar lo confirmado.
 *
 * Solo equipo interno (guardAccessToClient exige INTERNAL): la ficha tiene campos que el cliente
 * nunca debe ver.
 */

type Params = { params: Promise<{ id: string }> };

async function cargar(clientId: string) {
  return prisma.client.findUnique({
    where: { id: clientId },
    select: { ficha: true, hubspotCompanyId: true, hubspotAccount: { select: { id: true } } },
  });
}

async function urlDeLaEmpresa(companyId: string | null): Promise<string | null> {
  if (!companyId) return null;
  const sistema = await prisma.hubspotAccount.findFirst({ where: { isSystem: true }, select: { hubspotPortalId: true } });
  return hubspotCompanyUrl(sistema?.hubspotPortalId, companyId);
}

/**
 * La empresa donde se escribe, o null. Un cliente con HubSpot PROPIO resuelve su `hubspotCompanyId`
 * en SU portal: escribirlo con la cuenta del sistema tocaría otra empresa o ninguna. Al
 * 2026-09-27 no hay ninguno (0/188), pero el día que aparezca, la ficha se queda en Nexus.
 */
function empresaDelSistema(c: { hubspotCompanyId: string | null; hubspotAccount: { id: string } | null }): string | null {
  return c.hubspotAccount ? null : c.hubspotCompanyId;
}

async function responder(ficha: FichaGuardada, companyId: string | null, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ficha, hubspotUrl: await urlDeLaEmpresa(companyId), ...extra });
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;

  const client = await cargar(id);
  if (!client) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  return responder(leerFicha(client.ficha), empresaDelSistema(client));
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;

  const body = (await req.json().catch(() => null)) as { valores?: unknown; descartarPropuesta?: boolean } | null;
  const client = await cargar(id);
  if (!client) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  const companyId = empresaDelSistema(client);
  const actual = leerFicha(client.ficha);

  if (body?.descartarPropuesta) {
    const nueva: FichaGuardada = { ...actual, propuesta: null };
    await prisma.client.update({ where: { id }, data: { ficha: nueva as object } });
    return responder(nueva, companyId);
  }

  const v = validarValores(body?.valores);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  if (!fichaTieneContenido(v.valores)) {
    return NextResponse.json({ error: "La ficha está vacía: escribe al menos un campo antes de confirmar." }, { status: 400 });
  }

  const primeraVez = !actual.confirmadaAt;
  const cambios = camposQueCambiaron(actual.valores, v.valores);
  const escritura = escrituraEnHubspot({
    primeraVez,
    cambios,
    estadoPrevio: actual.hubspot?.estado,
    hayEmpresa: Boolean(companyId),
  });

  // Nada nuevo que escribir: si había una propuesta, confirmar sin cambios es «la revisé y me quedo
  // con lo que está», así que la propuesta se descarta.
  if (!primeraVez && !cambios.length && escritura.alDia) {
    if (!actual.propuesta) return responder(actual, companyId, { sinCambios: true });
    const nueva: FichaGuardada = { ...actual, propuesta: null };
    await prisma.client.update({ where: { id }, data: { ficha: nueva as object } });
    return responder(nueva, companyId, { sinCambios: true });
  }

  const autor = guard.user.teamMember?.name || guard.user.email;
  const confirmada: FichaGuardada = {
    ...actual,
    valores: v.valores,
    confirmadaAt: new Date().toISOString(),
    confirmadaPor: autor,
    propuesta: null,
  };
  // 1) Nexus primero: lo confirmado no depende de que HubSpot conteste.
  await prisma.client.update({ where: { id }, data: { ficha: confirmada as object } });

  // 2) HubSpot. Si la última vez quedó al día, solo viaja lo que cambió (y la nota, si hubo cambios).
  //    Si no (primera vez, falla anterior, empresa recién vinculada), viajan todas las propiedades y
  //    la nota que nunca llegó (lib/clients/ficha.ts › escrituraEnHubspot).
  const resultado = await sincronizarFichaConHubspot({
    hubspotCompanyId: companyId,
    valores: v.valores,
    aEscribir: escritura.aEscribir,
    conNota: escritura.conNota,
    cambios,
    primeraVez,
    autor,
    fuentes: actual.propuesta?.fuentes ?? [],
  });

  const final: FichaGuardada = {
    ...confirmada,
    hubspot: {
      estado: resultado.estado,
      at: new Date().toISOString(),
      ...(resultado.error ? { error: resultado.error } : {}),
      ...(resultado.notaId ? { notaId: resultado.notaId } : {}),
    },
  };
  await prisma.client.update({ where: { id }, data: { ficha: final as object } });
  return responder(final, companyId);
}
