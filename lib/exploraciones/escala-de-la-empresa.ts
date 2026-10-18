import "server-only";

/**
 * lib/exploraciones/escala-de-la-empresa.ts — LA ESCALA DE LA EMPRESA: dónde está en cada área, con la fecha y de dónde sale
 * (2026-10-12, pedido de Elías: «una sección general que sirva para las empresas que no vienen de preventa, o para
 * clientes que no están posicionados»). Es La cuenta › La escala.
 *
 * Primera versión: junta lo que ya existe, sin tabla nueva. Las posiciones salen de las exploraciones de la empresa —la
 * preventa y la de cada proyecto (La escala de la exploración, que es donde el CSE confirma cada nivel con su
 * evidencia)—, con la fecha de su última actualización. Un nivel propuesto por el agente que nadie confirmó no cuenta;
 * uno confirmado que salió del test o de una hipótesis cuenta como hipótesis, y se dice.
 *
 * Desde el 2026-10-18 («Actualizar escala»): sobre qué se puede ubicar la empresa (cada proyecto, la preventa o la cuenta
 * entera), sus ventas ganadas, lo que propuso el agente en cada exploración (para usarlo acá mismo, por el PATCH de la
 * exploración) y con qué edición y perfil se mide cada una, y por qué. Ver lib/exploraciones/posicionar.ts.
 */
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado, modeloDisponible } from "@/lib/db/esquema";
import { fotoDeLaExploracion, type AreaDeLaFoto, type DimensionDeLaFoto } from "./foto-de-la-escala";
import { escalaDeLaExploracion, escalaParaExplorar, estadoDesdeFila } from "./servidor";
import { versionesDeLaEmpresa, type VersionGuardada } from "./versiones-de-la-escala";
import type { Letra } from "@/lib/escala/documento/tipos";
import { resolvePipeline, SENTINEL_SERVICE_TYPE } from "@/lib/projects/kind";
import { industriaLegible } from "./industria";
import { hoyEnCostaRica } from "./fechas";
import {
  fechaDelMomento,
  modeloDeNegocio,
  nivelesPropuestos,
  objetivosParaUbicar,
  type ModeloDeNegocio,
  type MomentoDeLaVersion,
  type NivelPropuesto,
  type ObjetivoDeUbicacion,
  type VentaParaUbicar,
} from "./posicionar";
import { ventasDeLaEmpresa } from "./posicionar-fuentes";

/** Una dimensión de la empresa: su nivel y de dónde sale (la foto de lo confirmado). */
export type DimensionDeLaEmpresa = DimensionDeLaFoto;
export type AreaDeLaEmpresa = AreaDeLaFoto;

export interface PosicionDeLaEmpresa {
  /** De qué exploración sale. */
  exploracionId: string;
  origen: "preventa" | "proyecto";
  /** El proyecto de la exploración (null en la preventa). */
  proyecto: { id: string; nombre: string } | null;
  /** Cuándo se tocó por última vez (ISO). */
  fecha: string;
  edicion: string | null;
  areas: AreaDeLaEmpresa[];
}

/** Una exploración viva de la empresa: desde ahí se regenera la escala con el agente. */
export interface ExploracionDeLaEmpresa {
  id: string;
  origen: "preventa" | "proyecto";
  proyecto: { id: string; nombre: string } | null;
  fecha: string;
  /** Es la de «Información del cliente»: la cuenta entera, sin un proyecto en particular. */
  esLaCuenta: boolean;
  /** Para usar lo propuesto acá, por el PATCH de la exploración (concurrencia optimista). */
  version: number;
  /** Lo que propuso el agente y nadie usó ni descartó, con su porqué y su fuente. */
  propuestos: NivelPropuesto[];
  /** Con qué edición y perfil se mide, y por qué. */
  modelo: ModeloDeNegocio;
}

/** Una venta ganada de la empresa, para elegir sobre cuál se ubica. */
export interface VentaDeLaEmpresa {
  id: string;
  nombre: string;
  fechaCierre: string;
  monto: number | null;
  moneda: string;
}

export type EscalaDeLaEmpresa =
  | {
      estado: "ok";
      niveles: { letra: Letra; nombre: string }[];
      /** De la más reciente a la más vieja; solo las que tienen algún nivel. Es la escala de HOY de cada exploración. */
      posiciones: PosicionDeLaEmpresa[];
      /** Las versiones guardadas (la escala en el tiempo), de la más nueva a la más vieja. */
      versiones: VersionGuardada[];
      /** Las exploraciones vivas (aunque todavía no tengan niveles): desde ahí se regenera. */
      exploraciones: ExploracionDeLaEmpresa[];
      /** Los proyectos de la empresa, sin el contenedor (para nombrarlos). */
      proyectos: { id: string; nombre: string }[];
      /** Sobre qué se puede ubicar la empresa, y cuál se sugiere. */
      objetivos: ObjetivoDeUbicacion[];
      porDefecto: string;
      /** El contenedor «Información del cliente», si existe: una versión de él es de la cuenta entera. */
      contenedorId: string | null;
      ventas: VentaDeLaEmpresa[];
      /** Las ediciones publicadas, para corregir con un clic (cualquiera: el código no las nombra). */
      ediciones: { slug: string; nombre: string }[];
    }
  | { estado: "sin-escala" };

export async function escalaDeLaEmpresa(clientId: string): Promise<EscalaDeLaEmpresa> {
  const general = await escalaParaExplorar();
  if (general.estado !== "ok") return { estado: "sin-escala" };

  const [proyectos, cliente, ventas] = await Promise.all([
    prisma.project.findMany({
      where: { clientId },
      select: { id: true, name: true, status: true, serviceType: true, hubspotDealId: true, hubspotPipelineId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.client.findUnique({ where: { id: clientId }, select: { industry: true } }),
    ventasDeLaEmpresa(clientId).catch(() => []),
  ]);
  const contenedor = proyectos.find((p) => p.serviceType === SENTINEL_SERVICE_TYPE) ?? null;
  const deLosProyectos = proyectos.filter((p) => p !== contenedor).map((p) => ({ id: p.id, nombre: p.name }));
  const ediciones = general.general.ediciones.map((e) => ({ slug: e.slug, nombre: e.nombre }));
  const deLasVentas = ventas.map((v) => ({ id: v.id, nombre: v.nombre, fechaCierre: v.fechaCierre, monto: v.monto, moneda: v.moneda }));
  const armarObjetivos = (vivas: ReadonlyMap<string, string>, preventa: string | null) =>
    objetivosParaUbicar({
      proyectos: proyectos.map((p) => ({
        id: p.id,
        nombre: p.name,
        status: p.status,
        contenedor: p === contenedor,
        hubspotDealId: p.hubspotDealId,
        servicio: resolvePipeline(p.hubspotPipelineId)?.servicioRecurrente ? (resolvePipeline(p.hubspotPipelineId)?.label ?? null) : null,
        exploracionId: vivas.get(p.id) ?? null,
        creadoEn: p.createdAt.toISOString(),
      })),
      preventa: preventa ? { exploracionId: preventa } : null,
      ventas,
    });
  const sinExploraciones = armarObjetivos(new Map(), null);
  const vacio = {
    estado: "ok" as const,
    niveles: [],
    posiciones: [],
    versiones: [],
    exploraciones: [],
    proyectos: deLosProyectos,
    objetivos: sinExploraciones.objetivos,
    porDefecto: sinExploraciones.porDefecto,
    contenedorId: contenedor?.id ?? null,
    ventas: deLasVentas,
    ediciones,
  };

  if (!modeloDisponible(prisma.exploracionDeVenta)) return vacio;

  let filas;
  try {
    // La preventa y las exploraciones de cada proyecto de esta empresa: TODAS son de la empresa (clientId).
    filas = await prisma.exploracionDeVenta.findMany({
      where: { clientId },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: {
        id: true,
        projectId: true,
        edicion: true,
        perfilCierre: true,
        perfilDespues: true,
        areas: true,
        contenido: true,
        propuesta: true,
        responsableEmail: true,
        archivadaEn: true,
        updatedAt: true,
        version: true,
        project: { select: { id: true, name: true } },
      },
    });
  } catch (e) {
    if (esquemaDesactualizado(e)) return vacio;
    throw e;
  }

  let niveles: { letra: Letra; nombre: string }[] = [];
  const posiciones: PosicionDeLaEmpresa[] = [];
  const exploraciones: ExploracionDeLaEmpresa[] = [];
  for (const f of filas) {
    const estado = estadoDesdeFila(f);
    const escala = escalaDeLaExploracion(general.general, estado);
    if (!niveles.length) niveles = escala.niveles;
    const origen = f.projectId ? ("proyecto" as const) : ("preventa" as const);
    const proyecto = f.project ? { id: f.project.id, nombre: f.project.name } : null;
    if (!f.archivadaEn) {
      exploraciones.push({
        id: f.id,
        origen,
        proyecto,
        fecha: f.updatedAt.toISOString(),
        esLaCuenta: !!contenedor && f.projectId === contenedor.id,
        version: f.version,
        propuestos: nivelesPropuestos(estado, escala),
        modelo: modeloDeNegocio({
          edicion: general.general.ediciones.find((e) => e.slug === estado.edicion) ?? null,
          cierre: estado.perfilCierre,
          despues: estado.perfilDespues,
          elegida: estado.contenido.edicionElegida,
          industria: industriaLegible(cliente?.industry),
        }),
      });
    }
    // Solo lo confirmado: lo que el agente propone y nadie usó no posiciona a la empresa.
    const foto = fotoDeLaExploracion(escala, estado);
    if (!foto.areas.length) continue;
    posiciones.push({ exploracionId: f.id, origen, proyecto, fecha: f.updatedAt.toISOString(), edicion: foto.edicion, areas: foto.areas });
  }
  if (!niveles.length) niveles = general.general.niveles.map((n) => ({ letra: n.letra, nombre: n.nombre }));

  const versiones = await versionesDeLaEmpresa(clientId);
  const vivas = new Map(exploraciones.filter((e) => e.proyecto).map((e) => [e.proyecto!.id, e.id]));
  const preventa = exploraciones.find((e) => e.origen === "preventa")?.id ?? null;
  const { objetivos, porDefecto } = armarObjetivos(vivas, preventa);
  return {
    estado: "ok",
    niveles,
    posiciones,
    versiones,
    exploraciones,
    proyectos: deLosProyectos,
    objetivos,
    porDefecto,
    contenedorId: contenedor?.id ?? null,
    ventas: deLasVentas,
    ediciones,
  };
}

/**
 * La escala de la empresa para sugerir casos de uso en una propuesta SIN casos elegidos (ficha B, 2026-10-17): solo los
 * niveles de la foto más reciente (lo confirmado), sin las frases ni el porqué. null = la empresa no está posicionada.
 */
export async function escalaParaLaPropuesta(clientId: string): Promise<AreaDeLaFoto[] | null> {
  const r = await escalaDeLaEmpresa(clientId);
  if (r.estado !== "ok") return null;
  // Solo de una exploración viva: una archivada (una preventa vieja, un proyecto que se cerró) no dice dónde está hoy.
  const vivas = new Set(r.exploraciones.map((e) => e.id));
  const areas =
    r.posiciones.find((p) => vivas.has(p.exploracionId))?.areas ??
    r.versiones.find((v) => !v.exploracionId || vivas.has(v.exploracionId))?.foto.areas ??
    null;
  if (!areas?.length) return null;
  return areas.map((a) => ({ ...a, dimensiones: a.dimensiones.map((d) => ({ ...d, cita: null, porQue: null })) }));
}

/**
 * El día de la posición de una versión que se guarda («al vender», «al arrancar» u «hoy»). El arranque es el del
 * cronograma del proyecto de la exploración (o, sin él, su alta). Sin una venta elegida, «al vender» es la del trato de
 * HubSpot del proyecto: la misma que amarra la versión (versiones-de-la-escala.ts).
 */
export async function diaDelMomento(
  clientId: string,
  exploracionId: string,
  momento: MomentoDeLaVersion,
  o: { venta: VentaParaUbicar | null; elegida: boolean },
): Promise<ReturnType<typeof fechaDelMomento>> {
  const exp = await prisma.exploracionDeVenta.findFirst({
    where: { id: exploracionId, clientId },
    select: { project: { select: { createdAt: true, hubspotDealId: true, timeline: { select: { anchorStartDate: true } } } } },
  });
  const p = exp?.project ?? null;
  const arranque = p ? (p.timeline?.anchorStartDate ?? p.createdAt).toISOString() : null;
  const venta = o.venta ?? (!o.elegida && p?.hubspotDealId ? ((await ventasDeLaEmpresa(clientId)).find((x) => x.hubspotDealId === p.hubspotDealId) ?? null) : null);
  return fechaDelMomento(momento, { venta, arranque, hoy: hoyEnCostaRica() });
}

/**
 * ¿La exploración (o el proyecto) es de ESTA empresa? La ruta de La cuenta › La escala responde 404 si no: un id de
 * otra empresa no se regenera ni se guarda desde acá.
 */
export async function esDeLaEmpresa(clientId: string, o: { exploracionId?: string; projectId?: string }): Promise<boolean> {
  try {
    if (o.exploracionId) {
      if (!modeloDisponible(prisma.exploracionDeVenta)) return false;
      return !!(await prisma.exploracionDeVenta.findFirst({ where: { id: o.exploracionId, clientId }, select: { id: true } }));
    }
    if (o.projectId) return !!(await prisma.project.findFirst({ where: { id: o.projectId, clientId }, select: { id: true } }));
    return false;
  } catch (e) {
    if (esquemaDesactualizado(e)) return false;
    throw e;
  }
}
