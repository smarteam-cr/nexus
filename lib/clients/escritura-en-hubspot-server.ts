/**
 * lib/clients/escritura-en-hubspot-server.ts — Nexus escribe en la empresa de HubSpot lo que decide la persona y lo que
 * calcula Nexus (R2, 2026-10-25). SERVIDOR.
 *
 * Se llama DESPUÉS de que la decisión quedó en Nexus (la transacción de datos-de-la-empresa-server.ts ya cerró), así
 * que un HubSpot caído no pierde nada: la ficha dice que no se pudo, y lo pone al día el script de la escritura masiva
 * (scripts/hubspot-escribir-datos-de-la-empresa.ts). Nunca lanza.
 *
 * Una empresa FUSIONADA en HubSpot no se escribe: su id viejo responde 200 con los datos de la que quedó (KNOWN-ERRORS), y
 * escribir ahí pisaría a otra empresa, quizá de otra ficha de Nexus. Se reconoce porque vuelve otro id.
 *
 *   1. La bandera `EMPRESA_HUBSPOT_ESCRITURA` apagada → no hace nada.
 *   2. Lee lo que tiene HOY la empresa en HubSpot en esas propiedades (un GET).
 *   3. Decide qué escribir con la regla del espejo (planDeEscritura, puro).
 *   4. Lo escribe en un PATCH, por el transporte único (getSystemHubspotClient → lib/hubspot/transporte.ts).
 *   5. Deja en la fila de cada decisión la propiedad, lo que tenía antes y cuándo (o el error). Es lo único que escribe
 *      esas columnas, y lo que lee el script de vuelta (scripts/hubspot-empresa-volver-atras.ts).
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { escrituraHabilitada } from "@/lib/hubspot/empresa";
import { SELECT_DE_LOS_DATOS, type ClaveDeDato } from "./datos-de-la-empresa";
import { datosDeLaFila, type ResultadoDelDato } from "./datos-de-la-empresa-server";
import { planDeEscritura, propiedadesALeer, type DatoParaEscribir, type EstadoDeLaEscritura, type Escritura } from "./escritura-en-hubspot";

async function textoDeError(res: { status: number; text(): Promise<string> }): Promise<string> {
  const cuerpo = await res.text().catch(() => "");
  try {
    const j = JSON.parse(cuerpo) as { message?: string };
    if (j.message) return `${res.status}: ${j.message}`.slice(0, 400);
  } catch {
    /* no era JSON */
  }
  return `${res.status}: ${cuerpo}`.slice(0, 400);
}

export class EmpresaFusionada extends Error {
  constructor(readonly pedida: string, readonly devuelta: string) {
    super(`la empresa ${pedida} se fusionó en HubSpot con la ${devuelta}: no se escribe (revisa la ficha)`);
  }
}

/** Lo que tiene la empresa en HubSpot en esas propiedades. Una propiedad que todavía no existe no viene. */
export async function leerPropiedadesDeHubspot(companyId: string, propiedades: readonly string[]): Promise<Record<string, string | null>> {
  const hs = await getSystemHubspotClient();
  const res = await hs.apiRequest({ method: "GET", path: `/crm/v3/objects/companies/${companyId}?properties=${encodeURIComponent(propiedades.join(","))}` });
  if (!res.ok) throw new Error(await textoDeError(res));
  const j = (await res.json()) as { id?: string; properties?: Record<string, string | null> };
  if (j.id && j.id !== companyId) throw new EmpresaFusionada(companyId, j.id);
  return j.properties ?? {};
}

/**
 * Lo mismo para muchas empresas a la vez (de a 100, el máximo de HubSpot). Lo usan los scripts y la copia. Va por el id
 * que DEVUELVE HubSpot: una empresa fusionada vuelve con otro id y no aparece por el pedido. Quien llama trata «no vino»
 * como «no se leyó», nunca como «está vacía».
 */
export async function leerEmpresasDeHubspot(ids: readonly string[], propiedades: readonly string[]): Promise<Map<string, Record<string, string | null>>> {
  const out = new Map<string, Record<string, string | null>>();
  if (!ids.length) return out;
  const hs = await getSystemHubspotClient();
  for (let i = 0; i < ids.length; i += 100) {
    const res = await hs.apiRequest({
      method: "POST",
      path: "/crm/v3/objects/companies/batch/read",
      body: { properties: [...propiedades], inputs: ids.slice(i, i + 100).map((id) => ({ id })) },
    });
    if (!res.ok) throw new Error(`HubSpot respondió ${await textoDeError(res)} al leer las empresas`);
    const j = (await res.json()) as { results: { id: string; properties: Record<string, string | null> }[] };
    for (const c of j.results) out.set(c.id, c.properties);
  }
  return out;
}

async function patch(companyId: string, properties: Record<string, string>): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  try {
    const hs = await getSystemHubspotClient();
    const res = await hs.apiRequest({ method: "PATCH", path: `/crm/v3/objects/companies/${companyId}`, body: { properties } });
    return res.ok ? { ok: true } : { ok: false, status: res.status, error: await textoDeError(res) };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message.slice(0, 400) : "error desconocido" };
  }
}

/**
 * Escribe un plan ya armado y deja el rastro en cada fila. Lo usan esta ruta y el script de la escritura masiva. Si
 * HubSpot rechaza el envío entero (400: una opción que allá no existe, una propiedad sin crear), prueba propiedad por
 * propiedad: lo que sí acepta queda escrito y cada fila dice lo suyo.
 */
export async function escribirPlan(companyId: string, plan: readonly Escritura[], ahora = new Date()): Promise<EstadoDeLaEscritura> {
  if (!plan.length) return { estado: "nada" };
  const resultado = new Map<string, { ok: true } | { ok: false; error: string }>();
  const todo = await patch(companyId, Object.fromEntries(plan.map((e) => [e.propiedad, e.valor])));
  if (todo.ok) for (const e of plan) resultado.set(e.propiedad, todo);
  else if (todo.status === 400 && plan.length > 1) {
    for (const e of plan) resultado.set(e.propiedad, await patch(companyId, { [e.propiedad]: e.valor }));
  } else for (const e of plan) resultado.set(e.propiedad, todo);

  await Promise.all(
    plan
      .filter((e): e is Escritura & { propuestaId: string } => !!e.propuestaId)
      .map((f) => {
        const r = resultado.get(f.propiedad)!;
        return prisma.propuestaDeDato.update({
          where: { id: f.propuestaId },
          data: r.ok
            ? { hubspotPropiedad: f.propiedad, hubspotAnterior: f.anterior, hubspotEscritaAt: ahora, hubspotError: null }
            : { hubspotPropiedad: f.propiedad, hubspotError: r.error },
        });
      }),
  );
  const escritas = plan.filter((e) => resultado.get(e.propiedad)?.ok).map((e) => e.propiedad);
  const fallo = [...resultado.values()].find((r): r is { ok: false; error: string } => !r.ok);
  return fallo ? { estado: "fallo", error: escritas.length ? `${fallo.error} (se escribieron ${escritas.length} de ${plan.length})` : fallo.error } : { estado: "escrita", propiedades: escritas };
}

/**
 * Después de una decisión: escribe en HubSpot lo que corresponda de los datos que quedaron aplicados. `extras` son las
 * propiedades que calcula Nexus sin un dato (la fecha de la investigación, el siguiente caso).
 */
export async function escribirEnHubspot(
  clientId: string,
  resultados: readonly ResultadoDelDato[],
  o: { extras?: readonly { propiedad: string; valor: string }[]; ahora?: Date } = {},
): Promise<EstadoDeLaEscritura> {
  if (!escrituraHabilitada()) return { estado: "apagada" };
  try {
    const aplicados = resultados.filter((r) => r.veredicto.accion === "aplicar" && r.propuestaId);
    if (!aplicados.length && !o.extras?.length) return { estado: "nada" };
    const fila = await prisma.client.findUnique({ where: { id: clientId }, select: { hubspotCompanyId: true, ...SELECT_DE_LOS_DATOS } });
    if (!fila?.hubspotCompanyId) return { estado: "sin_empresa" };
    const datos = datosDeLaFila(fila as Record<string, unknown>);
    // El último resultado de cada dato es el que quedó (los efectos, como el TAM, vienen después de la causa).
    const ultimo = new Map<ClaveDeDato, ResultadoDelDato>();
    for (const r of aplicados) ultimo.set(r.clave, r);
    const paraEscribir: DatoParaEscribir[] = [...ultimo.values()].map((r) => ({ propuestaId: r.propuestaId, clave: r.clave, ...datos[r.clave] }));
    const enHubspot = await leerPropiedadesDeHubspot(
      fila.hubspotCompanyId,
      propiedadesALeer(
        paraEscribir.map((d) => d.clave),
        (o.extras ?? []).map((x) => x.propiedad),
      ),
    );
    return await escribirPlan(fila.hubspotCompanyId, planDeEscritura(paraEscribir, enHubspot, o.extras ?? []), o.ahora);
  } catch (e) {
    console.error("[clients/escritura-en-hubspot]", e);
    return { estado: "fallo", error: e instanceof Error ? e.message.slice(0, 400) : "error desconocido" };
  }
}
