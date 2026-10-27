import "server-only";

/**
 * lib/escala/prueba/servidor.ts — PROBAR LA ESCALA CON CUALQUIER EMPRESA (N2, 2026-10-26). SERVIDOR.
 *
 * Lo que lee la base para la prueba: la escala con que se prueba (la publicada, por defecto, o el borrador), las
 * exploraciones vivas de la empresa (la preventa, la de cada proyecto y la de la cuenta entera) y lo ya probado. El
 * nivel de cada área lo arma lib/escala/prueba/calculo.ts con el mismo chequeo del mapa. Es el ÚNICO escritor de
 * `PruebaDeLaEscala`: el nivel de la escala lo recalcula acá, nunca lo toma del navegador.
 *
 * Con el borrador, los niveles de cada dimensión son los mismos de la exploración (los estimó una persona o el agente
 * con la escala publicada); lo que cambia es cómo se juntan: qué dimensiones hay y aplican al perfil, las capas y el
 * orden. El borrador solo lo ve quien ya lo ve en Escala › Borrador. Ver DECISIONS «Probar la escala con cualquier
 * empresa».
 */
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado, modeloDisponible } from "@/lib/db/esquema";
import { accessibleClientWhere } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions/engine";
import type { AppUserWithTeamMember } from "@/lib/auth/supabase";
import type { Prisma } from "@prisma/client";
import { encargadoDe, nombresDelEquipo } from "@/lib/cuentas/encargado-server";
import { escalaDelBorrador } from "@/lib/escala/datos/servidor";
import { leerEscalaVigente } from "@/lib/escala/documento/vigente";
import type { Escala, Letra } from "@/lib/escala/documento/tipos";
import { industriaLegible } from "@/lib/exploraciones/industria";
import { escalaDeLaExploracion, estadoDesdeFila } from "@/lib/exploraciones/servidor";
import { SENTINEL_SERVICE_TYPE } from "@/lib/projects/kind";
import {
  decidirLaComparacion,
  elegirLaFuente,
  empresaExcluida,
  LETRAS_DE_LA_PRUEBA,
  nivelesDeLaPrueba,
  resumenDeLasPruebas,
  type AreaDeLaPrueba,
  type DecisionDeGuardar,
  type FilaDePrueba,
  type ResumenDeUnaVersion,
} from "./calculo";

export const SQL_DE_LAS_PRUEBAS = "scripts/sql/2026-10-26-prueba-de-la-escala.sql";

/** Con qué escala se prueba: la publicada (por defecto) o el borrador de la próxima. */
export const CON_QUE_ESCALA = ["publicada", "borrador"] as const;
export type ConQueEscala = (typeof CON_QUE_ESCALA)[number];

interface EscalaParaProbar {
  escala: Escala;
  version: string;
  esBorrador: boolean;
  /** La revisión del borrador (null en la publicada). */
  revision: number | null;
}

/**
 * La escala con que se prueba y qué versiones se pueden elegir. El borrador solo lo ve quien ya lo ve en Escala ›
 * Borrador (`puedeEditarLaEscala`: los super admin); para los demás, «borrador» no existe y se prueba con la publicada.
 */
async function lasEscalas(
  con: ConQueEscala,
  puedeVerElBorrador: boolean,
): Promise<{ escala: EscalaParaProbar | null; con: ConQueEscala; versiones: { publicada: string | null; borrador: string | null } }> {
  const [v, b] = await Promise.all([leerEscalaVigente(), puedeVerElBorrador ? escalaDelBorrador() : Promise.resolve(null)]);
  const publicada: EscalaParaProbar | null = v.estado === "ok" ? { escala: v.escala, version: v.escala.version, esBorrador: false, revision: null } : null;
  const borrador: EscalaParaProbar | null = b ? { escala: b.escala, version: b.version, esBorrador: true, revision: b.revision } : null;
  const versiones = { publicada: publicada?.version ?? null, borrador: borrador?.version ?? null };
  if (con === "borrador" && puedeVerElBorrador) return { escala: borrador, con: "borrador", versiones };
  return { escala: publicada, con: "publicada", versiones };
}

/** Una exploración viva de la empresa, de donde salen los niveles. */
export interface FuenteDeLaPrueba {
  exploracionId: string;
  titulo: string;
  /** Cuándo se tocó por última vez (ISO). */
  fecha: string;
  /** En cuántas áreas da un nivel con esta escala. */
  areasConNivel: number;
}

export interface Persona {
  email: string;
  nombre: string;
}

export type PruebaDeLaEmpresa =
  | { estado: "excluida"; empresa: { id: string; nombre: string } }
  | { estado: "no-existe" }
  | {
      estado: "ok";
      empresa: { id: string; nombre: string; industria: string | null };
      con: ConQueEscala;
      /** null si no hay escala con que probar (sin publicar, o se pidió el borrador y no hay). */
      version: string | null;
      /** La revisión del borrador con que se mide (null con la publicada). */
      revision: number | null;
      versiones: { publicada: string | null; borrador: string | null };
      fuentes: FuenteDeLaPrueba[];
      /** La exploración elegida; null si la empresa no tiene ninguna viva. */
      fuente: string | null;
      edicion: string | null;
      niveles: { letra: Letra; nombre: string }[];
      areas: AreaDeLaPrueba[];
      /** Quién puede decir dónde cree que está: quien prueba y el CSE de la cuenta. */
      quienes: Persona[];
      /** Lo ya probado con esta empresa, de lo más nuevo a lo más viejo. */
      historial: FilaDePrueba[];
      /** Falta aplicar el SQL: se puede mirar, no guardar. */
      sinTabla: boolean;
    };

const SELECT_EXPLORACION = {
  id: true,
  projectId: true,
  contenido: true,
  propuesta: true,
  areas: true,
  edicion: true,
  perfilCierre: true,
  perfilDespues: true,
  responsableEmail: true,
  archivadaEn: true,
  updatedAt: true,
  project: { select: { name: true, serviceType: true } },
} as const;

function tituloDe(f: { projectId: string | null; project: { name: string; serviceType: string | null } | null }): string {
  if (!f.projectId || !f.project) return "La preventa";
  if (f.project.serviceType === SENTINEL_SERVICE_TYPE) return "La cuenta entera";
  return `Proyecto «${f.project.name}»`;
}

const SELECT_PRUEBA = {
  id: true,
  clientId: true,
  areaId: true,
  areaNombre: true,
  escalaVersion: true,
  esBorrador: true,
  revisionDelBorrador: true,
  nivelDeLaEscala: true,
  nivelQueCree: true,
  creePorEmail: true,
  registradoPorEmail: true,
  createdAt: true,
  client: { select: { name: true, industry: true } },
} satisfies Prisma.PruebaDeLaEscalaSelect;

type FilaDeLaBase = Prisma.PruebaDeLaEscalaGetPayload<{ select: typeof SELECT_PRUEBA }>;

const esLetra = (s: string): s is Letra => (LETRAS_DE_LA_PRUEBA as readonly string[]).includes(s);

function aFila(f: FilaDeLaBase): FilaDePrueba | null {
  if (!esLetra(f.nivelDeLaEscala) || !esLetra(f.nivelQueCree)) return null;
  return {
    id: f.id,
    clientId: f.clientId,
    empresa: f.client.name,
    industria: industriaLegible(f.client.industry),
    areaId: f.areaId,
    areaNombre: f.areaNombre,
    escalaVersion: f.escalaVersion,
    esBorrador: f.esBorrador,
    revision: f.esBorrador ? f.revisionDelBorrador : null,
    nivelDeLaEscala: f.nivelDeLaEscala,
    nivelQueCree: f.nivelQueCree,
    creePorEmail: f.creePorEmail,
    registradoPorEmail: f.registradoPorEmail,
    en: f.createdAt.toISOString(),
  };
}

/** Lo ya probado con una empresa. `sinTabla` si falta el SQL. */
async function historialDe(clientId: string): Promise<{ filas: FilaDePrueba[]; sinTabla: boolean }> {
  if (!modeloDisponible(prisma.pruebaDeLaEscala)) return { filas: [], sinTabla: true };
  try {
    const filas = await prisma.pruebaDeLaEscala.findMany({ where: { clientId }, orderBy: { createdAt: "desc" }, take: 60, select: SELECT_PRUEBA });
    return { filas: filas.map(aFila).filter((f): f is FilaDePrueba => !!f), sinTabla: false };
  } catch (e) {
    if (esquemaDesactualizado(e)) return { filas: [], sinTabla: true };
    throw e;
  }
}

/**
 * La prueba de una empresa: con qué escala, de qué exploración salen los niveles (la elegida o, sin elegir, la más
 * reciente que da algún nivel) y el nivel de cada área. La ruta ya pidió acceso al cliente.
 */
export async function pruebaDeLaEmpresa(
  clientId: string,
  o: { con: ConQueEscala; exploracionId?: string | null; yo: Persona; puedeVerElBorrador: boolean },
): Promise<PruebaDeLaEmpresa> {
  const cliente = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true, industry: true } });
  if (!cliente) return { estado: "no-existe" };
  if (empresaExcluida(cliente.name)) return { estado: "excluida", empresa: { id: cliente.id, nombre: cliente.name } };

  const [escalas, filas, historial, cse] = await Promise.all([
    lasEscalas(o.con, o.puedeVerElBorrador),
    modeloDisponible(prisma.exploracionDeVenta)
      ? prisma.exploracionDeVenta
          .findMany({ where: { clientId, archivadaEn: null }, orderBy: { updatedAt: "desc" }, take: 20, select: SELECT_EXPLORACION })
          .catch((e) => {
            if (esquemaDesactualizado(e)) return [];
            throw e;
          })
      : Promise.resolve([]),
    historialDe(clientId),
    encargadoDe(clientId).catch(() => null),
  ]);

  const laDeHoy = escalas.escala;
  const quienes: Persona[] = [o.yo];
  if (cse?.email && cse.email !== o.yo.email.toLowerCase()) quienes.push({ email: cse.email, nombre: cse.nombre ?? cse.email });

  const calculadas = filas.map((f) => {
    const estado = estadoDesdeFila(f);
    const escala = laDeHoy ? escalaDeLaExploracion(laDeHoy.escala, estado) : null;
    const areas = escala ? nivelesDeLaPrueba(escala, estado) : [];
    return { f, escala, areas, exploracionId: f.id };
  });
  const fuentes: FuenteDeLaPrueba[] = calculadas.map(({ f, areas }) => ({
    exploracionId: f.id,
    titulo: tituloDe(f),
    fecha: f.updatedAt.toISOString(),
    areasConNivel: areas.filter((a) => a.nivel).length,
  }));
  const elegida = elegirLaFuente(calculadas, o.exploracionId);

  return {
    estado: "ok",
    empresa: { id: cliente.id, nombre: cliente.name, industria: industriaLegible(cliente.industry) },
    con: escalas.con,
    version: laDeHoy?.version ?? null,
    revision: laDeHoy?.revision ?? null,
    versiones: escalas.versiones,
    fuentes,
    fuente: elegida?.f.id ?? null,
    edicion: elegida?.escala?.edicion?.nombre ?? null,
    niveles: (elegida?.escala?.niveles ?? laDeHoy?.escala.niveles ?? []).map((n) => ({ letra: n.letra, nombre: n.nombre })),
    areas: elegida?.areas ?? [],
    quienes,
    historial: historial.filas,
    sinTabla: historial.sinTabla,
  };
}

export type ResultadoDeGuardar = Exclude<DecisionDeGuardar, { estado: "entra" }> | { estado: "guardada"; fila: FilaDePrueba } | { estado: "sin-tabla" };

/**
 * Guarda una comparación. El nivel de la escala se recalcula acá con la misma exploración y la misma escala: lo que
 * diga el navegador no cuenta. Quién decide si entra: `decidirLaComparacion` (calculo.ts, con sus pruebas).
 */
export async function guardarPrueba(args: {
  clientId: string;
  exploracionId: string;
  con: ConQueEscala;
  areaId: string;
  nivelQueCree: Letra;
  creePorEmail: string;
  yo: Persona;
  puedeVerElBorrador: boolean;
  nota: string | null;
}): Promise<ResultadoDeGuardar> {
  if (!modeloDisponible(prisma.pruebaDeLaEscala)) return { estado: "sin-tabla" };
  if (args.con === "borrador" && !args.puedeVerElBorrador) return { estado: "no-existe", que: "No hay un borrador de la escala a la vista." };
  const p = await pruebaDeLaEmpresa(args.clientId, { con: args.con, exploracionId: args.exploracionId, yo: args.yo, puedeVerElBorrador: args.puedeVerElBorrador });
  if (p.estado === "no-existe") return { estado: "no-existe", que: "Esa empresa no existe." };
  if (p.estado === "excluida") return { estado: "excluida" };
  const d = decidirLaComparacion({
    excluida: false,
    fuente: p.fuente,
    exploracionPedida: args.exploracionId,
    version: p.version,
    areas: p.areas,
    areaId: args.areaId,
    quienes: p.quienes,
    creePorEmail: args.creePorEmail,
  });
  if (d.estado !== "entra") return d;
  const area = d.area;
  const fuente = p.fuentes.find((f) => f.exploracionId === args.exploracionId);
  try {
    const fila = await prisma.pruebaDeLaEscala.create({
      data: {
        clientId: args.clientId,
        exploracionId: args.exploracionId,
        areaId: area.id,
        areaNombre: area.nombre,
        escalaVersion: p.version as string,
        esBorrador: p.con === "borrador",
        revisionDelBorrador: p.con === "borrador" ? p.revision : null,
        edicion: p.edicion,
        nivelDeLaEscala: area.nivel,
        nivelQueCree: args.nivelQueCree,
        creePorEmail: d.creePorEmail,
        registradoPorEmail: args.yo.email.toLowerCase(),
        detalle: {
          fuente: fuente?.titulo ?? null,
          aplican: area.aplican,
          conEvidencia: area.conEvidencia,
          hipotesis: area.hipotesis,
          propuestas: area.propuestas,
        },
        nota: args.nota?.trim() || null,
      },
      select: SELECT_PRUEBA,
    });
    const out = aFila(fila);
    if (!out) throw new Error("La fila guardada no tiene un nivel válido.");
    return { estado: "guardada", fila: out };
  } catch (e) {
    if (esquemaDesactualizado(e)) return { estado: "sin-tabla" };
    throw e;
  }
}

export type ResumenDeLaPrueba =
  | {
      estado: "ok";
      versiones: ResumenDeUnaVersion[];
      /** Los nombres de los niveles de la escala publicada, como los dice la pantalla de cada empresa. */
      niveles: { letra: Letra; nombre: string }[];
      /** correo → nombre del equipo, para decir quién cree cada nivel. */
      nombres: Record<string, string>;
    }
  | { estado: "sin-tabla" };

/** Lo que ven los super admin: todas las pruebas, por versión de la escala. */
export async function resumenDeLaPrueba(): Promise<ResumenDeLaPrueba> {
  if (!modeloDisponible(prisma.pruebaDeLaEscala)) return { estado: "sin-tabla" };
  try {
    const [filas, vigente, equipo] = await Promise.all([
      prisma.pruebaDeLaEscala.findMany({ orderBy: { createdAt: "desc" }, take: 2000, select: SELECT_PRUEBA }),
      leerEscalaVigente(),
      nombresDelEquipo(),
    ]);
    return {
      estado: "ok",
      versiones: resumenDeLasPruebas(filas.map(aFila).filter((f): f is FilaDePrueba => !!f)),
      niveles: vigente.estado === "ok" ? vigente.escala.niveles.map((n) => ({ letra: n.letra, nombre: n.nombre })) : [],
      nombres: Object.fromEntries(equipo.nombres),
    };
  } catch (e) {
    if (esquemaDesactualizado(e)) return { estado: "sin-tabla" };
    throw e;
  }
}

export interface EmpresaParaProbar {
  id: string;
  nombre: string;
  industria: string | null;
}

/** Cuántas empresas lista el buscador; con más, pide escribir parte del nombre. */
export const EMPRESAS_EN_LA_LISTA = 40;

/**
 * Las empresas que quien mira puede probar: las que ve (las mismas reglas de acceso de /clients) y que tienen una
 * exploración viva, de donde salen los niveles. Quien trabaja las preventas ve también sus prospectos. Wherex no sale.
 */
export async function empresasParaProbar(user: AppUserWithTeamMember, q: string): Promise<{ empresas: EmpresaParaProbar[]; hayMas: boolean }> {
  if (!modeloDisponible(prisma.exploracionDeVenta)) return { empresas: [], hayMas: false };
  const acceso = await accessibleClientWhere(user, { kinds: "all" });
  const tm = user.teamMember;
  const preventa = tm ? await can(tm, "preventa", "read") : false;
  const visibles: Prisma.ClientWhereInput | null = acceso
    ? preventa
      ? { OR: [acceso, { kind: "PROSPECTO", exploracionesDeVenta: { some: { archivadaEn: null, projectId: null } } }] }
      : acceso
    : null;
  const texto = q.trim().slice(0, 80);
  try {
    const filas = await prisma.client.findMany({
      where: {
        AND: [
          { exploracionesDeVenta: { some: { archivadaEn: null } } },
          ...(texto ? [{ name: { contains: texto, mode: "insensitive" as const } }] : []),
          ...(visibles ? [visibles] : []),
        ],
      },
      orderBy: { name: "asc" },
      take: EMPRESAS_EN_LA_LISTA + 2,
      select: { id: true, name: true, industry: true },
    });
    const empresas = filas.filter((c) => !empresaExcluida(c.name)).map((c) => ({ id: c.id, nombre: c.name, industria: industriaLegible(c.industry) }));
    return { empresas: empresas.slice(0, EMPRESAS_EN_LA_LISTA), hayMas: empresas.length > EMPRESAS_EN_LA_LISTA };
  } catch (e) {
    if (esquemaDesactualizado(e)) return { empresas: [], hayMas: false };
    throw e;
  }
}
