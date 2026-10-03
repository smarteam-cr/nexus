import "server-only";

/**
 * lib/cuestionario/servicio.ts — los cuestionarios del proyecto, del lado del CSE.
 *
 * ── DESDE EL 2026-10-02: POR PERSONA Y POR TIPO ──────────────────────────────
 * Un proyecto tiene VARIAS personas del cliente (cada una con UN enlace) y VARIOS cuestionarios;
 * cada cuestionario es de UNA persona y de un tipo («tactico» o «escala»). Lo que contesta una
 * persona es solo suyo: lo prellenado lo confirma cada una en su copia, y del lado nuestro se
 * compara (lib/cuestionario/comparar.ts).
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
  TITULO_DEL_TIPO,
  esTipoDeCuestionario,
  estaContestada,
  leerEtapas,
  leerPreguntas,
  leerRespuestas,
  type Etapa,
  type Pregunta,
  type Respuestas,
  type TipoDeCuestionario,
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
  enviadaAt: string | null;
  clienteActualizadoAt: string | null;
  avance: Avance;
  adjuntos: AdjuntoVista[];
}

export interface PersonaVista {
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
  persona: string | null;
  autorEmail: string | null;
  createdAt: string;
}

export interface CuestionarioVista {
  id: string;
  tipo: TipoDeCuestionario;
  titulo: string;
  personaId: string | null;
  publicadoAt: string | null;
  cerradoAt: string | null;
  /** Solo «escala»: la versión con que se armó (congelada) y si el perfil ya está. */
  escala: { version: string | null; edicion: string | null; perfil: unknown } | null;
  /** El prellenado con IA: si está corriendo, cuándo terminó el último y si falló. */
  prellenado: { enCurso: boolean; at: string | null; error: string | null };
  pestanas: PestanaVista[];
  cambios: CambioVista[];
  /** Pestañas de la plantilla que este cuestionario no tiene (solo táctico). */
  disponibles: Array<{ key: string; titulo: string }>;
}

export interface CuestionariosDelProyecto {
  personas: PersonaVista[];
  cuestionarios: CuestionarioVista[];
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
  cambios: {
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { enPestana: { select: { titulo: true } }, responsable: { select: { nombre: true } } },
  },
} satisfies Prisma.CuestionarioInclude;

type CuestionarioCompleto = Prisma.CuestionarioGetPayload<{ include: typeof INCLUDE }>;

function vistaDePestana(p: CuestionarioCompleto["pestanas"][number]): PestanaVista {
  const tipo: TipoPestana = p.tipo === "etapas" ? "etapas" : p.tipo === "escala" ? "escala" : "normal";
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
}

function aVista(c: CuestionarioCompleto): CuestionarioVista {
  const keys = new Set(c.pestanas.map((p) => p.key));
  const tipo: TipoDeCuestionario = esTipoDeCuestionario(c.tipo) ? c.tipo : "tactico";
  const enCurso =
    !!c.prellenandoDesde &&
    (!c.prellenadoAt || c.prellenandoDesde > c.prellenadoAt) &&
    Date.now() - c.prellenandoDesde.getTime() < PRELLENADO_VENCE_MS;
  return {
    id: c.id,
    tipo,
    titulo: TITULO_DEL_TIPO[tipo],
    personaId: c.personaId,
    publicadoAt: iso(c.publicadoAt),
    cerradoAt: iso(c.cerradoAt),
    escala: tipo === "escala" ? { version: c.escalaVersion, edicion: c.edicion, perfil: c.perfil ?? null } : null,
    prellenado: { enCurso, at: iso(c.prellenadoAt), error: enCurso ? null : c.prellenadoError },
    pestanas: c.pestanas.map(vistaDePestana),
    cambios: c.cambios.map((x) => ({
      id: x.id,
      tipo: (x.tipo === "SOLICITUD" || x.tipo === "REAPERTURA" ? x.tipo : "ENVIO") as CambioVista["tipo"],
      mensaje: x.mensaje,
      pestanaTitulo: x.enPestana?.titulo ?? null,
      persona: x.responsable?.nombre ?? null,
      autorEmail: x.autorEmail,
      createdAt: x.createdAt.toISOString(),
    })),
    disponibles:
      tipo === "tactico"
        ? pestanasDePlantilla()
            .filter((p) => !keys.has(p.key))
            .map((p) => ({ key: p.key, titulo: p.titulo }))
        : [],
  };
}

export async function obtenerCuestionarios(projectId: string): Promise<CuestionariosDelProyecto> {
  const [personas, cuestionarios] = await Promise.all([
    prisma.cuestionarioResponsable.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
    prisma.cuestionario.findMany({ where: { projectId }, include: INCLUDE, orderBy: { createdAt: "asc" } }),
  ]);
  return {
    personas: personas.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      cargo: r.cargo,
      email: r.email,
      ruta: `${RUTA_EXTERNA}/${r.accessToken}`,
      revocado: r.revokedAt != null,
      ultimoUsoAt: iso(r.ultimoUsoAt),
    })),
    cuestionarios: cuestionarios.map(aVista),
  };
}

async function exigir(projectId: string, cuestionarioId: string): Promise<CuestionarioCompleto> {
  const c = await prisma.cuestionario.findFirst({ where: { id: cuestionarioId, projectId }, include: INCLUDE });
  if (!c) throw new ErrorDeCuestionario("Ese cuestionario no es de este proyecto.", 404);
  return c;
}

async function exigirPersona(projectId: string, personaId: string, activa = true) {
  const r = await prisma.cuestionarioResponsable.findFirst({ where: { id: personaId, projectId } });
  if (!r) throw new ErrorDeCuestionario("Esa persona no es de este proyecto.", 404);
  if (activa && r.revokedAt) throw new ErrorDeCuestionario("Esa persona ya no tiene un enlace activo.", 409);
  return r;
}

/**
 * Crea un cuestionario TÁCTICO para una persona, con las pestañas de los hubs del proyecto.
 * El de escala lo arma `lib/cuestionario/escala.ts` (lee la escala vigente).
 * Una persona tiene a lo sumo UNO de cada tipo: si ya lo tiene, se devuelve ese.
 */
export async function crearTactico(projectId: string, personaId: string | null, creadoPor: string | null): Promise<string> {
  if (personaId) {
    await exigirPersona(projectId, personaId);
    const ya = await prisma.cuestionario.findFirst({ where: { projectId, personaId, tipo: "tactico" }, select: { id: true } });
    if (ya) return ya.id;
  }
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { tags: true } });
  if (!project) throw new ErrorDeCuestionario("Proyecto no existe", 404);
  const pestanas = pestanasParaTags(sanitizeTags(project.tags));
  const c = await prisma.cuestionario.create({
    data: {
      projectId,
      tipo: "tactico",
      personaId,
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
    select: { id: true },
  });
  return c.id;
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
 * Aplica operaciones de estructura a UN cuestionario táctico. Todas o ninguna: si una falla, no se
 * escribe nada y el error dice cuál y por qué. El de escala no se edita a mano: sale de la escala.
 */
export async function editarEstructura(projectId: string, cuestionarioId: string, ops: OperacionCuestionario[]): Promise<void> {
  const c = await exigir(projectId, cuestionarioId);
  if (c.tipo === "escala") {
    throw new ErrorDeCuestionario("El cuestionario de escala sale de la escala: no se edita a mano.", 409);
  }
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
}

function limpio(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export async function crearPersona(
  projectId: string,
  datos: { nombre?: unknown; cargo?: unknown; email?: unknown },
): Promise<string> {
  const nombre = limpio(datos.nombre, 120);
  if (!nombre) throw new ErrorDeCuestionario("La persona necesita un nombre.");
  const activas = await prisma.cuestionarioResponsable.count({ where: { projectId, revokedAt: null } });
  if (activas >= 25) throw new ErrorDeCuestionario("Ya hay 25 personas con enlace activo.");
  const r = await prisma.cuestionarioResponsable.create({
    data: {
      projectId,
      nombre,
      cargo: limpio(datos.cargo, 120) || null,
      email: limpio(datos.email, 200) || null,
      accessToken: randomBytes(32).toString("hex"),
    },
    select: { id: true },
  });
  return r.id;
}

export async function editarPersona(
  projectId: string,
  personaId: string,
  datos: { nombre?: unknown; cargo?: unknown; email?: unknown },
): Promise<void> {
  const r = await exigirPersona(projectId, personaId, false);
  const nombre = datos.nombre === undefined ? r.nombre : limpio(datos.nombre, 120);
  if (!nombre) throw new ErrorDeCuestionario("La persona necesita un nombre.");
  await prisma.cuestionarioResponsable.update({
    where: { id: r.id },
    data: {
      nombre,
      ...(datos.cargo !== undefined ? { cargo: limpio(datos.cargo, 120) || null } : {}),
      ...(datos.email !== undefined ? { email: limpio(datos.email, 200) || null } : {}),
    },
  });
}

/**
 * Revocar apaga el enlace para siempre (el token no se reutiliza). Sus cuestionarios CONSERVAN lo que
 * contestó y siguen siendo suyos: se ven del lado nuestro. Para que otra persona siga, se le asigna.
 */
export async function revocarPersona(projectId: string, personaId: string): Promise<void> {
  const r = await exigirPersona(projectId, personaId, false);
  await prisma.cuestionarioResponsable.update({ where: { id: r.id }, data: { revokedAt: new Date() } });
}

/** Cambia de quién es un cuestionario (o lo deja sin persona). Una persona: uno de cada tipo. */
export async function asignarPersona(projectId: string, cuestionarioId: string, personaId: string | null): Promise<void> {
  const c = await exigir(projectId, cuestionarioId);
  if (personaId) {
    await exigirPersona(projectId, personaId);
    const otro = await prisma.cuestionario.findFirst({
      where: { projectId, personaId, tipo: c.tipo, id: { not: c.id } },
      select: { id: true },
    });
    if (otro) throw new ErrorDeCuestionario(`Esa persona ya tiene un cuestionario ${TITULO_DEL_TIPO[c.tipo as TipoDeCuestionario]?.toLowerCase() ?? ""}.`, 409);
  }
  await prisma.cuestionario.update({ where: { id: c.id }, data: { personaId } });
}

export async function publicar(projectId: string, cuestionarioId: string, publicado: boolean): Promise<void> {
  const c = await exigir(projectId, cuestionarioId);
  if (publicado && !c.personaId) {
    throw new ErrorDeCuestionario("Asígnale una persona antes de publicarlo: el cuestionario se contesta con su enlace.", 409);
  }
  if (publicado && c.pestanas.length === 0) {
    throw new ErrorDeCuestionario("El cuestionario no tiene preguntas.", 409);
  }
  await prisma.cuestionario.update({
    where: { id: c.id },
    data: { publicadoAt: publicado ? (c.publicadoAt ?? new Date()) : null },
  });
}

export async function cerrar(projectId: string, cuestionarioId: string, cerrado: boolean): Promise<void> {
  const c = await exigir(projectId, cuestionarioId);
  await prisma.cuestionario.update({ where: { id: c.id }, data: { cerradoAt: cerrado ? new Date() : null } });
}

/** Se borra solo si nadie contestó nada: lo que escribió el cliente no se pierde por un clic. */
export async function eliminarCuestionario(projectId: string, cuestionarioId: string): Promise<void> {
  const c = await exigir(projectId, cuestionarioId);
  if (estadoDe(c).some((p) => p.tieneRespuestas)) {
    throw new ErrorDeCuestionario("Ese cuestionario ya tiene respuestas: ciérralo en vez de borrarlo.", 409);
  }
  await prisma.cuestionario.delete({ where: { id: c.id } });
}

/** El CSE devuelve una pestaña enviada al cliente para que la corrija. Queda en el registro. */
export async function reabrirPestana(
  projectId: string,
  pestanaId: string,
  autorEmail: string | null,
  motivo: unknown,
): Promise<void> {
  const p = await prisma.cuestionarioPestana.findFirst({
    where: { id: pestanaId, cuestionario: { projectId } },
    include: { cuestionario: { select: { id: true, personaId: true } } },
  });
  if (!p) throw new ErrorDeCuestionario("Esa pestaña no es de este proyecto.", 404);
  if (!p.enviadaAt) throw new ErrorDeCuestionario("Esa pestaña no está enviada.", 409);
  await prisma.$transaction([
    prisma.cuestionarioPestana.update({ where: { id: p.id }, data: { enviadaAt: null } }),
    prisma.cuestionarioCambio.create({
      data: {
        cuestionarioId: p.cuestionario.id,
        pestanaId: p.id,
        responsableId: p.cuestionario.personaId,
        tipo: "REAPERTURA",
        mensaje: limpio(motivo, 2000) || null,
        autorEmail,
      },
    }),
  ]);
}
