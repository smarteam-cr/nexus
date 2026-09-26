import "server-only";

/**
 * lib/cuestionario/servicio.ts — el cuestionario previo del lado del CSE.
 *
 * Toda escritura interna pasa por acá (la ruta /api/projects/[projectId]/cuestionario solo
 * autentica y despacha). Las del cliente viven en `externo.ts`, con su propia puerta.
 */
import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { sanitizeTags } from "@/lib/tags/catalog";
import { avanceDePestana, type Avance } from "./avance";
import { aplicarOperaciones, type EstadoDePestana, type OperacionCuestionario } from "./operaciones";
import { pestanasDePlantilla, pestanasParaTags } from "./plantilla";
// Solo la constante: el módulo del prellenado importa el SDK y esto lo lee cada GET.
import { PRELLENADO_VENCE_MS } from "./prellenado-estado";
import {
  estaContestada,
  leerEtapas,
  leerPreguntas,
  leerRespuestas,
  type Etapa,
  type Pregunta,
  type Respuestas,
  type TipoPestana,
} from "./tipos";

export const RUTA_EXTERNA = "/external/cuestionario";

export interface AdjuntoVista {
  id: string;
  titulo: string;
  descripcion: string | null;
  fileName: string | null;
  fileSize: number | null;
  createdAt: string;
}

export interface PestanaVista {
  id: string;
  key: string;
  titulo: string;
  descripcion: string | null;
  tipo: TipoPestana;
  preguntas: Pregunta[];
  respuestas: Respuestas;
  etapas: Etapa[];
  contextoAdicional: string | null;
  responsableId: string | null;
  enviadaAt: string | null;
  clienteActualizadoAt: string | null;
  avance: Avance;
  adjuntos: AdjuntoVista[];
}

export interface ResponsableVista {
  id: string;
  nombre: string;
  cargo: string | null;
  email: string | null;
  ruta: string;
  revocado: boolean;
  ultimoUsoAt: string | null;
}

export interface CambioVista {
  id: string;
  tipo: "ENVIO" | "SOLICITUD" | "REAPERTURA";
  mensaje: string | null;
  pestanaTitulo: string | null;
  responsable: string | null;
  autorEmail: string | null;
  createdAt: string;
}

export interface CuestionarioVista {
  id: string;
  publicadoAt: string | null;
  cerradoAt: string | null;
  /** El prellenado con IA: si está corriendo, cuándo terminó el último y si falló. */
  prellenado: { enCurso: boolean; at: string | null; error: string | null };
  pestanas: PestanaVista[];
  responsables: ResponsableVista[];
  cambios: CambioVista[];
  /** Pestañas de la plantilla que este cuestionario no tiene (para sumarlas con un clic). */
  disponibles: Array<{ key: string; titulo: string }>;
}

export class ErrorDeCuestionario extends Error {
  constructor(
    message: string,
    public status: number = 400,
  ) {
    super(message);
  }
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

const INCLUDE = {
  pestanas: {
    orderBy: { orden: "asc" },
    include: {
      adjuntos: {
        orderBy: { createdAt: "asc" },
        select: { id: true, title: true, descripcion: true, fileName: true, fileSize: true, createdAt: true },
      },
    },
  },
  responsables: { orderBy: { createdAt: "asc" } },
  cambios: {
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { enPestana: { select: { titulo: true } }, responsable: { select: { nombre: true } } },
  },
} satisfies Prisma.CuestionarioInclude;

type CuestionarioCompleto = Prisma.CuestionarioGetPayload<{ include: typeof INCLUDE }>;

function aVista(c: CuestionarioCompleto): CuestionarioVista {
  const keys = new Set(c.pestanas.map((p) => p.key));
  const enCurso =
    !!c.prellenandoDesde &&
    (!c.prellenadoAt || c.prellenandoDesde > c.prellenadoAt) &&
    Date.now() - c.prellenandoDesde.getTime() < PRELLENADO_VENCE_MS;
  return {
    id: c.id,
    publicadoAt: iso(c.publicadoAt),
    cerradoAt: iso(c.cerradoAt),
    prellenado: { enCurso, at: iso(c.prellenadoAt), error: enCurso ? null : c.prellenadoError },
    pestanas: c.pestanas.map((p) => {
      const tipo: TipoPestana = p.tipo === "etapas" ? "etapas" : "normal";
      const preguntas = leerPreguntas(p.preguntas);
      const respuestas = leerRespuestas(p.respuestas);
      const etapas = leerEtapas(p.etapas);
      return {
        id: p.id,
        key: p.key,
        titulo: p.titulo,
        descripcion: p.descripcion,
        tipo,
        preguntas,
        respuestas,
        etapas,
        contextoAdicional: p.contextoAdicional,
        responsableId: p.responsableId,
        enviadaAt: iso(p.enviadaAt),
        clienteActualizadoAt: iso(p.clienteActualizadoAt),
        avance: avanceDePestana({ tipo, preguntas, respuestas, etapas }),
        adjuntos: p.adjuntos.map((a) => ({
          id: a.id,
          titulo: a.title,
          descripcion: a.descripcion,
          fileName: a.fileName,
          fileSize: a.fileSize,
          createdAt: a.createdAt.toISOString(),
        })),
      };
    }),
    responsables: c.responsables.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      cargo: r.cargo,
      email: r.email,
      ruta: `${RUTA_EXTERNA}/${r.accessToken}`,
      revocado: r.revokedAt != null,
      ultimoUsoAt: iso(r.ultimoUsoAt),
    })),
    cambios: c.cambios.map((x) => ({
      id: x.id,
      tipo: (x.tipo === "SOLICITUD" || x.tipo === "REAPERTURA" ? x.tipo : "ENVIO") as CambioVista["tipo"],
      mensaje: x.mensaje,
      pestanaTitulo: x.enPestana?.titulo ?? null,
      responsable: x.responsable?.nombre ?? null,
      autorEmail: x.autorEmail,
      createdAt: x.createdAt.toISOString(),
    })),
    disponibles: pestanasDePlantilla()
      .filter((p) => !keys.has(p.key))
      .map((p) => ({ key: p.key, titulo: p.titulo })),
  };
}

export async function obtenerCuestionario(projectId: string): Promise<CuestionarioVista | null> {
  const c = await prisma.cuestionario.findUnique({ where: { projectId }, include: INCLUDE });
  return c ? aVista(c) : null;
}

async function exigir(projectId: string): Promise<CuestionarioCompleto> {
  const c = await prisma.cuestionario.findUnique({ where: { projectId }, include: INCLUDE });
  if (!c) throw new ErrorDeCuestionario("Este proyecto todavía no tiene cuestionario.", 404);
  return c;
}

/**
 * Arma el cuestionario desde la plantilla, con las pestañas que corresponden a los hubs del
 * proyecto. Idempotente: si ya existe, lo devuelve tal cual (nunca pisa lo que el CSE editó).
 */
export async function generarCuestionario(projectId: string, creadoPor: string | null): Promise<CuestionarioVista> {
  const existente = await obtenerCuestionario(projectId);
  if (existente) return existente;

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { tags: true } });
  if (!project) throw new ErrorDeCuestionario("Proyecto no existe", 404);
  const pestanas = pestanasParaTags(sanitizeTags(project.tags));

  try {
    await prisma.cuestionario.create({
      data: {
        projectId,
        createdById: creadoPor,
        pestanas: {
          create: pestanas.map((p, i) => ({
            key: p.key,
            titulo: p.titulo,
            descripcion: p.descripcion,
            tipo: p.tipo,
            orden: i,
            preguntas: p.preguntas as unknown as Prisma.InputJsonValue,
          })),
        },
      },
    });
  } catch (e) {
    // Doble clic / dos pestañas: el unique de projectId gana y el segundo devuelve el primero.
    if ((e as { code?: string }).code !== "P2002") throw e;
  }
  return (await obtenerCuestionario(projectId))!;
}

function estadoDe(c: CuestionarioCompleto): EstadoDePestana[] {
  return c.pestanas.map((p) => {
    const respuestas = leerRespuestas(p.respuestas);
    const etapas = leerEtapas(p.etapas);
    return {
      key: p.key,
      titulo: p.titulo,
      descripcion: p.descripcion,
      tipo: p.tipo === "etapas" ? "etapas" : "normal",
      preguntas: leerPreguntas(p.preguntas),
      enviada: p.enviadaAt != null,
      tieneRespuestas:
        Object.values(respuestas).some((r) => estaContestada(r)) ||
        etapas.length > 0 ||
        !!p.contextoAdicional?.trim() ||
        p.adjuntos.length > 0,
    };
  });
}

/**
 * Aplica operaciones de estructura. Todas o ninguna: si una falla, no se escribe nada y el error
 * dice cuál y por qué (lo muestra el editor y, en su tanda, el chat).
 */
export async function editarEstructura(
  projectId: string,
  ops: OperacionCuestionario[],
): Promise<CuestionarioVista> {
  const c = await exigir(projectId);
  if (c.cerradoAt) throw new ErrorDeCuestionario("El cuestionario está cerrado. Reábrelo para cambiarlo.", 409);

  const res = aplicarOperaciones(estadoDe(c), ops);
  if (!res.ok) throw new ErrorDeCuestionario(res.error, 409);

  const porKey = new Map(c.pestanas.map((p) => [p.key, p]));
  const finales = new Set(res.pestanas.map((p) => p.key));

  await prisma.$transaction([
    // Quitadas (aplicarOperaciones ya garantizó que no tienen respuestas).
    prisma.cuestionarioPestana.deleteMany({
      where: { cuestionarioId: c.id, key: { in: c.pestanas.filter((p) => !finales.has(p.key)).map((p) => p.key) } },
    }),
    ...res.pestanas.map((p, orden) => {
      const data = {
        titulo: p.titulo,
        descripcion: p.descripcion,
        tipo: p.tipo,
        orden,
        preguntas: p.preguntas as unknown as Prisma.InputJsonValue,
      };
      return porKey.has(p.key)
        ? prisma.cuestionarioPestana.update({ where: { id: porKey.get(p.key)!.id }, data })
        : prisma.cuestionarioPestana.create({ data: { ...data, cuestionarioId: c.id, key: p.key } });
    }),
  ]);
  return (await obtenerCuestionario(projectId))!;
}

function limpio(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export async function crearResponsable(
  projectId: string,
  datos: { nombre?: unknown; cargo?: unknown; email?: unknown },
): Promise<CuestionarioVista> {
  const c = await exigir(projectId);
  const nombre = limpio(datos.nombre, 120);
  if (!nombre) throw new ErrorDeCuestionario("El responsable necesita un nombre.");
  if (c.responsables.filter((r) => !r.revokedAt).length >= 25) {
    throw new ErrorDeCuestionario("Ya hay 25 responsables con enlace activo.");
  }
  await prisma.cuestionarioResponsable.create({
    data: {
      cuestionarioId: c.id,
      nombre,
      cargo: limpio(datos.cargo, 120) || null,
      email: limpio(datos.email, 200) || null,
      accessToken: randomBytes(32).toString("hex"),
    },
  });
  return (await obtenerCuestionario(projectId))!;
}

export async function editarResponsable(
  projectId: string,
  responsableId: string,
  datos: { nombre?: unknown; cargo?: unknown; email?: unknown },
): Promise<CuestionarioVista> {
  const c = await exigir(projectId);
  const r = c.responsables.find((x) => x.id === responsableId);
  if (!r) throw new ErrorDeCuestionario("Ese responsable no es de este cuestionario.", 404);
  const nombre = datos.nombre === undefined ? r.nombre : limpio(datos.nombre, 120);
  if (!nombre) throw new ErrorDeCuestionario("El responsable necesita un nombre.");
  await prisma.cuestionarioResponsable.update({
    where: { id: r.id },
    data: {
      nombre,
      ...(datos.cargo !== undefined ? { cargo: limpio(datos.cargo, 120) || null } : {}),
      ...(datos.email !== undefined ? { email: limpio(datos.email, 200) || null } : {}),
    },
  });
  return (await obtenerCuestionario(projectId))!;
}

/**
 * Revocar apaga el enlace para siempre (el token no se reutiliza). Sus pestañas quedan sin
 * responsable pero CONSERVAN lo que contestó: se le asignan a otra persona y sigue donde quedó.
 */
export async function revocarResponsable(projectId: string, responsableId: string): Promise<CuestionarioVista> {
  const c = await exigir(projectId);
  const r = c.responsables.find((x) => x.id === responsableId);
  if (!r) throw new ErrorDeCuestionario("Ese responsable no es de este cuestionario.", 404);
  await prisma.$transaction([
    prisma.cuestionarioResponsable.update({ where: { id: r.id }, data: { revokedAt: new Date() } }),
    prisma.cuestionarioPestana.updateMany({ where: { responsableId: r.id }, data: { responsableId: null } }),
  ]);
  return (await obtenerCuestionario(projectId))!;
}

export async function asignarPestana(
  projectId: string,
  pestanaId: string,
  responsableId: string | null,
): Promise<CuestionarioVista> {
  const c = await exigir(projectId);
  const p = c.pestanas.find((x) => x.id === pestanaId);
  if (!p) throw new ErrorDeCuestionario("Esa pestaña no es de este cuestionario.", 404);
  if (responsableId) {
    const r = c.responsables.find((x) => x.id === responsableId);
    if (!r || r.revokedAt) throw new ErrorDeCuestionario("Ese responsable no tiene un enlace activo.", 404);
  }
  await prisma.cuestionarioPestana.update({ where: { id: p.id }, data: { responsableId } });
  return (await obtenerCuestionario(projectId))!;
}

export async function publicar(projectId: string, publicado: boolean): Promise<CuestionarioVista> {
  const c = await exigir(projectId);
  if (publicado && !c.pestanas.some((p) => p.responsableId)) {
    throw new ErrorDeCuestionario("Asigna al menos una pestaña a un responsable antes de enviarlo.", 409);
  }
  await prisma.cuestionario.update({
    where: { id: c.id },
    data: { publicadoAt: publicado ? (c.publicadoAt ?? new Date()) : null },
  });
  return (await obtenerCuestionario(projectId))!;
}

export async function cerrar(projectId: string, cerrado: boolean): Promise<CuestionarioVista> {
  const c = await exigir(projectId);
  await prisma.cuestionario.update({ where: { id: c.id }, data: { cerradoAt: cerrado ? new Date() : null } });
  return (await obtenerCuestionario(projectId))!;
}

/** El CSE devuelve una pestaña enviada al cliente para que la corrija. Queda en el registro. */
export async function reabrirPestana(
  projectId: string,
  pestanaId: string,
  autorEmail: string | null,
  motivo: unknown,
): Promise<CuestionarioVista> {
  const c = await exigir(projectId);
  const p = c.pestanas.find((x) => x.id === pestanaId);
  if (!p) throw new ErrorDeCuestionario("Esa pestaña no es de este cuestionario.", 404);
  if (!p.enviadaAt) throw new ErrorDeCuestionario("Esa pestaña no está enviada.", 409);
  await prisma.$transaction([
    prisma.cuestionarioPestana.update({ where: { id: p.id }, data: { enviadaAt: null } }),
    prisma.cuestionarioCambio.create({
      data: {
        cuestionarioId: c.id,
        pestanaId: p.id,
        responsableId: p.responsableId,
        tipo: "REAPERTURA",
        mensaje: limpio(motivo, 2000) || null,
        autorEmail,
      },
    }),
  ]);
  return (await obtenerCuestionario(projectId))!;
}
