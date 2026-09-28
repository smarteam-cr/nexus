/**
 * lib/escala/comentarios/consultas.ts — leer y escribir los comentarios de la escala. SERVIDOR.
 *
 * Las REGLAS (quién cambia el estado, edita o borra) viven en `reglas.ts`, que es puro; acá se lee
 * y se escribe. El ancla se resuelve contra la versión PUBLICADA y su texto se congela acá: nunca
 * lo manda el navegador.
 *
 * Los autores se guardan por email; nombre y foto se leen de TeamMember al devolver, con un select
 * propio (⛔ no ampliar `TEAM_MEMBER_SAFE_SELECT`).
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado, modeloDisponible } from "@/lib/db/esquema";
import { resolverAncla } from "@/lib/escala/documento/anclas";
import type { Cierre, Despues } from "@/lib/escala/documento/perfil";
import type { Escala } from "@/lib/escala/documento/tipos";
import type {
  Autor,
  ComentarioVisto,
  ConteosPorClave,
  EstadoDeComentario,
  TipoDeComentario,
} from "./reglas";
import type { CambiarEstadoInput, CrearComentarioInput } from "./esquema";

const CAMPOS = {
  id: true,
  ancla: true,
  tipoDeAncla: true,
  area: true,
  dimension: true,
  versionEscala: true,
  textoAnclado: true,
  tipo: true,
  cuerpo: true,
  decisionQueCambiaria: true,
  clienteId: true,
  clienteNombre: true,
  perfilCierre: true,
  perfilDespues: true,
  autorEmail: true,
  estado: true,
  estadoCambiadoAt: true,
  estadoCambiadoPorEmail: true,
  cambioQue: true,
  cambioCaso: true,
  cambioDecision: true,
  motivoDescarte: true,
  editadoAt: true,
  createdAt: true,
  respuestas: {
    orderBy: { createdAt: "asc" },
    select: { id: true, autorEmail: true, cuerpo: true, editadoAt: true, createdAt: true },
  },
} satisfies Prisma.EscalaComentarioSelect;

type Fila = Prisma.EscalaComentarioGetPayload<{ select: typeof CAMPOS }>;

/** ¿Están las tablas? (el SQL se aplica antes del deploy, pero la ventana existe). */
export function comentariosDisponibles(): boolean {
  return modeloDisponible(prisma.escalaComentario);
}

async function autoresDe(emails: Iterable<string>): Promise<(email: string) => Autor> {
  const unicos = [...new Set([...emails].map((e) => e.toLowerCase()))];
  const filas =
    unicos.length === 0
      ? []
      : await prisma.teamMember.findMany({
          where: { email: { in: unicos, mode: "insensitive" } },
          select: { email: true, name: true, photoUrl: true },
        });
  const porEmail = new Map(filas.map((f) => [f.email.toLowerCase(), f]));
  return (email) => {
    const f = porEmail.get(email.toLowerCase());
    return { email, nombre: f?.name ?? email.split("@")[0], foto: f?.photoUrl ?? null };
  };
}

function ver(f: Fila, autor: (email: string) => Autor): ComentarioVisto {
  return {
    id: f.id,
    ancla: f.ancla,
    tipoDeAncla: f.tipoDeAncla as ComentarioVisto["tipoDeAncla"],
    area: f.area,
    dimension: f.dimension,
    versionEscala: f.versionEscala,
    textoAnclado: f.textoAnclado,
    tipo: f.tipo as TipoDeComentario,
    cuerpo: f.cuerpo,
    decisionQueCambiaria: f.decisionQueCambiaria,
    cliente: f.clienteNombre ? { id: f.clienteId, nombre: f.clienteNombre } : null,
    perfil: { cierre: (f.perfilCierre as Cierre | null) ?? null, despues: (f.perfilDespues as Despues | null) ?? null },
    autor: autor(f.autorEmail),
    estado: f.estado as EstadoDeComentario,
    estadoCambiado: f.estadoCambiadoAt
      ? { at: f.estadoCambiadoAt.toISOString(), por: f.estadoCambiadoPorEmail ? autor(f.estadoCambiadoPorEmail) : null }
      : null,
    cambio:
      f.estado === "cambio_pendiente" && f.cambioQue
        ? { que: f.cambioQue, caso: f.cambioCaso ?? "", decision: f.cambioDecision ?? "" }
        : null,
    motivoDescarte: f.motivoDescarte,
    createdAt: f.createdAt.toISOString(),
    editadoAt: f.editadoAt?.toISOString() ?? null,
    respuestas: f.respuestas.map((r) => ({
      id: r.id,
      autor: autor(r.autorEmail),
      cuerpo: r.cuerpo,
      createdAt: r.createdAt.toISOString(),
      editadoAt: r.editadoAt?.toISOString() ?? null,
    })),
  };
}

async function verTodos(filas: Fila[]): Promise<ComentarioVisto[]> {
  const autor = await autoresDe(
    filas.flatMap((f) => [
      f.autorEmail,
      ...(f.estadoCambiadoPorEmail ? [f.estadoCambiadoPorEmail] : []),
      ...f.respuestas.map((r) => r.autorEmail),
    ]),
  );
  return filas.map((f) => ver(f, autor));
}

export async function listarComentarios(filtro: {
  area?: string;
  ancla?: string;
  estado?: EstadoDeComentario;
}): Promise<ComentarioVisto[]> {
  const filas = await prisma.escalaComentario.findMany({
    where: {
      ...(filtro.area ? { area: filtro.area } : {}),
      ...(filtro.ancla ? { ancla: filtro.ancla } : {}),
      ...(filtro.estado ? { estado: filtro.estado } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: CAMPOS,
  });
  return verTodos(filas);
}

export async function comentarioPorId(id: string): Promise<ComentarioVisto | null> {
  const f = await prisma.escalaComentario.findUnique({ where: { id }, select: CAMPOS });
  return f ? (await verTodos([f]))[0] : null;
}

/** Lo mínimo para decidir permisos sin traer todo. */
export async function autoriaPorId(id: string): Promise<{ autorEmail: string; estado: string; respuestas: number } | null> {
  const f = await prisma.escalaComentario.findUnique({
    where: { id },
    select: { autorEmail: true, estado: true, _count: { select: { respuestas: true } } },
  });
  return f ? { autorEmail: f.autorEmail, estado: f.estado, respuestas: f._count.respuestas } : null;
}

/** Los contadores de la pantalla. Sin tablas todavía: vacíos (la pantalla lo dice aparte). */
async function contarPor(campo: "ancla" | "area", where: Prisma.EscalaComentarioWhereInput): Promise<ConteosPorClave> {
  if (!comentariosDisponibles()) return {};
  try {
    const grupos = await prisma.escalaComentario.groupBy({ by: [campo, "estado"], where, _count: { _all: true } });
    const out: ConteosPorClave = {};
    for (const g of grupos) {
      const clave = g[campo] as string;
      const c = (out[clave] ??= { total: 0, abiertos: 0 });
      c.total += g._count._all;
      if (g.estado === "abierto") c.abiertos += g._count._all;
    }
    return out;
  } catch (e) {
    if (esquemaDesactualizado(e)) return {};
    throw e;
  }
}

export function contarPorAncla(area: string): Promise<ConteosPorClave> {
  return contarPor("ancla", { area });
}

export function contarPorArea(): Promise<ConteosPorClave> {
  return contarPor("area", {});
}

export class ErrorDeComentario extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Crear: el ancla tiene que existir en la versión publicada. El cliente, si viene por id, tiene que
 * ser uno que esta persona puede ver (`clientesVisibles` = el filtro de acceso de quien comenta).
 */
export async function crearComentario(args: {
  datos: CrearComentarioInput;
  escala: Escala;
  autorEmail: string;
  clientesVisibles: Prisma.ClientWhereInput | null;
}): Promise<ComentarioVisto> {
  const { datos, escala } = args;
  const ancla = resolverAncla(escala, datos.ancla);
  if (!ancla) throw new ErrorDeComentario(`«${datos.ancla}» no existe en la versión ${escala.version}.`, 400);

  let cliente: { id: string | null; nombre: string } | null = null;
  if (datos.clienteId) {
    const c = await prisma.client.findFirst({
      where: { id: datos.clienteId, ...(args.clientesVisibles ?? {}) },
      select: { id: true, name: true },
    });
    if (!c) throw new ErrorDeComentario("Ese cliente no existe o no lo tienes a la vista.", 400);
    cliente = { id: c.id, nombre: c.name };
  } else if (datos.clienteNombre) {
    cliente = { id: null, nombre: datos.clienteNombre };
  }

  const f = await prisma.escalaComentario.create({
    data: {
      ancla: ancla.id,
      tipoDeAncla: ancla.tipo,
      area: ancla.area.id,
      dimension: ancla.dimension.id,
      versionEscala: escala.version,
      textoAnclado: ancla.texto,
      tipo: datos.tipo,
      cuerpo: datos.cuerpo,
      decisionQueCambiaria: datos.tipo === "no_se_entiende" ? null : datos.decisionQueCambiaria,
      clienteId: datos.tipo === "no_calza" ? cliente?.id ?? null : null,
      clienteNombre: datos.tipo === "no_calza" ? cliente?.nombre ?? null : null,
      perfilCierre: datos.perfilCierre ?? null,
      perfilDespues: datos.perfilDespues ?? null,
      autorEmail: args.autorEmail,
    },
    select: CAMPOS,
  });
  return (await verTodos([f]))[0];
}

export async function editarComentario(id: string, datos: { cuerpo: string; decisionQueCambiaria: string | null }): Promise<void> {
  await prisma.escalaComentario.update({
    where: { id },
    data: { cuerpo: datos.cuerpo, decisionQueCambiaria: datos.decisionQueCambiaria, editadoAt: new Date() },
  });
}

export async function borrarComentario(id: string): Promise<void> {
  await prisma.escalaComentario.delete({ where: { id } });
}

/** Responder. Si responde el responsable y estaba abierto, pasa a «respondido». */
export async function responder(args: { comentarioId: string; cuerpo: string; email: string; esResponsable: boolean }): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.escalaRespuesta.create({
      data: { comentarioId: args.comentarioId, autorEmail: args.email, cuerpo: args.cuerpo },
    });
    if (args.esResponsable) {
      await tx.escalaComentario.updateMany({
        where: { id: args.comentarioId, estado: "abierto" },
        data: { estado: "respondido", estadoCambiadoAt: new Date(), estadoCambiadoPorEmail: args.email },
      });
    }
  });
}

/** Cambiar el estado (solo el responsable: lo mira la ruta). */
export async function cambiarEstado(args: { comentarioId: string; datos: CambiarEstadoInput; email: string }): Promise<void> {
  const { datos } = args;
  const base = { estado: datos.estado, estadoCambiadoAt: new Date(), estadoCambiadoPorEmail: args.email };
  await prisma.$transaction(async (tx) => {
    if (datos.estado === "cambio_pendiente") {
      await tx.escalaComentario.update({
        where: { id: args.comentarioId },
        data: { ...base, cambioQue: datos.cambioQue, cambioCaso: datos.cambioCaso, cambioDecision: datos.cambioDecision },
      });
    } else if (datos.estado === "descartado") {
      await tx.escalaComentario.update({ where: { id: args.comentarioId }, data: { ...base, motivoDescarte: datos.motivoDescarte } });
    } else {
      await tx.escalaComentario.update({ where: { id: args.comentarioId }, data: base });
    }
    // «Respondido» con texto: la respuesta queda en el hilo.
    if (datos.estado === "respondido" && datos.respuesta) {
      await tx.escalaRespuesta.create({ data: { comentarioId: args.comentarioId, autorEmail: args.email, cuerpo: datos.respuesta } });
    }
  });
}

export async function respuestaPorId(id: string): Promise<{ autorEmail: string; comentarioId: string } | null> {
  return prisma.escalaRespuesta.findUnique({ where: { id }, select: { autorEmail: true, comentarioId: true } });
}

export async function editarRespuesta(id: string, cuerpo: string): Promise<void> {
  await prisma.escalaRespuesta.update({ where: { id }, data: { cuerpo, editadoAt: new Date() } });
}

export async function borrarRespuesta(id: string): Promise<void> {
  await prisma.escalaRespuesta.delete({ where: { id } });
}

/** Los que pasaron a cambio pendiente, en el orden en que se detectaron (para el manual). */
export async function cambiosPendientes(): Promise<ComentarioVisto[]> {
  const filas = await prisma.escalaComentario.findMany({
    where: { estado: "cambio_pendiente" },
    orderBy: { createdAt: "asc" },
    select: CAMPOS,
  });
  return verTodos(filas);
}
