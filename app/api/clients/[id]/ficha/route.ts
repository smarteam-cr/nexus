import { NextRequest, NextResponse } from "next/server";
import { guardAccessToClient } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { hubspotCompanyUrl } from "@/lib/hubspot/urls";
import {
  CAMPOS_DE_LA_FICHA,
  camposQueCambiaron,
  escrituraEnHubspot,
  fichaTieneContenido,
  leerFicha,
  quitarDeLaPropuesta,
  validarValores,
  type ClaveDeFicha,
  type FichaGuardada,
} from "@/lib/clients/ficha";
import { sincronizarFichaConHubspot } from "@/lib/clients/ficha-hubspot";
import { resultadosDelCliente } from "@/lib/handoff/resultados";
import { resultadosParaLaFicha } from "@/lib/handoff/resultados-medibles";

/**
 * /api/clients/[id]/ficha — la ficha del cliente (lib/clients/ficha.ts).
 *
 * GET  → la ficha (confirmada + propuesta pendiente + estado en HubSpot) y el link a la empresa.
 * PUT  → { valores } CONFIRMA: guarda en Nexus y DESPUÉS escribe en HubSpot. Guardar primero es a
 *        propósito: si HubSpot falla, lo que el CSE escribió no se pierde y se reintenta
 *        confirmando de nuevo (sin cambios, solo re-sincroniza).
 *      → { descartarPropuesta: true } borra la propuesta de la IA sin tocar lo confirmado.
 *
 * «Resultados que persigue» no viaja desde la pantalla: se arma acá con los resultados CONFIRMADOS
 * de los proyectos del cliente (lib/handoff/resultados.ts › resultadosDelCliente), que se editan en
 * la misma sección. Sin ninguno confirmado, queda lo que ya estaba confirmado (no se pisa con nada).
 * Cada respuesta trae los proyectos con lista y ese texto, para que la pantalla los muestre.
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

/** Los proyectos con lista de resultados y el texto que saldría de los confirmados. */
async function losResultados(clientId: string) {
  const listas = await resultadosDelCliente(clientId);
  return {
    proyectosConResultados: listas.map((l) => ({ projectId: l.projectId, proyecto: l.proyecto })),
    resultadosParaLaFicha: resultadosParaLaFicha(listas),
  };
}

async function responder(clientId: string, ficha: FichaGuardada, companyId: string | null, extra: Record<string, unknown> = {}) {
  const [hubspotUrl, resultados] = await Promise.all([urlDeLaEmpresa(companyId), losResultados(clientId)]);
  return NextResponse.json({ ficha, hubspotUrl, ...resultados, ...extra });
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;

  const client = await cargar(id);
  if (!client) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  return responder(id, leerFicha(client.ficha), empresaDelSistema(client));
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;

  const body = (await req.json().catch(() => null)) as {
    valores?: unknown;
    descartarPropuesta?: boolean;
    descartarCampos?: unknown;
  } | null;
  const client = await cargar(id);
  if (!client) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  const companyId = empresaDelSistema(client);
  const actual = leerFicha(client.ficha);

  if (body?.descartarPropuesta) {
    const nueva: FichaGuardada = { ...actual, propuesta: null };
    await prisma.client.update({ where: { id }, data: { ficha: nueva as object } });
    return responder(id, nueva, companyId);
  }

  // El «Descartar» de un campo: se guarda, para que el número de la pestaña se apague y la
  // propuesta no reaparezca al volver. Solo claves de la ficha; lo demás se ignora.
  if (Array.isArray(body?.descartarCampos)) {
    const validas = new Set<string>(CAMPOS_DE_LA_FICHA.map((c) => c.clave));
    const claves = (body.descartarCampos as unknown[]).filter(
      (k): k is ClaveDeFicha => typeof k === "string" && validas.has(k),
    );
    if (!claves.length) return NextResponse.json({ error: "No hay campos para descartar." }, { status: 400 });
    const nueva = quitarDeLaPropuesta(actual, claves);
    await prisma.client.update({ where: { id }, data: { ficha: nueva as object } });
    return responder(id, nueva, companyId);
  }

  const v = validarValores(body?.valores);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  // Los resultados no los escribe la pantalla: salen de los confirmados de cada proyecto.
  const deLosProyectos = (await losResultados(id)).resultadosParaLaFicha;
  v.valores.resultadosQuePersigue = deLosProyectos || actual.valores.resultadosQuePersigue;
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
    if (!actual.propuesta) return responder(id, actual, companyId, { sinCambios: true });
    const nueva: FichaGuardada = { ...actual, propuesta: null };
    await prisma.client.update({ where: { id }, data: { ficha: nueva as object } });
    return responder(id, nueva, companyId, { sinCambios: true });
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
  return responder(id, final, companyId);
}
