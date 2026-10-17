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
 * Lo que falta (docs/smartloop-plan.md): guardar cada posición con su fecha cuando el Diagnóstico del ciclo la cierra,
 * para ver la escala en el tiempo ciclo tras ciclo.
 */
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado, modeloDisponible } from "@/lib/db/esquema";
import { fotoDeLaExploracion, type AreaDeLaFoto, type DimensionDeLaFoto } from "./foto-de-la-escala";
import { escalaDeLaExploracion, escalaParaExplorar, estadoDesdeFila } from "./servidor";
import { versionesDeLaEmpresa, type VersionGuardada } from "./versiones-de-la-escala";
import type { Letra } from "@/lib/escala/documento/tipos";

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
      /** Los proyectos de la empresa (para ofrecer dónde posicionarla si no tiene posición). */
      proyectos: { id: string; nombre: string }[];
    }
  | { estado: "sin-escala" };

export async function escalaDeLaEmpresa(clientId: string): Promise<EscalaDeLaEmpresa> {
  const general = await escalaParaExplorar();
  if (general.estado !== "ok") return { estado: "sin-escala" };

  const proyectos = await prisma.project.findMany({
    where: { clientId, status: { not: "completed" } },
    select: { id: true, name: true },
    orderBy: { createdAt: "desc" },
  });
  const deLosProyectos = proyectos.map((p) => ({ id: p.id, nombre: p.name }));
  const vacio = { estado: "ok" as const, niveles: [], posiciones: [], versiones: [], exploraciones: [], proyectos: deLosProyectos };

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
    if (!f.archivadaEn) exploraciones.push({ id: f.id, origen, proyecto, fecha: f.updatedAt.toISOString() });
    // Solo lo confirmado: lo que el agente propone y nadie usó no posiciona a la empresa.
    const foto = fotoDeLaExploracion(escala, estado);
    if (!foto.areas.length) continue;
    posiciones.push({ exploracionId: f.id, origen, proyecto, fecha: f.updatedAt.toISOString(), edicion: foto.edicion, areas: foto.areas });
  }
  if (!niveles.length) niveles = general.general.niveles.map((n) => ({ letra: n.letra, nombre: n.nombre }));

  const versiones = await versionesDeLaEmpresa(clientId);
  return { estado: "ok", niveles, posiciones, versiones, exploraciones, proyectos: deLosProyectos };
}

/**
 * La escala de la empresa para sugerir casos de uso en una propuesta SIN casos elegidos (ficha B, 2026-10-17): solo los
 * niveles de la foto más reciente (lo confirmado), sin las frases ni el porqué. null = la empresa no está posicionada.
 */
export async function escalaParaLaPropuesta(clientId: string): Promise<AreaDeLaFoto[] | null> {
  const r = await escalaDeLaEmpresa(clientId);
  if (r.estado !== "ok") return null;
  const areas = r.posiciones[0]?.areas ?? r.versiones[0]?.foto.areas ?? null;
  if (!areas?.length) return null;
  return areas.map((a) => ({ ...a, dimensiones: a.dimensiones.map((d) => ({ ...d, cita: null, porQue: null })) }));
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
