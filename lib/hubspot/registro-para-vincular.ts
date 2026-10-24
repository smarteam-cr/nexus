/**
 * lib/hubspot/registro-para-vincular.ts — la FOTO de un registro de HubSpot para vincularlo a una tarea (Tareas
 * internas, docs/tareas-plan.md §4.4). SERVIDOR. Solo LEE, con el token del sistema: vincular no es sincronizar.
 *
 * Devuelve el nombre para mostrar, un detalle corto (tipo y etapa, nunca montos) y las empresas asociadas, que es con
 * lo que Nexus decide de qué cliente es. La foto no guarda correo ni teléfono.
 *
 *   · `sin_permiso`: HubSpot respondió 403 (la app no tiene ese permiso). No se vincula.
 *   · `no_existe`: 404.
 *   · `error`: cualquier otra cosa (HubSpot no respondió). Quien llama decide si guarda igual, enmascarado.
 */
import "server-only";
import { getSystemHubspotClient } from "./client";
import { OBJETOS_QUE_SE_VINCULAN, type EnlaceDeHubspot } from "./urls";
import { OBJETO_PROYECTOS } from "./asociaciones-proyecto";

export type FotoDeRegistro =
  | { estado: "ok"; etiqueta: string; detalle: string; empresas: string[] }
  | { estado: "sin_permiso" }
  | { estado: "no_existe" }
  | { estado: "error"; motivo: string };

/** Las propiedades que se piden por objeto. Sin correo, teléfono ni montos. */
const PROPIEDADES: Readonly<Record<string, readonly string[]>> = {
  "0-1": ["firstname", "lastname", "jobtitle"],
  "0-2": ["name", "domain"],
  "0-3": ["dealname", "dealstage", "pipeline"],
  "0-5": ["subject", "hs_pipeline_stage"],
  [OBJETO_PROYECTOS]: ["hs_name", "nombre_del_proyecto"],
};

type Props = Record<string, string | null | undefined>;

/** El nombre y el detalle, puros (exportados para probarlos). */
export function nombreYDetalle(objeto: string, id: string, p: Props): { etiqueta: string; detalle: string } {
  const tipo = OBJETOS_QUE_SE_VINCULAN[objeto] ?? "Objeto propio";
  const limpio = (x: string | null | undefined) => (x ?? "").trim();
  let etiqueta = "";
  let extra = "";
  if (objeto === "0-1") {
    etiqueta = [limpio(p.firstname), limpio(p.lastname)].filter(Boolean).join(" ");
    extra = limpio(p.jobtitle);
  } else if (objeto === "0-2") {
    etiqueta = limpio(p.name);
    extra = limpio(p.domain);
  } else if (objeto === "0-3") {
    etiqueta = limpio(p.dealname);
  } else if (objeto === "0-5") {
    etiqueta = limpio(p.subject);
  } else if (objeto === OBJETO_PROYECTOS) {
    etiqueta = limpio(p.nombre_del_proyecto) || limpio(p.hs_name);
  }
  return { etiqueta: (etiqueta || `${tipo} #${id}`).slice(0, 160), detalle: [tipo, extra].filter(Boolean).join(" · ").slice(0, 160) };
}

async function leerFoto(enlace: EnlaceDeHubspot): Promise<FotoDeRegistro> {
  const hs = await getSystemHubspotClient();
  const props = PROPIEDADES[enlace.objeto] ?? ["hs_object_id"];
  const asociacion = enlace.objeto === "0-2" ? "" : "&associations=companies";
  const res = await hs.apiRequest({
    method: "GET",
    path: `/crm/v3/objects/${enlace.objeto}/${encodeURIComponent(enlace.id)}?properties=${props.join(",")}${asociacion}`,
  });
  if (res.status === 401) return { estado: "error", motivo: "401" };
  if (res.status === 403) return { estado: "sin_permiso" };
  if (res.status === 404) return { estado: "no_existe" };
  if (res.status !== 200) return { estado: "error", motivo: `HubSpot respondió ${res.status}` };
  const d = (await res.json()) as { id: string; properties?: Props; associations?: { companies?: { results?: { id: string }[] } } };
  const { etiqueta, detalle } = nombreYDetalle(enlace.objeto, enlace.id, d.properties ?? {});
  const empresas = enlace.objeto === "0-2" ? [d.id] : [...new Set((d.associations?.companies?.results ?? []).map((r) => String(r.id)))];
  return { estado: "ok", etiqueta, detalle, empresas };
}

/** La foto. El 401 (KNOWN-ERRORS: 401 aunque `expiresAt` diga válido) lo reintenta el transporte (lib/hubspot/client.ts). */
export async function leerRegistroParaVincular(enlace: EnlaceDeHubspot): Promise<FotoDeRegistro> {
  try {
    return await leerFoto(enlace);
  } catch (e) {
    return { estado: "error", motivo: e instanceof Error ? e.message : "sin respuesta" };
  }
}

/** El portal del sistema (el CRM de Smarteam): un enlace de otro portal no se vincula. */
export async function portalDelSistema(): Promise<string | null> {
  const { prisma } = await import("@/lib/db/prisma");
  const cuenta = await prisma.hubspotAccount.findFirst({ where: { isSystem: true }, select: { hubspotPortalId: true } });
  return cuenta?.hubspotPortalId ?? null;
}
