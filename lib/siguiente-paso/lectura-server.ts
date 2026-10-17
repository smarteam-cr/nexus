/**
 * lib/siguiente-paso/lectura-server.ts — los siguientes pasos, como los ve la pantalla. SERVER-ONLY. Nunca le pregunta a
 * HubSpot.
 *
 * Desde el 2026-10-16 (fase 0.2 de docs/nexus-sistema-de-trabajo-plan.md) el siguiente paso de un equipo es su próxima
 * tarea abierta con fecha (desde-tareas.ts): se lee de Tareas (lib/tareas/siguiente-paso.ts). De `SiguientePaso` (la
 * copia de lo que está escrito en HubSpot) sale solo si llegó a HubSpot.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { portalDelSistema } from "@/lib/hubspot/registro-para-vincular";
import { hubspotCompanyUrl, hubspotDealUrl, hubspotProjectUrl } from "@/lib/hubspot/urls";
import { proyectoClasificableWhere } from "@/lib/projects/scope";
import { historiaDeTareasDelPaso, tareasAbiertasParaElPaso } from "@/lib/tareas/siguiente-paso";
import { EQUIPOS_DEL_SIGUIENTE_PASO, type EquipoDelSiguientePaso } from "./propiedades";
import { esDelObjeto, fechaDelPaso, fuenteDeLaTarea, siguientePasoDe, SPRINT_DEL_PASO, type TareaDelPaso } from "./desde-tareas";
import type { EstadoEnHubspot, ObjetoDelPaso, ObjetoDeLaCuenta, PasosDeLaCuenta, SiguientePasoVisto } from "./reglas";

export type { ObjetoDeLaCuenta, PasosDeLaCuenta } from "./reglas";

/** Un objeto con lo que hace falta para buscar sus tareas: su cliente, su negocio de HubSpot y si está en HubSpot. */
export interface ObjetoParaBuscar {
  objeto: ObjetoDelPaso;
  objetoId: string;
  clientId: string | null;
  hubspotDealId?: string | null;
  enHubspot: boolean;
}

/** Los objetos de Nexus, resueltos (empresa → cliente, negocio → su negocio de HubSpot, proyecto → su cliente). */
export async function resolverParaBuscar(objetos: ReadonlyArray<{ objeto: ObjetoDelPaso; objetoId: string }>): Promise<ObjetoParaBuscar[]> {
  const ids = (o: ObjetoDelPaso) => [...new Set(objetos.filter((x) => x.objeto === o).map((x) => x.objetoId))];
  const [empresas, negocios, proyectos] = await Promise.all([
    ids("empresa").length ? prisma.client.findMany({ where: { id: { in: ids("empresa") } }, select: { id: true, hubspotCompanyId: true } }) : [],
    ids("negocio").length
      ? prisma.negocioAbierto.findMany({ where: { id: { in: ids("negocio") } }, select: { id: true, clientId: true, hubspotDealId: true } }).catch((e) => {
          if (esquemaDesactualizado(e)) return [];
          throw e;
        })
      : [],
    ids("proyecto").length ? prisma.project.findMany({ where: { id: { in: ids("proyecto") } }, select: { id: true, clientId: true, hubspotServiceId: true } }) : [],
  ]);
  return [
    ...empresas.map((c) => ({ objeto: "empresa" as const, objetoId: c.id, clientId: c.id, enHubspot: !!c.hubspotCompanyId })),
    ...negocios.map((n) => ({ objeto: "negocio" as const, objetoId: n.id, clientId: n.clientId, hubspotDealId: n.hubspotDealId, enHubspot: !!n.hubspotDealId })),
    ...proyectos.map((p) => ({ objeto: "proyecto" as const, objetoId: p.id, clientId: p.clientId, enHubspot: !!p.hubspotServiceId })),
  ];
}

/** Las tareas abiertas de esos objetos, en una sola consulta. */
export function tareasDeLosObjetos(objetos: readonly ObjetoParaBuscar[]): Promise<TareaDelPaso[]> {
  return tareasAbiertasParaElPaso({
    clientIds: [...new Set(objetos.filter((o) => o.objeto === "empresa" && o.clientId).map((o) => o.clientId!))],
    hubspotDealIds: [...new Set(objetos.flatMap((o) => (o.objeto === "negocio" && o.hubspotDealId ? [o.hubspotDealId] : [])))],
    projectIds: [...new Set(objetos.filter((o) => o.objeto === "proyecto").map((o) => o.objetoId))],
  });
}

const clave = (objeto: string, objetoId: string, equipo: string) => `${objeto}:${objetoId}:${equipo}`;

/** Lo último que se escribió en HubSpot de cada objeto y equipo (la copia): para decir si llegó y cuál está escrita. */
export async function copiasEnHubspot(objetos: readonly ObjetoParaBuscar[]) {
  if (!objetos.length) return new Map<string, { tareaId: string | null; estado: string; hubspotEstado: string; hubspotError: string | null }>();
  try {
    const filas = await prisma.siguientePaso.findMany({
      where: { estado: { in: ["vigente", "hecho"] }, OR: objetos.map((o) => ({ objeto: o.objeto, objetoId: o.objetoId })) },
      select: { objeto: true, objetoId: true, equipo: true, tareaId: true, estado: true, hubspotEstado: true, hubspotError: true },
      orderBy: { createdAt: "desc" },
    });
    const m = new Map<string, (typeof filas)[number]>();
    for (const f of filas) {
      const k = clave(f.objeto, f.objetoId, f.equipo);
      const previo = m.get(k);
      if (!previo || (f.estado === "vigente" && previo.estado !== "vigente")) m.set(k, f);
    }
    return m;
  } catch (e) {
    if (esquemaDesactualizado(e)) return new Map();
    throw e;
  }
}

async function nombres(correos: readonly string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(correos.filter((x) => x.includes("@")))];
  if (!unicos.length) return new Map();
  return new Map((await prisma.teamMember.findMany({ where: { email: { in: unicos } }, select: { email: true, name: true } })).map((m) => [m.email.toLowerCase(), m.name]));
}

/** El siguiente paso de cada objeto y equipo, como lo ve la pantalla. */
async function pasosDe(objetos: readonly ObjetoParaBuscar[]): Promise<SiguientePasoVisto[]> {
  const [tareas, copias] = await Promise.all([tareasDeLosObjetos(objetos), copiasEnHubspot(objetos)]);
  const elegidos: Array<{ o: ObjetoParaBuscar; equipo: EquipoDelSiguientePaso; t: TareaDelPaso }> = [];
  for (const o of objetos) {
    const deEste = tareas.filter((t) => esDelObjeto(t, o));
    for (const { clave: equipo } of EQUIPOS_DEL_SIGUIENTE_PASO) {
      const t = siguientePasoDe(deEste, equipo, copias.get(clave(o.objeto, o.objetoId, equipo))?.tareaId ?? null);
      if (t) elegidos.push({ o, equipo, t });
    }
  }
  const quien = await nombres(elegidos.flatMap(({ t }) => [t.responsableEmail ?? "", t.creadaPorEmail ?? ""]));
  return elegidos.map(({ o, equipo, t }) => {
    const copia = copias.get(clave(o.objeto, o.objetoId, equipo));
    const llego = copia && copia.tareaId === t.id && copia.estado === "vigente";
    const escritoPor = t.creadaPorEmail ?? (t.origen === "paso" ? "hubspot" : "nexus");
    const hubspotEstado: EstadoEnHubspot = !o.enHubspot ? "sin_hubspot" : llego ? (copia!.hubspotEstado as EstadoEnHubspot) : "pendiente";
    return {
      id: t.id,
      tareaNumero: t.numero,
      tareaVersion: t.version,
      objeto: o.objeto,
      objetoId: o.objetoId,
      equipo,
      que: t.titulo,
      fecha: fechaDelPaso(t),
      responsableEmail: t.responsableEmail,
      responsableNombre: t.responsableEmail ? (quien.get(t.responsableEmail) ?? null) : null,
      escritoPor,
      escritoPorNombre: escritoPor === "hubspot" ? "HubSpot" : escritoPor === "nexus" ? "Nexus" : (quien.get(escritoPor) ?? null),
      fuente: fuenteDeLaTarea(t),
      creadoAt: t.creadaAt,
      hubspotEstado,
      hubspotError: llego ? copia!.hubspotError : null,
    };
  });
}

/** Los siguientes pasos de una lista de objetos. Sin las tablas, una lista vacía. */
export async function pasosVigentes(objetos: ReadonlyArray<{ objeto: ObjetoDelPaso; objetoId: string }>): Promise<SiguientePasoVisto[]> {
  if (objetos.length === 0) return [];
  return pasosDe(await resolverParaBuscar(objetos));
}

/** La empresa, sus negocios abiertos y sus proyectos activos, con el siguiente paso de cada equipo. */
export async function pasosDeLaCuenta(clientId: string): Promise<PasosDeLaCuenta | null> {
  const cliente = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true, hubspotCompanyId: true } });
  if (!cliente) return null;
  const [portal, negocios, proyectos] = await Promise.all([
    portalDelSistema().catch(() => null),
    prisma.negocioAbierto
      .findMany({
        where: { clientId, abierto: true },
        select: { id: true, nombre: true, pipelineLabel: true, etapaLabel: true, hubspotDealId: true, siguientePasoHubspot: true, fechaCierre: true },
        orderBy: [{ fechaCierre: { sort: "asc", nulls: "last" } }],
      })
      .catch((e) => {
        if (esquemaDesactualizado(e)) return [];
        throw e;
      }),
    prisma.project.findMany({
      where: proyectoClasificableWhere({ clientId }),
      select: { id: true, name: true, hubspotServiceId: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const objetos: ObjetoDeLaCuenta[] = [
    { objeto: "empresa", objetoId: cliente.id, nombre: cliente.name, detalle: null, hubspotUrl: hubspotCompanyUrl(portal, cliente.hubspotCompanyId), sugerencia: null },
    ...negocios.map((n) => ({
      objeto: "negocio" as const,
      objetoId: n.id,
      nombre: n.nombre,
      detalle: [n.pipelineLabel, n.etapaLabel].filter(Boolean).join(" · ") || null,
      hubspotUrl: hubspotDealUrl(portal, n.hubspotDealId),
      sugerencia: n.siguientePasoHubspot,
    })),
    ...proyectos.map((p) => ({
      objeto: "proyecto" as const,
      objetoId: p.id,
      nombre: p.name,
      detalle: null,
      hubspotUrl: hubspotProjectUrl(portal, p.hubspotServiceId),
      sugerencia: null,
    })),
  ];
  const paraBuscar: ObjetoParaBuscar[] = [
    { objeto: "empresa", objetoId: cliente.id, clientId: cliente.id, enHubspot: !!cliente.hubspotCompanyId },
    ...negocios.map((n) => ({ objeto: "negocio" as const, objetoId: n.id, clientId, hubspotDealId: n.hubspotDealId, enHubspot: !!n.hubspotDealId })),
    ...proyectos.map((p) => ({ objeto: "proyecto" as const, objetoId: p.id, clientId, enHubspot: !!p.hubspotServiceId })),
  ];
  return { objetos, pasos: await pasosDe(paraBuscar), disponible: true };
}

/** La historia de un objeto y equipo: sus últimas tareas, la más reciente primero. */
export async function historiaDelPaso(objeto: ObjetoDelPaso, objetoId: string, equipo: EquipoDelSiguientePaso, limite = 10): Promise<SiguientePasoVisto[]> {
  const [o] = await resolverParaBuscar([{ objeto, objetoId }]);
  if (!o) return [];
  const tareas = await historiaDeTareasDelPaso(
    o.objeto === "empresa" ? { clientIds: o.clientId ? [o.clientId] : [] } : o.objeto === "negocio" ? { hubspotDealIds: o.hubspotDealId ? [o.hubspotDealId] : [] } : { projectIds: [o.objetoId] },
    SPRINT_DEL_PASO[equipo],
    limite,
  );
  const quien = await nombres(tareas.flatMap((t) => [t.responsableEmail ?? "", t.creadaPorEmail ?? ""]));
  return tareas.map((t) => ({
    id: t.id,
    tareaNumero: t.numero,
    tareaVersion: t.version,
    objeto,
    objetoId,
    equipo,
    que: t.titulo,
    fecha: fechaDelPaso(t),
    responsableEmail: t.responsableEmail,
    responsableNombre: t.responsableEmail ? (quien.get(t.responsableEmail) ?? null) : null,
    escritoPor: t.creadaPorEmail ?? "nexus",
    escritoPorNombre: t.creadaPorEmail ? (quien.get(t.creadaPorEmail) ?? null) : "Nexus",
    fuente: fuenteDeLaTarea(t),
    creadoAt: t.creadaAt,
    hubspotEstado: o.enHubspot ? "pendiente" : "sin_hubspot",
    hubspotError: null,
  }));
}
