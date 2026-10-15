/**
 * lib/siguiente-paso/lectura-server.ts — los siguientes pasos vigentes, como los ve la pantalla (2026-10-15, etapa 2
 * de docs/mi-dia-plan.md). SERVER-ONLY. Solo lee la copia de Nexus: nunca le pregunta a HubSpot.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { portalDelSistema } from "@/lib/hubspot/registro-para-vincular";
import { hubspotCompanyUrl, hubspotDealUrl, hubspotProjectUrl } from "@/lib/hubspot/urls";
import { proyectoClasificableWhere } from "@/lib/projects/scope";
import type { EquipoDelSiguientePaso } from "./propiedades";
import type { EstadoEnHubspot, FuenteDelPaso, ObjetoDelPaso, ObjetoDeLaCuenta, PasosDeLaCuenta, SiguientePasoVisto } from "./reglas";

export type { ObjetoDeLaCuenta, PasosDeLaCuenta } from "./reglas";

type Fila = {
  id: string;
  objeto: string;
  objetoId: string;
  equipo: string;
  que: string;
  fecha: Date | null;
  responsableEmail: string | null;
  escritoPor: string;
  fuente: string;
  createdAt: Date;
  hubspotEstado: string;
  hubspotError: string | null;
};

async function aVistos(filas: Fila[]): Promise<SiguientePasoVisto[]> {
  const correos = [...new Set(filas.flatMap((f) => [f.responsableEmail, f.escritoPor]).filter((x): x is string => !!x && x.includes("@")))];
  const nombres = new Map(
    correos.length
      ? (await prisma.teamMember.findMany({ where: { email: { in: correos } }, select: { email: true, name: true } })).map((m) => [m.email, m.name])
      : [],
  );
  return filas.map((f) => ({
    id: f.id,
    objeto: f.objeto as ObjetoDelPaso,
    objetoId: f.objetoId,
    equipo: f.equipo as EquipoDelSiguientePaso,
    que: f.que,
    fecha: f.fecha ? f.fecha.toISOString().slice(0, 10) : null,
    responsableEmail: f.responsableEmail,
    responsableNombre: f.responsableEmail ? (nombres.get(f.responsableEmail) ?? null) : null,
    escritoPor: f.escritoPor,
    escritoPorNombre: f.escritoPor === "hubspot" ? "HubSpot" : (nombres.get(f.escritoPor) ?? null),
    fuente: f.fuente as FuenteDelPaso,
    creadoAt: f.createdAt.toISOString(),
    hubspotEstado: f.hubspotEstado as EstadoEnHubspot,
    hubspotError: f.hubspotError,
  }));
}

/** Los vigentes de una lista de objetos. Sin la tabla (falta el SQL) devuelve una lista vacía. */
export async function pasosVigentes(objetos: ReadonlyArray<{ objeto: ObjetoDelPaso; objetoId: string }>): Promise<SiguientePasoVisto[]> {
  if (objetos.length === 0) return [];
  try {
    const filas = await prisma.siguientePaso.findMany({
      where: { estado: "vigente", OR: objetos.map((o) => ({ objeto: o.objeto, objetoId: o.objetoId })) },
    });
    return aVistos(filas);
  } catch (e) {
    if (esquemaDesactualizado(e)) return [];
    throw e;
  }
}

/** La empresa, sus negocios abiertos y sus proyectos activos, con el siguiente paso vigente de cada equipo. */
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

  try {
    const filas = await prisma.siguientePaso.findMany({
      where: { estado: "vigente", OR: objetos.map((o) => ({ objeto: o.objeto, objetoId: o.objetoId })) },
      orderBy: { createdAt: "desc" },
    });
    return { objetos, pasos: await aVistos(filas), disponible: true };
  } catch (e) {
    if (esquemaDesactualizado(e)) return { objetos, pasos: [], disponible: false };
    throw e;
  }
}

/** La historia de un objeto y equipo: los últimos cambios, el más nuevo primero. */
export async function historiaDelPaso(objeto: ObjetoDelPaso, objetoId: string, equipo: EquipoDelSiguientePaso, limite = 10): Promise<SiguientePasoVisto[]> {
  const filas = await prisma.siguientePaso.findMany({ where: { objeto, objetoId, equipo }, orderBy: { createdAt: "desc" }, take: limite });
  return aVistos(filas);
}
