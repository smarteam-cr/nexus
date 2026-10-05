/**
 * lib/feedback/escala-server.ts — los comentarios de la escala, guardados como reportes de Feedback.
 * SERVIDOR.
 *
 * Lo que antes hacía `lib/escala/comentarios/consultas.ts` sobre sus tablas propias, ahora sobre
 * "FeedbackReporte" y "FeedbackMensaje" (ver `lib/feedback/escala.ts`, que tiene las reglas). La
 * pantalla de la escala sigue hablando en `ComentarioVisto`: lo que cambia es dónde se guarda y dónde
 * se decide (la bandeja de /feedback).
 *
 * El ancla se resuelve contra la versión PUBLICADA y su texto se congela acá: nunca lo manda el
 * navegador. Los autores van por email; nombre y foto se leen de TeamMember al devolver, con un select
 * propio (⛔ no ampliar `TEAM_MEMBER_SAFE_SELECT`). Cada escritura le avisa en «Para ti» a quien le
 * importa: lo nuevo a quienes llevan Feedback o la Escala, una respuesta a quien lo escribió.
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado, modeloDisponible } from "@/lib/db/esquema";
import { avisar } from "@/lib/para-ti/avisos-server";
import { resolverAncla } from "@/lib/escala/documento/anclas";
import { aplicarEdicion, edicionPorSlug } from "@/lib/escala/documento/edicion";
import { describirPerfil, type Cierre, type Despues } from "@/lib/escala/documento/perfil";
import type { Escala } from "@/lib/escala/documento/tipos";
import { leerEscalaVigente } from "@/lib/escala/documento/vigente";
import type { CrearComentarioInput } from "@/lib/escala/comentarios/esquema";
import { etiquetaDeTipo, filaSugerida, type Autor, type ComentarioVisto, type ConteosPorClave, type EstadoDeComentario } from "@/lib/escala/comentarios/reglas";
import { ErrorDeFeedback } from "./error";
import {
  ESTADO_EN_EL_FEEDBACK,
  estadoEnLaEscala,
  leerEscalaDelReporte,
  pantallaDeLaEscala,
  rutaEnLaEscala,
  TIPO_EN_EL_FEEDBACK,
  type DetalleDeEscala,
  type EscalaDelReporte,
  type FilaDelManual,
} from "./escala";

export type { DetalleDeEscala };

/** El SQL que le suma a Feedback lo de la escala. */
export const SQL_DE_LA_ESCALA_EN_FEEDBACK = "scripts/sql/2026-10-05-feedback-escala.sql";

/** ¿Están las tablas del feedback? (Las columnas de la escala se confirman al usarlas: ver `sinColumnas`.) */
export function comentariosDisponibles(): boolean {
  return modeloDisponible(prisma.feedbackReporte) && modeloDisponible(prisma.feedbackMensaje);
}

/** Si faltan las columnas de la escala (el SQL de hoy no se aplicó), un 503 que lo dice. */
function sinColumnas(e: unknown): never {
  if (esquemaDesactualizado(e)) {
    throw new ErrorDeFeedback(`Los comentarios de la escala todavía no están disponibles: falta aplicar ${SQL_DE_LA_ESCALA_EN_FEEDBACK}.`, 503);
  }
  throw e;
}

const recorte = (t: string, max = 280) => (t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t);

/** Solo lo comentado desde la escala: un reporte de pantalla nunca sale por acá. */
const DE_LA_ESCALA = { escalaAncla: { not: null } } satisfies Prisma.FeedbackReporteWhereInput;

const CAMPOS = {
  id: true,
  numero: true,
  autorEmail: true,
  cuerpo: true,
  estado: true,
  escalaAncla: true,
  escalaArea: true,
  escala: true,
  motivoCierre: true,
  decididoAt: true,
  decididoPorEmail: true,
  createdAt: true,
  tema: { select: { titulo: true, columna: true } },
  mensajes: { orderBy: { createdAt: "asc" }, select: { id: true, autorEmail: true, cuerpo: true, createdAt: true } },
} satisfies Prisma.FeedbackReporteSelect;

type Fila = Prisma.FeedbackReporteGetPayload<{ select: typeof CAMPOS }>;

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

/** Lo que la columna `escala` no trae (un JSON roto): lo mínimo, sin inventar textos. */
function escalaDe(f: Pick<Fila, "escala" | "escalaAncla">): EscalaDelReporte {
  return (
    leerEscalaDelReporte(f.escala) ?? {
      tipoDeAncla: "criterio",
      dimension: (f.escalaAncla ?? "").split(".").slice(0, 2).join("."),
      version: "",
      textoAnclado: "",
      edicion: null,
      tipo: "propuesta",
      decision: null,
      cliente: null,
      perfil: { cierre: null, despues: null },
      cambio: null,
      editadoAt: null,
    }
  );
}

/**
 * `escala` es la versión publicada (la general). El ancla de cada comentario se resuelve con la
 * edición desde la que se hizo: así «lo que dice hoy» se compara con lo que esa persona leyó. Si la
 * edición ya no existe en la versión vigente, se lee con la escala general.
 */
function ver(f: Fila, autor: (email: string) => Autor, escala: Escala | null): ComentarioVisto {
  const e = escalaDe(f);
  const ancla = f.escalaAncla ?? "";
  const edicion = e.edicion ? (escala ? edicionPorSlug(escala, e.edicion) : null) : null;
  const hoy = escala ? resolverAncla(aplicarEdicion(escala, e.edicion), ancla) : null;
  const enHoja = f.estado === "en_hoja";
  return {
    id: f.id,
    numero: f.numero,
    ancla,
    tipoDeAncla: e.tipoDeAncla,
    area: f.escalaArea ?? "",
    dimension: e.dimension,
    versionEscala: e.version,
    textoAnclado: e.textoAnclado,
    tipo: e.tipo,
    cuerpo: f.cuerpo,
    decisionQueCambiaria: e.decision,
    cliente: e.cliente,
    perfil: e.perfil,
    edicion: e.edicion ? { slug: e.edicion, nombre: edicion?.nombre ?? e.edicion } : null,
    // Sin escala publicada no hay contra qué comparar: se da por igual (no se inventa un «ya no existe»).
    textoDeHoy: escala ? (hoy?.texto ?? null) : e.textoAnclado,
    ruta: hoy?.ruta ?? null,
    autor: autor(f.autorEmail),
    estado: estadoEnLaEscala(f.estado),
    estadoCambiado: f.decididoAt ? { at: f.decididoAt.toISOString(), por: f.decididoPorEmail ? autor(f.decididoPorEmail) : null } : null,
    cambio: enHoja ? e.cambio : null,
    tema: enHoja && f.tema ? { titulo: f.tema.titulo, columna: f.tema.columna } : null,
    motivoDescarte: f.estado === "no_se_hara" ? f.motivoCierre : null,
    createdAt: f.createdAt.toISOString(),
    editadoAt: e.editadoAt,
    respuestas: f.mensajes.map((m) => ({ id: m.id, autor: autor(m.autorEmail), cuerpo: m.cuerpo, createdAt: m.createdAt.toISOString(), editadoAt: null })),
  };
}

async function verTodos(lista: Fila[], escala: Escala | null): Promise<ComentarioVisto[]> {
  const autor = await autoresDe(lista.flatMap((f) => [f.autorEmail, ...(f.decididoPorEmail ? [f.decididoPorEmail] : []), ...f.mensajes.map((m) => m.autorEmail)]));
  return lista.map((f) => ver(f, autor, escala));
}

async function filas(args: Omit<Prisma.FeedbackReporteFindManyArgs, "select">): Promise<Fila[]> {
  try {
    return await prisma.feedbackReporte.findMany({ ...args, select: CAMPOS });
  } catch (e) {
    return sinColumnas(e);
  }
}

/** `escala`: la versión publicada, para decir qué dice hoy el ancla de cada comentario. */
export async function listarComentarios(
  filtro: { area?: string; ancla?: string; estado?: EstadoDeComentario },
  escala: Escala | null,
): Promise<ComentarioVisto[]> {
  const lista = await filas({
    where: {
      ...DE_LA_ESCALA,
      ...(filtro.area ? { escalaArea: filtro.area } : {}),
      ...(filtro.ancla ? { escalaAncla: filtro.ancla } : {}),
      ...(filtro.estado ? { estado: ESTADO_EN_EL_FEEDBACK[filtro.estado] } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  return verTodos(lista, escala);
}

/** Lo mínimo para decidir permisos sin traer todo. Solo de la escala: un reporte de pantalla no existe acá. */
export async function autoriaPorId(id: string): Promise<{ autorEmail: string; estado: EstadoDeComentario; respuestas: number } | null> {
  try {
    const f = await prisma.feedbackReporte.findFirst({
      where: { id, ...DE_LA_ESCALA },
      select: { autorEmail: true, estado: true, _count: { select: { mensajes: true } } },
    });
    return f ? { autorEmail: f.autorEmail, estado: estadoEnLaEscala(f.estado), respuestas: f._count.mensajes } : null;
  } catch (e) {
    return sinColumnas(e);
  }
}

/** Los contadores de la pantalla: abiertos = sin revisar. Sin tablas o sin columnas, vacíos (la pantalla lo dice aparte). */
async function contarPor(campo: "escalaAncla" | "escalaArea", where: Prisma.FeedbackReporteWhereInput): Promise<ConteosPorClave> {
  if (!comentariosDisponibles()) return {};
  try {
    const grupos = await prisma.feedbackReporte.groupBy({ by: [campo, "estado"], where: { ...DE_LA_ESCALA, ...where }, _count: { _all: true } });
    const out: ConteosPorClave = {};
    for (const g of grupos) {
      const clave = g[campo];
      if (!clave) continue;
      const c = (out[clave] ??= { total: 0, abiertos: 0 });
      c.total += g._count._all;
      if (g.estado === "sin_revisar") c.abiertos += g._count._all;
    }
    return out;
  } catch (e) {
    if (esquemaDesactualizado(e)) return {};
    throw e;
  }
}

export function contarPorAncla(area: string): Promise<ConteosPorClave> {
  return contarPor("escalaAncla", { escalaArea: area });
}

export function contarPorArea(): Promise<ConteosPorClave> {
  return contarPor("escalaArea", {});
}

/**
 * Crear: el ancla tiene que existir en la versión publicada. El cliente, si viene por id, tiene que
 * ser uno que esta persona puede ver (`clientesVisibles` = el filtro de acceso de quien comenta).
 */
export async function crearComentario(args: {
  datos: CrearComentarioInput;
  escala: Escala;
  autor: { email: string; nombre: string; rol: string | null };
  clientesVisibles: Prisma.ClientWhereInput | null;
}): Promise<ComentarioVisto> {
  const { datos, escala } = args;
  // Desde qué edición se comenta: el ancla y el texto que se congela son los de ESA edición (un
  // criterio propio de una edición no existe en la general, y uno reescrito se lee distinto).
  const edicion = datos.edicion ? edicionPorSlug(escala, datos.edicion) : null;
  if (datos.edicion && !edicion) throw new ErrorDeFeedback(`La versión ${escala.version} no tiene la edición «${datos.edicion}».`, 400);
  const ancla = resolverAncla(aplicarEdicion(escala, edicion?.slug ?? null), datos.ancla);
  if (!ancla) {
    throw new ErrorDeFeedback(`«${datos.ancla}» no existe en la versión ${escala.version}${edicion ? `, edición ${edicion.nombre}` : ""}.`, 400);
  }

  let cliente: { id: string | null; nombre: string } | null = null;
  if (datos.tipo === "no_calza") {
    if (datos.clienteId) {
      const c = await prisma.client.findFirst({ where: { id: datos.clienteId, ...(args.clientesVisibles ?? {}) }, select: { id: true, name: true } });
      if (!c) throw new ErrorDeFeedback("Ese cliente no existe o no lo tienes a la vista.", 400);
      cliente = { id: c.id, nombre: c.name };
    } else if (datos.clienteNombre) {
      cliente = { id: null, nombre: datos.clienteNombre };
    }
  }

  const contexto: EscalaDelReporte = {
    tipoDeAncla: ancla.tipo,
    dimension: ancla.dimension.id,
    version: escala.version,
    textoAnclado: ancla.texto,
    edicion: edicion?.slug ?? null,
    tipo: datos.tipo,
    decision: datos.tipo === "no_se_entiende" ? null : (datos.decisionQueCambiaria ?? null),
    cliente,
    // El esquema de la ruta ya los validó contra CIERRES y DESPUES.
    perfil: { cierre: (datos.perfilCierre as Cierre | null | undefined) ?? null, despues: (datos.perfilDespues as Despues | null | undefined) ?? null },
    cambio: null,
    editadoAt: null,
  };

  let creado: { id: string; numero: number };
  try {
    creado = await prisma.feedbackReporte.create({
      data: {
        autorEmail: args.autor.email.toLowerCase(),
        tipo: TIPO_EN_EL_FEEDBACK[datos.tipo],
        cuerpo: datos.cuerpo,
        pantalla: pantallaDeLaEscala(ancla.area.nombre),
        ruta: rutaEnLaEscala({ slug: ancla.area.slug, ancla: ancla.id, edicion: edicion?.slug ?? null }),
        rol: args.autor.rol,
        escalaAncla: ancla.id,
        escalaArea: ancla.area.id,
        escala: contexto as unknown as Prisma.InputJsonValue,
        autorLeyoAt: new Date(),
      },
      select: { id: true, numero: true },
    });
  } catch (e) {
    return sinColumnas(e);
  }

  // A quienes llevan Feedback (quienes deciden) y a quienes llevan la Escala: la misma clave, así quien
  // lleva los dos frentes lo recibe una vez. `avisar` no lanza.
  const aviso = {
    tipo: "feedback.nuevo",
    titulo: `${etiquetaDeTipo(datos.tipo)} en la Escala, en ${ancla.id} · ${args.autor.nombre}`,
    detalle: recorte(datos.cuerpo),
    href: `/feedback?reporte=${creado.id}`,
    actorEmail: args.autor.email,
    dedupeKey: `feedback.nuevo:${creado.id}`,
  };
  await avisar({ ...aviso, frente: "FEEDBACK" });
  await avisar({ ...aviso, frente: "ESCALA" });

  const [f] = await filas({ where: { id: creado.id } });
  return (await verTodos([f], escala))[0];
}

/** Editar: el texto y «qué decisión cambiaría» (la ruta ya miró que pueda). */
export async function editarComentario(id: string, datos: { cuerpo: string; decisionQueCambiaria: string | null }): Promise<void> {
  const f = await prisma.feedbackReporte.findFirst({ where: { id, ...DE_LA_ESCALA }, select: { escala: true, escalaAncla: true } });
  if (!f) throw new ErrorDeFeedback("Ese comentario ya no existe.", 404);
  const e = escalaDe(f);
  const nuevo: EscalaDelReporte = { ...e, decision: e.tipo === "no_se_entiende" ? null : datos.decisionQueCambiaria, editadoAt: new Date().toISOString() };
  await prisma.feedbackReporte.update({
    where: { id },
    data: { cuerpo: datos.cuerpo, escala: nuevo as unknown as Prisma.InputJsonValue },
    select: { id: true },
  });
}

/** Borrar: se van también sus respuestas (la conversación es del reporte). */
export async function borrarComentario(id: string): Promise<void> {
  await prisma.feedbackReporte.delete({ where: { id }, select: { id: true } });
}

/**
 * Responder: cualquiera del equipo, en la escala. No cambia el estado: eso se decide en Feedback.
 * A quien lo escribió le llega el aviso; si responde él mismo, les llega a quienes deciden.
 */
export async function responder(args: { comentarioId: string; cuerpo: string; email: string; esRevisor: boolean }): Promise<void> {
  const r = await prisma.feedbackReporte.findFirst({ where: { id: args.comentarioId, ...DE_LA_ESCALA }, select: { id: true, autorEmail: true, escalaAncla: true } });
  if (!r) throw new ErrorDeFeedback("Ese comentario ya no existe.", 404);
  const esAutor = r.autorEmail.toLowerCase() === args.email.toLowerCase();
  const ahora = new Date();
  const mensaje = await prisma.$transaction(async (tx) => {
    const m = await tx.feedbackMensaje.create({ data: { reporteId: r.id, autorEmail: args.email.toLowerCase(), cuerpo: args.cuerpo }, select: { id: true } });
    // Quien escribe deja leído hasta acá, en su lado de la conversación.
    if (esAutor) await tx.feedbackReporte.update({ where: { id: r.id }, data: { autorLeyoAt: ahora }, select: { id: true } });
    else if (args.esRevisor) await tx.feedbackReporte.update({ where: { id: r.id }, data: { revisorLeyoAt: ahora }, select: { id: true } });
    return m;
  });
  if (esAutor) {
    const aviso = {
      tipo: "feedback.respuesta",
      titulo: `Sumaron algo a un comentario de la Escala, en ${r.escalaAncla}`,
      detalle: recorte(args.cuerpo),
      href: `/feedback?reporte=${r.id}`,
      actorEmail: args.email,
      dedupeKey: `feedback.respuesta:${mensaje.id}`,
    };
    await avisar({ ...aviso, frente: "FEEDBACK" });
    await avisar({ ...aviso, frente: "ESCALA" });
  } else {
    await avisar({
      para: r.autorEmail,
      tipo: "feedback.respuesta",
      titulo: `Respondieron tu comentario de la Escala, en ${r.escalaAncla}`,
      detalle: recorte(args.cuerpo),
      href: `/para-ti?feedback=${r.id}`,
      actorEmail: args.email,
      dedupeKey: `feedback.respuesta:${mensaje.id}`,
    });
  }
}

/** Los que están en la hoja de ruta con su fila del manual, en el orden en que se detectaron. */
export async function cambiosPendientes(escala: Escala | null): Promise<ComentarioVisto[]> {
  const lista = await filas({ where: { ...DE_LA_ESCALA, estado: "en_hoja" }, orderBy: { createdAt: "asc" } });
  return (await verTodos(lista, escala)).filter((c) => !!c.cambio);
}

// ── Lo que ve la bandeja de /feedback de un reporte de la escala ─────────────

/** Para un reporte de la escala: lo que se comentó, leído contra la versión vigente. */
export async function detalleDeEscala(f: { escalaAncla: string | null; escala: unknown; cuerpo: string; estado: string; createdAt: Date }): Promise<DetalleDeEscala | null> {
  if (!f.escalaAncla) return null;
  const e = escalaDe({ escala: f.escala as Prisma.JsonValue, escalaAncla: f.escalaAncla });
  const vigente = await leerEscalaVigente();
  const escala = vigente.estado === "ok" ? vigente.escala : null;
  const edicion = e.edicion && escala ? edicionPorSlug(escala, e.edicion) : null;
  const hoy = escala ? resolverAncla(aplicarEdicion(escala, e.edicion), f.escalaAncla) : null;
  return {
    ancla: f.escalaAncla,
    tipo: etiquetaDeTipo(e.tipo),
    ruta: hoy?.ruta ?? null,
    textoAnclado: e.textoAnclado,
    textoDeHoy: escala ? (hoy?.texto ?? null) : e.textoAnclado,
    version: e.version,
    versionVigente: escala?.version ?? null,
    edicion: e.edicion ? (edicion?.nombre ?? e.edicion) : null,
    cliente: e.cliente ? { nombre: e.cliente.nombre, enNexus: !!e.cliente.id } : null,
    perfil: describirPerfil(e.perfil) || null,
    decision: e.decision,
    cambio: f.estado === "en_hoja" ? e.cambio : null,
    sugerida: e.cambio ?? filaSugerida({ ancla: f.escalaAncla, tipo: e.tipo, cuerpo: f.cuerpo, cliente: e.cliente, decisionQueCambiaria: e.decision, cambio: null, edicion: e.edicion ? { slug: e.edicion, nombre: edicion?.nombre ?? e.edicion } : null }),
  };
}

/** Al llevar un reporte de la escala a la hoja de ruta: su fila del manual (la pide la decisión). */
export function conLaFilaDelManual(escala: unknown, escalaAncla: string, cambio: FilaDelManual): Prisma.InputJsonValue {
  const e = escalaDe({ escala: escala as Prisma.JsonValue, escalaAncla });
  return { ...e, cambio } as unknown as Prisma.InputJsonValue;
}
