/**
 * lib/ventas/cartera-server.ts — lo que ve un vendedor en «Para ti» (2026-10-14, etapa 1 de docs/mi-dia-plan.md).
 * SERVER-ONLY.
 *
 * La cartera de un vendedor (decisión de Elías): las empresas donde es dueño en HubSpot, más las empresas donde tiene
 * un negocio abierto aunque no sea dueño de la empresa. Sale de la copia (`NegocioAbierto` y `Client.hubspotOwnerEmail`):
 * no le pregunta nada a HubSpot.
 *
 * ⚠ «Dueño de la empresa» se mira solo en las empresas que están en Nexus: un vendedor es dueño de miles de empresas
 * en HubSpot (Andrés, 8.844 el 2026-10-14) y casi todas son contactos de prospección. Las de Nexus son las que se
 * trabajan.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { portalDelSistema } from "@/lib/hubspot/registro-para-vincular";
import { hubspotDealUrl } from "@/lib/hubspot/urls";
import { metasPorPersona } from "./metas";
import { pasosVigentes } from "@/lib/siguiente-paso/lectura-server";
import type { SiguientePasoVisto } from "@/lib/siguiente-paso/reglas";
import {
  empresaDesdeElNombre,
  empresasDeLaCartera,
  ponderadoDelAnio,
  type EmpresaDeCartera,
  type NegocioVisto,
  type Ponderado,
  type PropuestaDeCierre,
  type TipoDeEmpresa,
} from "./negocios";

export interface MetaVista {
  monto: number;
  moneda: string;
  avance: number | null;
  cumplimiento: number | null;
  nombres: string[];
}

export interface VistaDeVentas {
  negocios: Array<NegocioVisto & { hubspotUrl: string | null }>;
  /** Las empresas de la cartera con sus negocios juntos (las vistas las arma la pantalla, con sus filtros). */
  empresas: EmpresaDeCartera[];
  /** Cuántas son empresas de Nexus de las que la persona es dueña en HubSpot. */
  propias: number;
  meta: MetaVista | null;
  ponderado: Ponderado;
  anio: number;
  /** ISO: la última copia de los negocios. */
  copiadoAt: string | null;
}

export type ResultadoDeVentas =
  | { estado: "ok"; vista: VistaDeVentas }
  /** La persona no tiene negocios abiertos, empresas propias ni meta: no hay nada que mostrarle. */
  | { estado: "nada" }
  /** Falta aplicar scripts/sql/2026-10-14-negocios-abiertos.sql. */
  | { estado: "sin-tabla" };

const DIAS_DE_REUNIONES = 180;

function aNegocioVisto(
  n: {
    id: string;
    hubspotDealId: string;
    nombre: string;
    pipelineLabel: string | null;
    pipelineId: string;
    etapaLabel: string | null;
    etapaId: string;
    probabilidad: number | null;
    fechaCierre: Date | null;
    monto: unknown;
    moneda: string;
    siguientePasoHubspot: string | null;
    proximaActividadAt: Date | null;
    ultimaActividadAt: Date | null;
    empresaNombre: string | null;
    clientId: string | null;
    hubspotCompanyId: string | null;
    preguntaPospuestaHasta: Date | null;
    propuesta: unknown;
    client: { name: string; kind: string } | null;
  },
  ultimaReunion: string | null,
): NegocioVisto {
  return {
    id: n.id,
    hubspotDealId: n.hubspotDealId,
    nombre: n.nombre,
    pipeline: n.pipelineLabel ?? n.pipelineId,
    etapa: n.etapaLabel ?? n.etapaId,
    probabilidad: n.probabilidad,
    fechaCierre: n.fechaCierre ? n.fechaCierre.toISOString().slice(0, 10) : null,
    monto: n.monto === null || n.monto === undefined ? null : Number(n.monto),
    moneda: n.moneda,
    siguientePasoHubspot: n.siguientePasoHubspot,
    proximaActividad: n.proximaActividadAt?.toISOString() ?? null,
    ultimaActividad: n.ultimaActividadAt?.toISOString() ?? null,
    ultimaReunion,
    empresa: n.client?.name ?? n.empresaNombre ?? empresaDesdeElNombre(n.nombre),
    sinEmpresa: !n.hubspotCompanyId,
    tipoDeEmpresa: tipoDe(n.client?.kind),
    clientId: n.clientId,
    hubspotCompanyId: n.hubspotCompanyId,
    pospuestaHasta: n.preguntaPospuestaHasta?.toISOString() ?? null,
    propuesta: (n.propuesta as PropuestaDeCierre | null) ?? null,
  };
}

function tipoDe(kind: string | null | undefined): TipoDeEmpresa {
  if (!kind) return null;
  return kind === "CLIENTE" || kind === "PROSPECTO" ? kind : "OTRO";
}

/** La última reunión de Nexus de cada cliente (por `resolvedClientId`, la fuente única de a quién es la reunión). */
async function ultimasReuniones(clientIds: string[], ahora: Date): Promise<Map<string, string>> {
  if (clientIds.length === 0) return new Map();
  const filas = await prisma.firefliesSession.groupBy({
    by: ["resolvedClientId"],
    where: {
      resolvedClientId: { in: clientIds },
      date: { lte: ahora, gte: new Date(ahora.getTime() - DIAS_DE_REUNIONES * 86_400_000) },
    },
    _max: { date: true },
  });
  return new Map(
    filas.filter((f) => f.resolvedClientId && f._max.date).map((f) => [f.resolvedClientId!, f._max.date!.toISOString()]),
  );
}

export async function vistaDeVentas(
  persona: { id: string; email: string },
  ahora: Date,
  hoyISO: string,
): Promise<ResultadoDeVentas> {
  const email = persona.email.toLowerCase();
  const anio = Number(hoyISO.slice(0, 4));
  let filas;
  let propias;
  try {
    [filas, propias] = await Promise.all([
      prisma.negocioAbierto.findMany({
        where: { abierto: true, vendedorId: persona.id },
        include: { client: { select: { name: true, kind: true } } },
      }),
      prisma.client.findMany({
        where: { hubspotOwnerEmail: { equals: email, mode: "insensitive" }, kind: { in: ["CLIENTE", "PROSPECTO"] } },
        select: { id: true, name: true, hubspotCompanyId: true, kind: true },
      }),
    ]);
  } catch (e) {
    if (esquemaDesactualizado(e)) return { estado: "sin-tabla" };
    throw e;
  }

  const meta = await metasPorPersona(anio)
    .then((ms) => ms.find((m) => m.teamMemberId === persona.id) ?? null)
    .catch(() => null);
  if (filas.length === 0 && propias.length === 0 && !meta) return { estado: "nada" };

  const clientIds = [...new Set([...filas.map((f) => f.clientId).filter((x): x is string => !!x), ...propias.map((p) => p.id)])];
  const [reuniones, portal, copia, pasos] = await Promise.all([
    ultimasReuniones(clientIds, ahora),
    portalDelSistema().catch(() => null),
    prisma.negocioAbierto.aggregate({ _max: { sincronizadoEn: true } }),
    // El siguiente paso vigente de cada equipo, de los negocios y de las empresas (etapa 2).
    pasosVigentes([
      ...filas.map((f) => ({ objeto: "negocio" as const, objetoId: f.id })),
      ...clientIds.map((id) => ({ objeto: "empresa" as const, objetoId: id })),
    ]),
  ]);
  const pasosDe = new Map<string, SiguientePasoVisto[]>();
  for (const p of pasos) {
    const k = `${p.objeto}:${p.objetoId}`;
    pasosDe.set(k, [...(pasosDe.get(k) ?? []), p]);
  }

  const negocios = filas.map((f) => ({
    ...aNegocioVisto(f, f.clientId ? (reuniones.get(f.clientId) ?? null) : null),
    pasos: pasosDe.get(`negocio:${f.id}`) ?? [],
    hubspotUrl: hubspotDealUrl(portal, f.hubspotDealId),
  }));
  const empresas = empresasDeLaCartera(
    negocios,
    propias.map((p) => ({
      clientId: p.id,
      nombre: p.name,
      hubspotCompanyId: p.hubspotCompanyId,
      tipo: tipoDe(p.kind),
      ultimaReunion: reuniones.get(p.id) ?? null,
    })),
    hoyISO,
    ahora,
  );
  for (const e of empresas) if (e.clientId) e.pasos = pasosDe.get(`empresa:${e.clientId}`) ?? [];

  return {
    estado: "ok",
    vista: {
      negocios,
      empresas,
      propias: propias.length,
      meta: meta
        ? { monto: meta.monto, moneda: meta.moneda, avance: meta.avance, cumplimiento: meta.cumplimiento, nombres: meta.metas }
        : null,
      ponderado: ponderadoDelAnio(negocios, anio),
      anio,
      copiadoAt: copia._max.sincronizadoEn?.toISOString() ?? null,
    },
  };
}
