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
import { aplicarEdicion, edicionPorSlug } from "@/lib/escala/documento/edicion";
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

/**
 * La columna `edicion` llegó después (scripts/sql/2026-09-29-escala-comentario-edicion.sql). En la
 * ventana entre el deploy y ese SQL, pedirla da P2022: se lee sin ella y el comentario cuenta como
 * hecho desde la escala general, que es de donde se hicieron todos los anteriores.
 */
export const SQL_DE_LA_EDICION = "scripts/sql/2026-09-29-escala-comentario-edicion.sql";
const CAMPOS_CON_EDICION = { ...CAMPOS, edicion: true } satisfies Prisma.EscalaComentarioSelect;

type Fila = Prisma.EscalaComentarioGetPayload<{ select: typeof CAMPOS }> & { edicion?: string | null };

/** ¿Están las tablas? (el SQL se aplica antes del deploy, pero la ventana existe). */
export function comentariosDisponibles(): boolean {
  return modeloDisponible(prisma.escalaComentario);
}

/** Las filas con su edición; si la base todavía no tiene esa columna, sin ella. */
async function filas(args: Omit<Prisma.EscalaComentarioFindManyArgs, "select">): Promise<Fila[]> {
  try {
    return await prisma.escalaComentario.findMany({ ...args, select: CAMPOS_CON_EDICION });
  } catch (e) {
    if (!esquemaDesactualizado(e)) throw e;
    return prisma.escalaComentario.findMany({ ...args, select: CAMPOS });
  }
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

/**
 * `escala` es la versión publicada (la general). El ancla de cada comentario se resuelve con la
 * edición desde la que se hizo: así «lo que dice hoy» se compara con lo que esa persona leyó. Si la
 * edición ya no existe en la versión vigente, se lee con la escala general.
 */
function ver(f: Fila, autor: (email: string) => Autor, escala: Escala | null): ComentarioVisto {
  const edicion = f.edicion ? (escala ? edicionPorSlug(escala, f.edicion) : null) : null;
  const hoy = escala ? resolverAncla(aplicarEdicion(escala, f.edicion ?? null), f.ancla) : null;
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
    edicion: f.edicion ? { slug: f.edicion, nombre: edicion?.nombre ?? f.edicion } : null,
    // Sin escala publicada no hay contra qué comparar: se da por igual (no se inventa un «ya no existe»).
    textoDeHoy: escala ? (hoy?.texto ?? null) : f.textoAnclado,
    ruta: hoy?.ruta ?? null,
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

async function verTodos(lista: Fila[], escala: Escala | null): Promise<ComentarioVisto[]> {
  const autor = await autoresDe(
    lista.flatMap((f) => [
      f.autorEmail,
      ...(f.estadoCambiadoPorEmail ? [f.estadoCambiadoPorEmail] : []),
      ...f.respuestas.map((r) => r.autorEmail),
    ]),
  );
  return lista.map((f) => ver(f, autor, escala));
}

/** `escala`: la versión publicada, para decir qué dice hoy el ancla de cada comentario. */
export async function listarComentarios(
  filtro: {
    area?: string;
    ancla?: string;
    estado?: EstadoDeComentario;
  },
  escala: Escala | null,
): Promise<ComentarioVisto[]> {
  const lista = await filas({
    where: {
      ...(filtro.area ? { area: filtro.area } : {}),
      ...(filtro.ancla ? { ancla: filtro.ancla } : {}),
      ...(filtro.estado ? { estado: filtro.estado } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  return verTodos(lista, escala);
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
  // Desde qué edición se comenta: el ancla y el texto que se congela son los de ESA edición (un
  // criterio propio de una edición no existe en la general, y uno reescrito se lee distinto).
  const edicion = datos.edicion ? edicionPorSlug(escala, datos.edicion) : null;
  if (datos.edicion && !edicion) throw new ErrorDeComentario(`La versión ${escala.version} no tiene la edición «${datos.edicion}».`, 400);
  const ancla = resolverAncla(aplicarEdicion(escala, edicion?.slug ?? null), datos.ancla);
  if (!ancla) {
    throw new ErrorDeComentario(
      `«${datos.ancla}» no existe en la versión ${escala.version}${edicion ? `, edición ${edicion.nombre}` : ""}.`,
      400,
    );
  }

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

  // ⚠ Toda escritura pide de vuelta SOLO el id. Sin `select`, Prisma devuelve todas las columnas del
  // modelo —también `edicion`— y, si el SQL de esa columna todavía no se aplicó, la escritura falla
  // (P2022) aunque no la toque. La columna solo viaja en `data` cuando hay edición.
  let creado: { id: string };
  try {
    creado = await prisma.escalaComentario.create({
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
        ...(edicion ? { edicion: edicion.slug } : {}),
        autorEmail: args.autorEmail,
      },
      select: { id: true },
    });
  } catch (e) {
    if (edicion && esquemaDesactualizado(e)) {
      throw new ErrorDeComentario(`Todavía no se puede comentar desde una edición: falta aplicar ${SQL_DE_LA_EDICION}.`, 503);
    }
    throw e;
  }
  const [f] = await filas({ where: { id: creado.id } });
  return (await verTodos([f], escala))[0];
}

export async function editarComentario(id: string, datos: { cuerpo: string; decisionQueCambiaria: string | null }): Promise<void> {
  await prisma.escalaComentario.update({
    where: { id },
    data: { cuerpo: datos.cuerpo, decisionQueCambiaria: datos.decisionQueCambiaria, editadoAt: new Date() },
    select: { id: true },
  });
}

export async function borrarComentario(id: string): Promise<void> {
  await prisma.escalaComentario.delete({ where: { id }, select: { id: true } });
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
    // Con `select` angosto, como toda escritura de esta tabla (ver `crearComentario`).
    const soloId = { id: true } as const;
    if (datos.estado === "cambio_pendiente") {
      await tx.escalaComentario.update({
        where: { id: args.comentarioId },
        data: { ...base, cambioQue: datos.cambioQue, cambioCaso: datos.cambioCaso, cambioDecision: datos.cambioDecision },
        select: soloId,
      });
    } else if (datos.estado === "descartado") {
      await tx.escalaComentario.update({ where: { id: args.comentarioId }, data: { ...base, motivoDescarte: datos.motivoDescarte }, select: soloId });
    } else {
      await tx.escalaComentario.update({ where: { id: args.comentarioId }, data: base, select: soloId });
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
export async function cambiosPendientes(escala: Escala | null): Promise<ComentarioVisto[]> {
  const lista = await filas({ where: { estado: "cambio_pendiente" }, orderBy: { createdAt: "asc" } });
  return verTodos(lista, escala);
}
