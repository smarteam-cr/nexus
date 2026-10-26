/**
 * lib/tareas/mutaciones.ts — el ÚNICO escritor de Tareas internas (docs/tareas-plan.md §2). SERVIDOR.
 *
 * Toda escritura de las tablas de tareas pasa por acá (lo vigila lib/tareas/guardas.test.ts), con su evento en la
 * misma transacción. Las reglas que hace cumplir:
 *   - Una tarea es UNA fila de la propuesta a la lápida. Decidir es `UPDATE … WHERE estado='propuesta' AND
 *     version=?`: si no actualiza nada, 409 «ya la decidió otra persona». Nunca se aprueba dos veces.
 *   - La semana la elige `semanaDestino()`: la primera que la persona NO revisó, y lo que sigue nunca cae en el pasado.
 *   - `ResultadoDeSemana` lo escribe SOLO `anotarResultado()`, con la foto del cliente, del ámbito y del proyecto.
 *   - El «para quién» se rellena hacia abajo: una tarea en un proyecto con cliente lo hereda; con proyecto de HubSpot,
 *     su cliente es el del proyecto.
 *   - Fusionar nunca cruza clientes.
 *   - Nunca escribe Project, Client, TimelineTask ni nada en HubSpot. Lo que llega de HubSpot (las tareas de HubSpot,
 *     etapa 3 de docs/mi-dia-plan.md) se escribe acá; lo que va hacia HubSpot lo escribe lib/tareas-hubspot.
 *   - Los avisos salen DESPUÉS de escribir, una vez por destinatario, nunca a quien hizo la acción.
 */
import "server-only";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { avisar } from "@/lib/para-ti/avisos-server";
import { olvidarMedicion } from "@/lib/para-ti/medir-server";
import { proyectoClasificableWhere } from "@/lib/projects/scope";
import {
  SISTEMA,
  accionesDe,
  estaAbierta,
  leerBloques,
  leerEstado,
  leerPrioridad,
  nacePropuesta,
  repartirBloques,
  type AccionesDeTarea,
  type BloqueDeAgenda,
  type Prioridad,
} from "./estados";
import { DIAS_PARA_CORREGIR_UNA_REVISION, DIAS_PARA_VENCER_UNA_PROPUESTA, MAX_PROPUESTAS_POR_PERSONA_POR_REUNION_CON_CLIENTE, MAX_SECCIONES, MAX_SUGERENCIAS_POR_PERSONA } from "./reglas";
import { cupoPorPersona } from "./cupo";
import {
  aDate,
  comoFecha,
  lunesDeFecha,
  hoyEnCostaRica,
  lunesDeHoy,
  primeraSemanaSinRevisar,
  semanaAlAceptar,
  sumarSemanas,
  viernesDe,
} from "./semana";
import { huellaDeTexto, normalizar } from "./texto";
import { claveDeEquipo, duenoDelEquipoPersonal, equiposQueLidera, esEquipoPersonal, nombreDelEquipo, EQUIPOS } from "./equipos";
import { ErrorDeTareas, equipoDe, lideresDe, nombreDe, type ContextoDeTareas } from "./servidor";
import { administraElProyecto, proyectosVisiblesWhere, tareasVisiblesWhere, veLaTarea, type QuienVe } from "./visibilidad";
import { duenosDeReuniones } from "@/lib/sessions/reuniones-para-tareas";
import { ambitoConDatos, datosDeAmbito } from "./ambito-server";
import type { ClientesQueVes } from "./clientes";
import { instanteCR } from "./agenda";
import { NO_SON_PERSONAS } from "./toques";
import { DE_LA_PREVENTA } from "@/lib/exploraciones/marco";
import { ESTADOS_QUE_SE_MUDAN, firmaDelPase, porQueLaMueveElPase, textoDelPase, type MotivoDelPase, type PorQueLaMueve } from "./pase";
import { elegirCandidato } from "@/lib/hubspot/cliente-de-la-empresa";
import { OBJETO_PROYECTOS } from "@/lib/hubspot/asociaciones-proyecto";
import { OBJETOS_QUE_SE_VINCULAN, leerEnlaceDeHubspot, seVincula, type EnlaceDeHubspot } from "@/lib/hubspot/urls";
import { leerRegistroParaVincular, portalDelSistema, type FotoDeRegistro } from "@/lib/hubspot/registro-para-vincular";
import type { DuenoDelVinculo, PermisosDeVinculo } from "./tipos";
import { agregarTurnoEnTx, bloquearHiloEnTx } from "@/lib/asistente/hilo";
import { estadosDeAcuerdo } from "@/lib/asistente/acuerdo-vivo";
import { marcaDeDesenlace } from "@/lib/asistente/acuerdo";
import { dependenciasDeOperacionesDeTareas, type OperacionDeTareas, type RefATarea } from "./chat/operaciones";
import { textoDelDesenlaceDeTareas } from "./chat/textos";
import { origenDeLaElegida } from "./reunion-elegida";

type Tx = Prisma.TransactionClient;
type Db = PrismaClient | Tx;

const OPCIONES_DE_TX = { timeout: 20_000, maxWait: 10_000 } as const;

/* ── Utilidades ──────────────────────────────────────────────────────────────────── */

function esUnicoDuplicado(e: unknown): boolean {
  return !!e && typeof e === "object" && (e as { code?: string }).code === "P2002";
}

export function urlDeLaTarea(id: string): string {
  return `/tareas?t=${encodeURIComponent(id)}`;
}

function etiquetaT(numero: number): string {
  return `T-${numero}`;
}

/** Las semanas que una persona ya revisó, como `AAAA-MM-DD`. */
async function semanasRevisadas(db: Db, email: string): Promise<Set<string>> {
  const filas = await db.cierreDeSemana.findMany({ where: { personaEmail: email.toLowerCase() }, select: { semana: true } });
  return new Set(filas.map((f) => comoFecha(f.semana)!));
}

/** `semanaDestino(persona, deseada)`: la primera semana que no revisó, desde la deseada. Con piso en hoy si `conPiso`. */
export async function semanaDestino(db: Db, email: string, deseada: string, conPiso = true, ahora = new Date()): Promise<string> {
  const revisadas = await semanasRevisadas(db, email);
  return primeraSemanaSinRevisar(deseada, revisadas, { lunesDeHoy: lunesDeHoy(ahora), conPiso });
}

/** El espacio de un equipo. Lo crea la primera vez que hace falta (upsert por `equipo`). */
export async function asegurarEspacio(db: Db, equipo: string): Promise<{ id: string }> {
  const nombre = esEquipoPersonal(equipo) ? "Tareas personales" : (EQUIPOS.find((e) => e.clave === equipo)?.nombre ?? equipo);
  return db.espacioDeTareas.upsert({
    where: { equipo },
    create: { tipo: "equipo", equipo, nombre, creadoPorEmail: SISTEMA },
    update: {},
    select: { id: true },
  });
}

async function evento(
  tx: Tx,
  e: { tareaId?: string; proyectoId?: string; tipo: string; porEmail: string; datos?: Record<string, unknown>; sessionId?: string | null; cita?: string | null },
) {
  await tx.tareaEvento.create({
    data: {
      tareaId: e.tareaId ?? null,
      proyectoId: e.tareaId ? null : (e.proyectoId ?? null),
      tipo: e.tipo,
      porEmail: e.porEmail,
      sessionId: e.sessionId ?? null,
      cita: e.cita ?? null,
      datos: (e.datos ?? {}) as Prisma.InputJsonValue,
    },
  });
}

/* ── El «para quién» ─────────────────────────────────────────────────────────────── */

interface ParaQuien {
  clientId: string | null;
  projectId: string | null;
  proyectoId: string | null;
}

/**
 * Valida y completa cliente, proyecto de HubSpot y proyecto de tareas. Un proyecto con cliente o proyecto de HubSpot
 * lo impone a sus tareas; un proyecto de HubSpot impone su cliente. Solo se elige entre las empresas que ves.
 * Un proyecto NUEVO (distinto de `proyectoActual`) tiene que ser uno que ves y que está activo o en pausa, como en el
 * selector: si no, cualquiera con el id metería tareas en un proyecto privado. Si no cambia, no se exige: el responsable
 * de una tarea en un proyecto que no ve la sigue pudiendo editar.
 */
async function resolverParaQuien(
  db: Db,
  pedido: ParaQuien,
  clientes: ClientesQueVes,
  quien: QuienVe,
  proyectoActual: string | null = null,
  clienteActual: string | null = null,
): Promise<ParaQuien> {
  let { clientId, projectId } = pedido;
  const { proyectoId } = pedido;
  if (proyectoId) {
    const nuevo = proyectoId !== proyectoActual;
    const p = await db.proyectoDeTareas.findFirst({
      where: { AND: [{ id: proyectoId, archivadoAt: null }, nuevo ? { AND: [proyectosVisiblesWhere(quien), { estado: { in: ["activo", "en_pausa"] } }] } : {}] },
      select: { clientId: true, projectId: true },
    });
    if (!p) throw new ErrorDeTareas(404, "Ese proyecto no existe.");
    if (p.projectId) {
      if (projectId && projectId !== p.projectId) throw new ErrorDeTareas(400, "Una tarea de un proyecto con proyecto de HubSpot lleva el mismo.");
      projectId = p.projectId;
    }
    if (p.clientId) {
      if (clientId && clientId !== p.clientId) throw new ErrorDeTareas(400, "Una tarea de un proyecto con cliente lleva el mismo cliente.");
      clientId = p.clientId;
    }
  }
  if (projectId) {
    const pr = await db.project.findFirst({ where: proyectoClasificableWhere({ id: projectId }), select: { clientId: true } });
    if (!pr) throw new ErrorDeTareas(400, "Ese proyecto de HubSpot no está activo.");
    if (clientId && clientId !== pr.clientId) throw new ErrorDeTareas(400, "El proyecto de HubSpot es de otra empresa.");
    clientId = pr.clientId;
  }
  // Elegir una empresa pide verla; conservar la que ya tiene la tarea no (una reunión de un cliente le puede dar una
  // propuesta a alguien que no ve esa cuenta, y la tiene que poder usar).
  if (clientId && clientId !== clienteActual && !clientes.ids.has(clientId)) throw new ErrorDeTareas(404, "No puedes elegir esa empresa.");
  return { clientId, projectId, proyectoId };
}

/**
 * La cita de una reunión ata a la tarea a su cliente (INV42): una tarea que salió de una reunión de Wherex no puede pasar
 * a ser de Honda. Puede quedar sin cliente, o con el de la reunión. Una reunión interna no ata a nadie.
 */
async function exigirClienteDeLaCita(tareas: readonly { sessionId: string | null; cita: string | null; clientId: string | null }[], nuevoClientId: string | null): Promise<void> {
  if (!nuevoClientId) return;
  const conCita = tareas.filter((t) => t.sessionId && t.cita && t.clientId !== nuevoClientId);
  if (!conCita.length) return;
  const duenos = await duenosDeReuniones(conCita.map((t) => t.sessionId!));
  for (const t of conCita) {
    const d = duenos.get(t.sessionId!);
    if (d?.clientId && !d.interno && d.clientId !== nuevoClientId) {
      throw new ErrorDeTareas(400, "Salió de una reunión de otro cliente: su cliente es el de esa reunión, o ninguno.");
    }
  }
}

/* ── Crear ───────────────────────────────────────────────────────────────────────── */

export interface NuevaTarea {
  titulo: string;
  notas?: string | null;
  /** Correo de la persona. Sin `para` ni `paraEquipo`: es para quien la crea. */
  para?: string | null;
  /** Un pedido a un EQUIPO: va a su «Por asignar» y avisa a su líder. */
  paraEquipo?: string | null;
  /** `esta_semana` · `proxima_semana` · `sin_semana` · un lunes `AAAA-MM-DD`. */
  cuando?: string | null;
  prioridad?: Prioridad;
  minutosEstimados?: number | null;
  venceEl?: string | null;
  clientId?: string | null;
  projectId?: string | null;
  proyectoId?: string | null;
  privada?: boolean;
  seccion?: string | null;
  etiquetas?: string[];
  /** El negocio y el contacto de HubSpot (ids externos), fase 0.2. */
  hubspotDealId?: string | null;
  hubspotContactId?: string | null;
  /** Quién se comprometió. Sin esto, Smarteam. */
  lado?: "smarteam" | "cliente";
  /** «paso» = la escribió alguien como el siguiente paso de su equipo (lib/siguiente-paso); «chat» = la propuso el chat
   *  de Nexus sobre la cuenta y la aplicó una persona; «plantilla» = una rutina de un servicio recurrente
   *  (lib/servicios/rutinas.ts), que la persona pidió crear desde la guía del servicio. */
  origen?: "paso" | "chat" | "plantilla";
  /** Clave para no crearla dos veces (el chat de la cuenta: `n:<turno>:<i>`). Si ya existe, se devuelve esa. */
  origenId?: string | null;
}

export interface TareaCreada {
  id: string;
  numero: number;
  estado: string;
  /** Ya había una propuesta idéntica para esa persona: se le sumó la mención en vez de crear otra. */
  yaExistia: boolean;
}

function semanaDeseada(cuando: string | null | undefined, ahora: Date, enProyecto: boolean): string | null {
  const hoy = lunesDeHoy(ahora);
  if (!cuando) return enProyecto ? null : hoy;
  if (cuando === "sin_semana") return null;
  if (cuando === "esta_semana") return hoy;
  if (cuando === "proxima_semana") return sumarSemanas(hoy, 1);
  if (/^\d{4}-\d{2}-\d{2}$/.test(cuando)) return lunesDeFecha(cuando);
  return hoy;
}

/** ¿Los dos son miembros del espacio LIBRE del proyecto? */
async function ambosEnElEspacioLibre(db: Db, proyectoId: string | null, a: string, b: string): Promise<boolean> {
  if (!proyectoId) return false;
  const p = await db.proyectoDeTareas.findUnique({
    where: { id: proyectoId },
    select: { espacio: { select: { tipo: true, miembros: { where: { email: { in: [a, b] } }, select: { email: true } } } } },
  });
  return p?.espacio.tipo === "libre" && p.espacio.miembros.length === 2;
}

export async function crearTarea(ctx: ContextoDeTareas, clientes: ClientesQueVes, n: NuevaTarea, ahora = new Date()): Promise<TareaCreada> {
  const titulo = n.titulo.trim();
  if (!titulo) throw new ErrorDeTareas(400, "Escribe qué hay que hacer.");
  const yo = ctx.email;
  const enProyecto = !!n.proyectoId;

  // ¿Para quién?
  let responsable: string | null = null;
  let equipo: string | null = null;
  if (n.paraEquipo) {
    if (!EQUIPOS.some((e) => e.clave === n.paraEquipo)) throw new ErrorDeTareas(400, "Ese equipo no existe.");
    // Un pedido a un equipo lo reparte su líder: sin líder, nadie lo vería (la pantalla solo ofrece equipos con líder).
    if (!lideresDe(n.paraEquipo, ctx.miembros).length) throw new ErrorDeTareas(400, "Ese equipo todavía no tiene líder: pídeselo a una persona del equipo.");
    equipo = n.paraEquipo;
  } else {
    responsable = (n.para ?? yo).toLowerCase();
    equipo = equipoDe(responsable, ctx.miembros);
    if (!equipo) throw new ErrorDeTareas(400, "Esa persona no está en el equipo.");
  }

  const para = await resolverParaQuien(prisma, { clientId: n.clientId ?? null, projectId: n.projectId ?? null, proyectoId: n.proyectoId ?? null }, clientes, ctx);
  const lideraElSprint = !!equipo && (ctx.lidera.includes(equipo) || ctx.esSuperAdmin);
  const propuesta = nacePropuesta(yo, responsable, {
    equipoDelResponsable: equipo,
    creadorLideraEseEquipo: lideraElSprint,
    ambosEnElEspacioLibre: responsable ? await ambosEnElEspacioLibre(prisma, para.proyectoId, yo, responsable) : false,
  });
  // Un pedido a un equipo es una propuesta para su líder (que la reparte).
  const estado = n.paraEquipo ? "propuesta" : propuesta ? "propuesta" : "pendiente";
  const deseada = responsable ? semanaDeseada(n.cuando, ahora, enProyecto) : null;
  const semana = deseada && responsable ? (estado === "propuesta" ? deseada : await semanaDestino(prisma, responsable, deseada, true, ahora)) : null;
  const deOtraPersona = !!responsable && responsable !== yo;
  const deOtroEquipo = !!equipo && equipo !== ctx.equipo;

  const data: Prisma.TareaUncheckedCreateInput = {
    titulo,
    huella: huellaDeTexto(titulo),
    notas: n.notas?.trim() || null,
    estado,
    prioridad: n.prioridad ?? "media",
    tipo: deOtroEquipo && (deOtraPersona || n.paraEquipo) ? "apoyo" : "puesto",
    // Privada solo lo que es tuyo: un pedido a un equipo (sin responsable) tampoco.
    privada: !!n.privada && responsable === yo,
    seccion: n.seccion ?? null,
    etiquetas: (n.etiquetas ?? []).slice(0, 5),
    equipo,
    responsableEmail: responsable,
    semana: semana ? aDate(semana) : null,
    venceEl: n.venceEl ? aDate(n.venceEl) : null,
    minutosEstimados: n.minutosEstimados ?? null,
    proyectoId: para.proyectoId,
    clientId: para.clientId,
    projectId: para.projectId,
    hubspotDealId: n.hubspotDealId?.trim() || null,
    hubspotContactId: n.hubspotContactId?.trim() || null,
    lado: n.lado ?? "smarteam",
    origen: n.origen ?? (deOtraPersona || n.paraEquipo ? "pedido" : "mano"),
    origenId: n.origenId ?? null,
    creadaPorEmail: yo,
    pedidaPorEmail: deOtraPersona || n.paraEquipo ? yo : null,
    pedidaPorEquipo: deOtroEquipo ? ctx.equipo : null,
  };

  try {
    const creada = await prisma.$transaction(async (tx) => {
      const t = await tx.tarea.create({ data, select: { id: true, numero: true, estado: true } });
      await evento(tx, { tareaId: t.id, tipo: estado === "propuesta" ? "propuesta" : "creada", porEmail: yo, datos: { para: responsable, equipo } });
      return t;
    }, OPCIONES_DE_TX);

    // Avisos, después de escribir. Una sugerencia o un pedido a un equipo NO avisa (fase 1.3): ya es un pendiente en
    // «Para ti» («Te pidieron…», «Le pidieron… a tu equipo»). Una asignación directa sí.
    if (n.paraEquipo) {
      for (const lider of lideresDe(n.paraEquipo, ctx.miembros)) olvidarMedicion(lider.email);
    } else if (estado !== "propuesta" && deOtraPersona && responsable) {
      await avisar({
        para: responsable,
        tipo: "tareas.asignada",
        titulo: `${ctx.nombre} te asignó «${titulo}»`,
        href: urlDeLaTarea(creada.id),
        actorEmail: yo,
        dedupeKey: `tareas.asignada:${creada.id}:${responsable}`,
      });
    }
    if (responsable) olvidarMedicion(responsable);
    olvidarMedicion(yo);
    return { ...creada, yaExistia: false };
  } catch (e) {
    if (!esUnicoDuplicado(e)) throw e;
    // Ya se creó con esta clave (el mismo cambio aplicado dos veces): es esa, sin otra mención.
    if (n.origenId) {
      const misma = await prisma.tarea.findUnique({ where: { origenId: n.origenId }, select: { id: true, numero: true, estado: true } });
      if (misma) return { ...misma, yaExistia: true };
    }
    // Ya hay una propuesta idéntica para esa persona, del mismo cliente y del mismo pedido: se le suma la mención.
    const existente = await prisma.tarea.findFirst({
      where: { estado: "propuesta", huella: data.huella, responsableEmail: responsable, clientId: para.clientId, pedidaPorEmail: data.pedidaPorEmail ?? null },
      select: { id: true, numero: true, estado: true },
    });
    if (!existente) throw e;
    await prisma.$transaction((tx) => evento(tx, { tareaId: existente.id, tipo: "mencionada", porEmail: yo, datos: { de: "mano" } }));
    return { ...existente, yaExistia: true };
  }
}

/* ── Cargar con la versión ───────────────────────────────────────────────────────── */

const SELECT_PARA_ESCRIBIR = {
  id: true,
  numero: true,
  titulo: true,
  estado: true,
  version: true,
  responsableEmail: true,
  creadaPorEmail: true,
  pedidaPorEmail: true,
  pedidaPorEquipo: true,
  equipo: true,
  semana: true,
  venceEl: true,
  clientId: true,
  projectId: true,
  proyectoId: true,
  privada: true,
  archivadaAt: true,
  sessionId: true,
  cita: true,
  origen: true,
  minutosEstimados: true,
  completadaAt: true,
  agendaEstado: true,
  agendaBloques: true,
  huella: true,
  lecturaId: true,
  hubspotTaskId: true,
  hubspotContactId: true,
  hubspotDealId: true,
  proyecto: { select: { espacio: { select: { tipo: true, visibilidad: true, equipo: true, miembros: { select: { email: true } } } } } },
} satisfies Prisma.TareaSelect;

type TareaParaEscribir = Prisma.TareaGetPayload<{ select: typeof SELECT_PARA_ESCRIBIR }>;

async function cargar(db: Db, id: string, ctx: ContextoDeTareas): Promise<TareaParaEscribir> {
  const t = await db.tarea.findUnique({ where: { id }, select: SELECT_PARA_ESCRIBIR });
  if (!t) throw new ErrorDeTareas(404, "Esa tarea no existe.");
  const espacio = t.proyecto?.espacio ? { ...t.proyecto.espacio, miembros: t.proyecto.espacio.miembros.map((m) => m.email) } : null;
  if (!veLaTarea({ ...t, espacio }, ctx)) throw new ErrorDeTareas(404, "Esa tarea no existe.");
  return t;
}

function accionesPara(t: TareaParaEscribir, ctx: ContextoDeTareas, ahora: Date): AccionesDeTarea {
  const espacioLibre = t.proyecto?.espacio?.tipo === "libre" && t.proyecto.espacio.miembros.some((m) => m.email === ctx.email);
  return accionesDe(
    { ...t, semana: comoFecha(t.semana) },
    ctx,
    { lunesDeHoy: lunesDeHoy(ahora), esMiembroDelEspacioLibre: espacioLibre },
  );
}

/** Actualiza con control de versión. 409 si otra persona la cambió (o ya la decidió). */
async function actualizar(tx: Tx, t: { id: string; version: number }, where: Prisma.TareaWhereInput, data: Prisma.TareaUncheckedUpdateInput, mensaje409 = "Otra persona cambió esta tarea. Recarga para ver lo último.") {
  const r = await tx.tarea.updateMany({ where: { id: t.id, version: t.version, ...where }, data: { ...data, version: { increment: 1 } } });
  if (r.count === 0) throw new ErrorDeTareas(409, mensaje409);
}

/* ── El resultado de una semana ──────────────────────────────────────────────────── */

export type ResultadoAnotado = "hecha" | "pasa" | "mas_adelante" | "no_se_hara";

/**
 * La ÚNICA que escribe `ResultadoDeSemana`, con las fotos del cliente, el ámbito, el proyecto y el vencimiento.
 * Mientras la persona no revisó W, la fila se reemplaza. Si la revisó ella, la puede corregir 7 días. Lo que marcó
 * su líder o el sistema lo corrige encima.
 */
export async function anotarResultado(
  tx: Tx,
  t: { id: string; responsableEmail: string | null; equipo: string | null; clientId: string | null; projectId: string | null; proyectoId: string | null; venceEl: Date | null; minutosEstimados: number | null },
  semana: string,
  resultado: ResultadoAnotado,
  quien: string,
  ahora = new Date(),
): Promise<void> {
  if (t.responsableEmail) {
    const cierre = await tx.cierreDeSemana.findUnique({
      where: { personaEmail_semana: { personaEmail: t.responsableEmail, semana: aDate(semana) } },
      select: { cerradaPor: true, cerradaAt: true },
    });
    const noSeCorrige = porQueNoSeCorrige(cierre, t.responsableEmail, quien, ahora);
    if (noSeCorrige) throw new ErrorDeTareas(409, noSeCorrige);
    if (cierre) await evento(tx, { tareaId: t.id, tipo: "cierre_corregido", porEmail: quien, datos: { semana, resultado } });
  }
  const datos = await datosDeAmbito([t.clientId], [t.projectId], tx);
  const ambito = ambitoConDatos(datos, t.clientId, t.projectId);
  const empresa = t.clientId ? datos.empresas.get(t.clientId) : null;
  const fila = {
    equipo: t.equipo,
    responsableEmail: t.responsableEmail,
    fotoCliente: t.clientId,
    fotoClienteNombre: empresa?.nombre ?? null,
    fotoAmbito: ambito.ambito,
    fotoAmbitoNombre: ambito.etiqueta,
    proyectoId: t.proyectoId,
    venceEl: t.venceEl,
    resultado,
    decididoPor: quien,
    decididoAt: ahora,
    minutosEstimados: t.minutosEstimados,
  };
  await tx.resultadoDeSemana.upsert({
    where: { tareaId_semana: { tareaId: t.id, semana: aDate(semana) } },
    create: { tareaId: t.id, semana: aDate(semana), ...fila },
    update: fila,
  });
}

/**
 * ¿Se puede reescribir el resultado de una semana? null = sí. Lo que la persona revisó lo corrige ella, 7 días; lo que
 * cerró su líder o el sistema se corrige encima.
 */
function porQueNoSeCorrige(cierre: { cerradaPor: string; cerradaAt: Date } | null, responsable: string, quien: string, ahora: Date): string | null {
  if (!cierre || cierre.cerradaPor !== responsable) return null;
  if (quien !== responsable) return "Esa persona ya revisó esa semana.";
  if (+ahora - +cierre.cerradaAt > DIAS_PARA_CORREGIR_UNA_REVISION * 86_400_000) return "Esa semana ya se revisó hace más de 7 días.";
  return null;
}

/** Reabrir una tarea antes de revisar su semana borra su resultado (se vuelve a anotar al revisarla). El otro escritor
 *  de `ResultadoDeSemana`, al lado del primero a propósito: guardas.test.ts no deja que nadie más lo toque. */
export async function quitarResultado(tx: Tx, tareaId: string, semana: string): Promise<void> {
  await tx.resultadoDeSemana.deleteMany({ where: { tareaId, semana: aDate(semana) } });
}

/* ── Decidir una propuesta ───────────────────────────────────────────────────────── */

export type Decision =
  | { tipo: "usar"; cambios?: CambiosDeTarea; usarClienteSugerido?: boolean }
  | { tipo: "mas_adelante"; desde?: string | null }
  | { tipo: "rechazar"; motivo?: string | null }
  | { tipo: "no_es_mia"; para: string }
  | { tipo: "misma"; otraId: string }
  | { tipo: "retirar" };

export interface CambiosDeTarea {
  titulo?: string;
  notas?: string | null;
  prioridad?: Prioridad;
  minutosEstimados?: number | null;
  venceEl?: string | null;
  clientId?: string | null;
  projectId?: string | null;
  proyectoId?: string | null;
  privada?: boolean;
  seccion?: string | null;
  etiquetas?: string[];
  /** El contacto y el negocio de HubSpot (ids externos), entre los de su cliente. Con uno, es seguimiento comercial (D4). */
  hubspotContactId?: string | null;
  hubspotDealId?: string | null;
}

/** Lo que sugirió Nexus al proponerla (cliente, proyecto): vive en su evento `propuesta`. */
async function sugerenciasDe(db: Db, tareaId: string): Promise<{ clienteSugeridoId?: string; proyectoSugeridoId?: string }> {
  const e = await db.tareaEvento.findFirst({ where: { tareaId, tipo: "propuesta" }, orderBy: { createdAt: "asc" }, select: { datos: true } });
  const d = (e?.datos ?? {}) as Record<string, unknown>;
  return {
    clienteSugeridoId: typeof d.clienteSugeridoId === "string" ? d.clienteSugeridoId : undefined,
    proyectoSugeridoId: typeof d.proyectoSugeridoId === "string" ? d.proyectoSugeridoId : undefined,
  };
}

function hayCambios(c: CambiosDeTarea | undefined): boolean {
  return !!c && Object.values(c).some((v) => v !== undefined);
}

export async function decidirTarea(ctx: ContextoDeTareas, clientes: ClientesQueVes, id: string, version: number, d: Decision, ahora = new Date()) {
  const t = await cargar(prisma, id, ctx);
  if (t.version !== version) throw new ErrorDeTareas(409, "Otra persona cambió esta tarea. Recarga para ver lo último.");
  if (leerEstado(t.estado) !== "propuesta") throw new ErrorDeTareas(409, "Esa tarea ya se decidió.");
  const acc = accionesPara(t, ctx, ahora);
  const yo = ctx.email;
  const avisosDespues: Parameters<typeof avisar>[0][] = [];
  const respuesta = (texto: string) => {
    if (t.pedidaPorEmail && t.pedidaPorEmail !== yo) {
      avisosDespues.push({
        para: t.pedidaPorEmail,
        tipo: "tareas.respuesta",
        titulo: texto,
        href: urlDeLaTarea(t.id),
        actorEmail: yo,
        dedupeKey: `tareas.respuesta:${t.id}:${d.tipo}:${t.version}`,
      });
    }
  };

  if (d.tipo === "retirar") {
    if (!acc.retirar) throw new ErrorDeTareas(403, "Solo quien la pidió puede retirarla.");
    // Si era TUYA y se la pasaste a otra persona, retirar el pedido te la devuelve como estaba: no se cierra para siempre.
    const pase = await prisma.tareaEvento.findFirst({ where: { tareaId: t.id, tipo: "asignada", porEmail: yo }, orderBy: { createdAt: "desc" }, select: { datos: true } });
    const dp = (pase?.datos ?? {}) as { directo?: unknown; desde?: unknown; estadoAntes?: unknown; semanaAntes?: unknown };
    const devolver = dp.directo === false && dp.desde === yo && (dp.estadoAntes === "pendiente" || dp.estadoAntes === "en_curso");
    if (devolver) {
      const semana = await semanaDestino(prisma, yo, typeof dp.semanaAntes === "string" ? dp.semanaAntes : lunesDeHoy(ahora), true, ahora);
      await prisma.$transaction(async (tx) => {
        await actualizar(tx, t, { estado: "propuesta" }, {
          estado: dp.estadoAntes as "pendiente" | "en_curso",
          responsableEmail: yo,
          equipo: equipoDe(yo, ctx.miembros) ?? t.equipo,
          semana: aDate(semana),
          pedidaPorEmail: null,
          pedidaPorEquipo: null,
          tipo: "puesto",
          agendaEstado: "sin_agendar",
        }, "Ya la decidió otra persona.");
        await evento(tx, { tareaId: t.id, tipo: "asignada", porEmail: yo, datos: { desde: t.responsableEmail, hacia: yo, retirada: true } });
      });
      if (t.responsableEmail) olvidarMedicion(t.responsableEmail);
      olvidarMedicion(yo);
      return;
    }
    await prisma.$transaction(async (tx) => {
      await actualizar(tx, t, { estado: "propuesta" }, { estado: "rechazada", decision: "retirada", decididaPorEmail: yo, decididaAt: ahora }, "Ya la decidió otra persona.");
      await evento(tx, { tareaId: t.id, tipo: "decidida", porEmail: yo, datos: { decision: "retirada" } });
    });
    if (t.responsableEmail) olvidarMedicion(t.responsableEmail);
    olvidarMedicion(yo);
    return;
  }

  if (!acc.decidir) throw new ErrorDeTareas(403, "Esta propuesta la decide otra persona.");
  const nombre = ctx.nombre;

  if (d.tipo === "usar") {
    const sug = await sugerenciasDe(prisma, t.id);
    const c = d.cambios ?? {};
    const para = await resolverParaQuien(
      prisma,
      {
        clientId: c.clientId !== undefined ? c.clientId : (t.clientId ?? (d.usarClienteSugerido ? (sug.clienteSugeridoId ?? null) : null)),
        projectId: c.projectId !== undefined ? c.projectId : t.projectId,
        proyectoId: c.proyectoId !== undefined ? c.proyectoId : t.proyectoId,
      },
      clientes,
      ctx,
      t.proyectoId,
      t.clientId,
    );
    await exigirClienteDeLaCita([t], para.clientId);
    // Quien decide es el responsable, o el líder que reparte un pedido a su equipo (entonces se la queda).
    const responsable = t.responsableEmail ?? yo;
    const revisadas = await semanasRevisadas(prisma, responsable);
    const semana = semanaAlAceptar(comoFecha(t.semana), { lunesDeHoy: lunesDeHoy(ahora), revisadas, deUnaReunion: t.origen === "reunion" || t.origen === "notas" });
    // «Con cambios» también si la editó en el cajón antes de usarla: la métrica mide cuánto se corrige lo que propone Nexus.
    const editadaAntes = (await prisma.tareaEvento.count({ where: { tareaId: t.id, tipo: "editada" } })) > 0;
    const conCambios = hayCambios(c) || editadaAntes;
    await prisma.$transaction(async (tx) => {
      await actualizar(
        tx,
        t,
        { estado: "propuesta" },
        {
          estado: "pendiente",
          decision: conCambios ? "con_cambios" : "tal_cual",
          decididaPorEmail: yo,
          decididaAt: ahora,
          responsableEmail: responsable,
          equipo: equipoDe(responsable, ctx.miembros) ?? t.equipo,
          semana: aDate(semana),
          tipo: t.pedidaPorEquipo ? "apoyo" : "puesto",
          ...(c.titulo !== undefined ? { titulo: c.titulo.trim(), huella: huellaDeTexto(c.titulo) } : {}),
          ...(c.notas !== undefined ? { notas: c.notas } : {}),
          ...(c.prioridad !== undefined ? { prioridad: leerPrioridad(c.prioridad) } : {}),
          ...(c.minutosEstimados !== undefined ? { minutosEstimados: c.minutosEstimados } : {}),
          ...(c.venceEl !== undefined ? { venceEl: c.venceEl ? aDate(c.venceEl) : null } : {}),
          ...(c.privada !== undefined ? { privada: c.privada } : {}),
          ...(c.seccion !== undefined ? { seccion: c.seccion } : {}),
          ...(c.etiquetas !== undefined ? { etiquetas: c.etiquetas.slice(0, 5) } : {}),
          clientId: para.clientId,
          projectId: para.projectId,
          proyectoId: para.proyectoId,
        },
        "Ya la decidió otra persona.",
      );
      await evento(tx, { tareaId: t.id, tipo: "decidida", porEmail: yo, datos: { decision: conCambios ? "con_cambios" : "tal_cual", semana } });
    });
    respuesta(`${nombre} tomó «${t.titulo}»`);
  } else if (d.tipo === "mas_adelante") {
    const responsable = t.responsableEmail ?? yo;
    const semana = d.desde ? await semanaDestino(prisma, responsable, d.desde, true, ahora) : null;
    await prisma.$transaction(async (tx) => {
      await actualizar(tx, t, { estado: "propuesta" }, { estado: "pendiente", decision: "mas_adelante", decididaPorEmail: yo, decididaAt: ahora, responsableEmail: responsable, semana: semana ? aDate(semana) : null }, "Ya la decidió otra persona.");
      await evento(tx, { tareaId: t.id, tipo: "decidida", porEmail: yo, datos: { decision: "mas_adelante", desde: semana } });
    });
    respuesta(`${nombre} dejó «${t.titulo}» para más adelante`);
  } else if (d.tipo === "rechazar") {
    await prisma.$transaction(async (tx) => {
      await actualizar(tx, t, { estado: "propuesta" }, { estado: "rechazada", decision: "rechazada", decididaPorEmail: yo, decididaAt: ahora, motivo: d.motivo?.trim() || null }, "Ya la decidió otra persona.");
      await evento(tx, { tareaId: t.id, tipo: "decidida", porEmail: yo, datos: { decision: "rechazada" } });
    });
    respuesta(`${nombre} no va a tomar «${t.titulo}»${d.motivo ? `: ${d.motivo}` : ""}`);
  } else if (d.tipo === "no_es_mia") {
    const para = d.para.toLowerCase();
    const equipo = equipoDe(para, ctx.miembros);
    if (!equipo) throw new ErrorDeTareas(400, "Esa persona no está en el equipo.");
    if (para === (t.responsableEmail ?? "")) throw new ErrorDeTareas(400, "Ya es de esa persona.");
    try {
      await prisma.$transaction(async (tx) => {
        await actualizar(tx, t, { estado: "propuesta" }, { responsableEmail: para, equipo, agendaEstado: "sin_agendar" }, "Ya la decidió otra persona.");
        await evento(tx, { tareaId: t.id, tipo: "no_es_mia", porEmail: yo, datos: { desde: t.responsableEmail, hacia: para } });
      });
    } catch (e) {
      if (!esUnicoDuplicado(e)) throw e;
      // X ya tiene esa misma propuesta (mismo cliente, mismo pedido): se juntan.
      const igual = await prisma.tarea.findFirst({ where: { estado: "propuesta", huella: t.huella, responsableEmail: para, clientId: t.clientId, pedidaPorEmail: t.pedidaPorEmail }, select: { id: true } });
      if (!igual) throw e;
      await prisma.$transaction(async (tx) => {
        await actualizar(tx, t, { estado: "propuesta" }, { estado: "fusionada", decision: "misma", decididaPorEmail: yo, decididaAt: ahora, mismaQueId: igual.id }, "Ya la decidió otra persona.");
        await evento(tx, { tareaId: igual.id, tipo: "mencionada", porEmail: yo, sessionId: t.sessionId, cita: t.cita, datos: { de: "no_es_mia" } });
      });
    }
    // Sin aviso (fase 1.3): le queda como sugerencia en «Para ti».
    respuesta(`${nombre} dijo que «${t.titulo}» no era suya; se la pasó a ${nombreDe(para, ctx.miembros)}`);
    olvidarMedicion(para);
  } else if (d.tipo === "misma") {
    const otra = await cargar(prisma, d.otraId, ctx);
    if (otra.id === t.id) throw new ErrorDeTareas(400, "Es la misma tarea.");
    if (t.clientId && otra.clientId && t.clientId !== otra.clientId) throw new ErrorDeTareas(400, "Son de clientes distintos: no se pueden juntar.");
    if (!otra.clientId && t.clientId) await exigirClienteDeLaCita([otra], t.clientId);
    const responsableOtra = otra.responsableEmail;
    const destino =
      responsableOtra && estaAbierta(otra.estado)
        ? await semanaDestino(prisma, responsableOtra, comoFecha(t.semana) ?? lunesDeHoy(ahora), true, ahora)
        : null;
    await prisma.$transaction(async (tx) => {
      await actualizar(tx, t, { estado: "propuesta" }, { estado: "fusionada", decision: "misma", decididaPorEmail: yo, decididaAt: ahora, mismaQueId: otra.id }, "Ya la decidió otra persona.");
      await evento(tx, { tareaId: otra.id, tipo: "mencionada", porEmail: yo, sessionId: t.sessionId, cita: t.cita, datos: { de: "misma", desde: t.id } });
      const cambios: Prisma.TareaUncheckedUpdateInput = {};
      if (!otra.clientId && t.clientId) cambios.clientId = t.clientId;
      const semanaOtra = comoFecha(otra.semana);
      if (destino && destino !== semanaOtra) {
        cambios.semana = aDate(destino);
        cambios.agendaEstado = "sin_agendar";
        if (semanaOtra && semanaOtra < destino && otra.responsableEmail) {
          const revisadas = await semanasRevisadas(tx, otra.responsableEmail);
          if (!revisadas.has(semanaOtra)) await anotarResultado(tx, otra, semanaOtra, "pasa", yo, ahora);
        }
        await evento(tx, { tareaId: otra.id, tipo: "semana", porEmail: yo, datos: { desde: semanaOtra, hacia: destino } });
      }
      if (Object.keys(cambios).length) await tx.tarea.update({ where: { id: otra.id }, data: { ...cambios, version: { increment: 1 } } });
    });
  }

  for (const a of avisosDespues) await avisar(a);
  if (t.pedidaPorEmail) olvidarMedicion(t.pedidaPorEmail);
  if (t.responsableEmail) olvidarMedicion(t.responsableEmail);
  olvidarMedicion(yo);
}

/* ── Editar ──────────────────────────────────────────────────────────────────────── */

/**
 * El contacto y el negocio de HubSpot de una edición (D4, 2026-10-27). Solo de SU cliente (invariante 1): un contacto
 * vigente de `ContactoDeHubspot` y un negocio de `NegocioAbierto` de ese cliente. Cambiar el cliente los borra (salvo
 * que la misma edición traiga los del nuevo). Una tarea que ya está en HubSpot los cambia allá: acá quedan fijos.
 */
async function contactoYNegocio(
  t: Pick<TareaParaEscribir, "clientId" | "origen" | "hubspotTaskId" | "hubspotContactId" | "hubspotDealId">,
  c: Pick<CambiosDeTarea, "hubspotContactId" | "hubspotDealId">,
  clientId: string | null,
): Promise<Pick<Prisma.TareaUncheckedUpdateInput, "hubspotContactId" | "hubspotDealId">> {
  const tocaCrm = c.hubspotContactId !== undefined || c.hubspotDealId !== undefined;
  const cambiaCliente = clientId !== t.clientId;
  if (t.hubspotTaskId) {
    // La que nació en Nexus está allá asociada al contacto, al negocio y a la empresa de SU cliente: cambiarle el cliente
    // acá dejaría cada edición escribiéndose en la ficha del cliente anterior (invariante 1).
    if (cambiaCliente && t.origen !== "hubspot") throw new ErrorDeTareas(409, "Esta tarea también está en HubSpot, asociada a su cliente: no se le puede cambiar el cliente.");
    const distinto = (c.hubspotContactId !== undefined && (c.hubspotContactId || null) !== t.hubspotContactId) || (c.hubspotDealId !== undefined && (c.hubspotDealId || null) !== t.hubspotDealId);
    if (distinto) throw new ErrorDeTareas(409, "Esta tarea ya está en HubSpot: el contacto y el negocio se cambian allá.");
    return {};
  }
  if (!tocaCrm && !cambiaCliente) return {};
  const contacto = c.hubspotContactId !== undefined ? c.hubspotContactId?.trim() || null : cambiaCliente ? null : t.hubspotContactId;
  const negocio = c.hubspotDealId !== undefined ? c.hubspotDealId?.trim() || null : cambiaCliente ? null : t.hubspotDealId;
  if ((contacto || negocio) && !clientId) throw new ErrorDeTareas(400, "Elige primero el cliente de la tarea.");
  if (contacto && contacto !== t.hubspotContactId) {
    const ok = await prisma.contactoDeHubspot.findFirst({ where: { clientId: clientId!, hubspotId: contacto, vigente: true }, select: { id: true } });
    if (!ok) throw new ErrorDeTareas(400, "Ese contacto no es de este cliente en HubSpot.");
  }
  if (negocio && negocio !== t.hubspotDealId) {
    const ok = await prisma.negocioAbierto.findFirst({ where: { clientId: clientId!, hubspotDealId: negocio }, select: { id: true } });
    if (!ok) throw new ErrorDeTareas(400, "Ese negocio no es de este cliente en HubSpot.");
  }
  const out: Pick<Prisma.TareaUncheckedUpdateInput, "hubspotContactId" | "hubspotDealId"> = {};
  if (contacto !== t.hubspotContactId) out.hubspotContactId = contacto;
  if (negocio !== t.hubspotDealId) out.hubspotDealId = negocio;
  return out;
}

export async function editarTarea(ctx: ContextoDeTareas, clientes: ClientesQueVes, id: string, version: number, c: CambiosDeTarea, ahora = new Date()) {
  const t = await cargar(prisma, id, ctx);
  if (t.version !== version) throw new ErrorDeTareas(409, "Otra persona cambió esta tarea. Recarga para ver lo último.");
  const acc = accionesPara(t, ctx, ahora);
  if (!acc.editar) throw new ErrorDeTareas(403, "No puedes editar esta tarea.");
  if (c.privada !== undefined && c.privada !== t.privada && !acc.cambiarPrivada) throw new ErrorDeTareas(403, "Solo quien la tiene puede marcarla «Solo para mí».");
  // Lo que nació en Nexus y está en HubSpot es seguimiento comercial: no puede ser privado (D4; el CHECK de la base lo exige).
  if (c.privada === true && !t.privada && t.hubspotTaskId && t.origen !== "hubspot") throw new ErrorDeTareas(409, "Esta tarea también está en HubSpot: no puede ser «Solo para mí».");
  const tocaParaQuien = c.clientId !== undefined || c.projectId !== undefined || c.proyectoId !== undefined;
  const para = tocaParaQuien
    ? await resolverParaQuien(
        prisma,
        {
          clientId: c.clientId !== undefined ? c.clientId : t.clientId,
          projectId: c.projectId !== undefined ? c.projectId : c.clientId !== undefined && c.clientId !== t.clientId ? null : t.projectId,
          proyectoId: c.proyectoId !== undefined ? c.proyectoId : t.proyectoId,
        },
        clientes,
        ctx,
        t.proyectoId,
        t.clientId,
      )
    : null;
  if (para) await exigirClienteDeLaCita([t], para.clientId);
  // Sin responsable ni sprint, una tarea solo existe dentro de un proyecto (lo exige la base): sacarla pide asignarla antes.
  if (para && !para.proyectoId && !t.equipo) throw new ErrorDeTareas(400, "Esta tarea no tiene sprint: asígnala a alguien antes de sacarla del proyecto.");
  if (c.seccion && c.seccion.length > 60) throw new ErrorDeTareas(400, "El nombre de la sección es muy largo.");
  const crm = await contactoYNegocio(t, c, para?.clientId ?? t.clientId);
  const data: Prisma.TareaUncheckedUpdateInput = {
    ...(c.titulo !== undefined ? { titulo: c.titulo.trim(), huella: huellaDeTexto(c.titulo) } : {}),
    ...(c.notas !== undefined ? { notas: c.notas?.trim() || null } : {}),
    ...(c.prioridad !== undefined ? { prioridad: leerPrioridad(c.prioridad) } : {}),
    ...(c.minutosEstimados !== undefined ? { minutosEstimados: c.minutosEstimados } : {}),
    ...(c.venceEl !== undefined ? { venceEl: c.venceEl ? aDate(c.venceEl) : null } : {}),
    ...(c.privada !== undefined && c.privada !== t.privada && acc.cambiarPrivada ? { privada: c.privada } : {}),
    ...(c.seccion !== undefined ? { seccion: c.seccion } : {}),
    ...(c.etiquetas !== undefined ? { etiquetas: c.etiquetas.slice(0, 5) } : {}),
    ...(para ? { clientId: para.clientId, projectId: para.projectId, proyectoId: para.proyectoId } : {}),
    ...crm,
  };
  if (c.titulo !== undefined && !c.titulo.trim()) throw new ErrorDeTareas(400, "El título no puede quedar vacío.");
  // Un pedido sin cambios no sube la versión ni deja una edición vacía (contaría como «usar con cambios»).
  if (Object.keys(data).length === 0) return;
  try {
    await prisma.$transaction(async (tx) => {
      await actualizar(tx, t, {}, data);
      await evento(tx, { tareaId: t.id, tipo: "editada", porEmail: ctx.email, datos: { campos: Object.keys(data) } });
    });
  } catch (e) {
    if (esUnicoDuplicado(e)) throw new ErrorDeTareas(409, "Esa persona ya tiene una sugerencia igual sin decidir: decide esa primero.");
    throw e;
  }
}

/* ── Estado ──────────────────────────────────────────────────────────────────────── */

/**
 * Lo que corre después de escribir y no hace falta para responder (los avisos). La ruta pasa `after()` de Next, así la
 * casilla no espera a nadie; sin `diferir` corre enseguida, como antes (scripts, chat, pruebas).
 */
export type Diferir = (fn: () => Promise<void>) => void;

export async function cambiarEstado(
  ctx: ContextoDeTareas,
  id: string,
  version: number,
  hacia: "pendiente" | "en_curso" | "hecha" | "no_se_hara",
  motivo?: string | null,
  ahora = new Date(),
  opciones: { diferir?: Diferir } = {},
) {
  const t = await cargar(prisma, id, ctx);
  if (t.version !== version) throw new ErrorDeTareas(409, "Otra persona cambió esta tarea. Recarga para ver lo último.");
  const acc = accionesPara(t, ctx, ahora);
  const desde = leerEstado(t.estado);
  const permitido =
    (hacia === "en_curso" && (acc.empezar || (desde === "hecha" && acc.reabrir))) ||
    (hacia === "hecha" && acc.terminar) ||
    (hacia === "pendiente" && (acc.reabrir || (desde === "en_curso" && acc.terminar))) ||
    (hacia === "no_se_hara" && acc.noSeHara);
  if (!permitido || desde === hacia) throw new ErrorDeTareas(403, "No puedes mover esta tarea ahí.");
  if (hacia === "no_se_hara" && !motivo?.trim()) throw new ErrorDeTareas(400, "Escribe por qué ya no se hará.");
  const semana = comoFecha(t.semana);
  const reabre = (desde === "hecha" || desde === "no_se_hara") && (hacia === "pendiente" || hacia === "en_curso");

  await prisma.$transaction(async (tx) => {
    // Reabrir en una semana que ya se revisó: la tarea no puede quedar abierta ahí (INV40). Pasa a la primera semana sin
    // revisar, como «Sigue». La foto de esa semana pasa a «pasa» si todavía se puede corregir; si no, queda como se decidió.
    let destino: string | null = null;
    let corregirLaFoto = false;
    if (reabre && semana && t.responsableEmail) {
      const revisadas = await semanasRevisadas(tx, t.responsableEmail);
      if (revisadas.has(semana)) {
        destino = primeraSemanaSinRevisar(sumarSemanas(semana, 1), revisadas, { lunesDeHoy: lunesDeHoy(ahora), conPiso: true });
        const cierre = await tx.cierreDeSemana.findUnique({
          where: { personaEmail_semana: { personaEmail: t.responsableEmail, semana: aDate(semana) } },
          select: { cerradaPor: true, cerradaAt: true },
        });
        corregirLaFoto = !porQueNoSeCorrige(cierre, t.responsableEmail, ctx.email, ahora);
      } else {
        // El resultado de una semana que la persona todavía no revisó se borra (se vuelve a anotar al revisarla).
        await quitarResultado(tx, t.id, semana);
      }
    }
    await actualizar(tx, t, { estado: t.estado }, {
      estado: hacia,
      completadaAt: hacia === "hecha" ? ahora : null,
      ...(hacia === "no_se_hara" ? { motivo: motivo!.trim() } : {}),
      ...(reabre && desde === "no_se_hara" ? { motivo: null } : {}),
      ...(destino ? { semana: aDate(destino), agendaEstado: "sin_agendar" } : {}),
    });
    await evento(tx, { tareaId: t.id, tipo: "estado", porEmail: ctx.email, datos: { desde, hacia, motivo: motivo ?? null } });
    if (destino) {
      await evento(tx, { tareaId: t.id, tipo: "semana", porEmail: ctx.email, datos: { desde: semana, hacia: destino } });
      if (corregirLaFoto) await anotarResultado(tx, t, semana!, "pasa", ctx.email, ahora);
    }
    if (semana && t.responsableEmail && (hacia === "hecha" || hacia === "no_se_hara")) {
      await anotarResultado(tx, t, semana, hacia, ctx.email, ahora);
    }
  });
  olvidarMedicion(ctx.email);
  if (t.pedidaPorEmail && t.pedidaPorEmail !== ctx.email && hacia === "hecha") olvidarMedicion(t.pedidaPorEmail);
  if (hacia !== "hecha") return;
  const avisos = async () => {
    if (t.pedidaPorEmail && t.pedidaPorEmail !== ctx.email) {
      await avisar({
        para: t.pedidaPorEmail,
        tipo: "tareas.respuesta",
        titulo: `${ctx.nombre} terminó «${t.titulo}»`,
        href: urlDeLaTarea(t.id),
        actorEmail: ctx.email,
        dedupeKey: `tareas.respuesta:${t.id}:hecha`,
      });
      olvidarMedicion(t.pedidaPorEmail);
    }
    await avisarDesbloqueadas(ctx, t.id);
  };
  if (opciones.diferir) opciones.diferir(avisos);
  else await avisos();
}

/* ── Semana ──────────────────────────────────────────────────────────────────────── */

/**
 * Lleva una tarea a otra semana (o a «Más adelante» con `destino = null`). Si la semana de origen es anterior y la
 * persona no la revisó, anota el pase. El bloque de agenda queda donde está y la tarea vuelve a `sin_agendar`.
 */
export async function moverDeSemana(ctx: ContextoDeTareas, id: string, version: number, destino: string | null, ahora = new Date()) {
  const t = await cargar(prisma, id, ctx);
  if (t.version !== version) throw new ErrorDeTareas(409, "Otra persona cambió esta tarea. Recarga para ver lo último.");
  if (!accionesPara(t, ctx, ahora).moverDeSemana) throw new ErrorDeTareas(403, "No puedes mover esta tarea.");
  if (!t.responsableEmail) throw new ErrorDeTareas(400, "Primero asígnala a alguien.");
  const responsable = t.responsableEmail;
  const hacia = destino ? await semanaDestino(prisma, responsable, destino, true, ahora) : null;
  const origen = comoFecha(t.semana);
  if (hacia === origen) return;
  await prisma.$transaction(async (tx) => {
    await actualizar(tx, t, {}, { semana: hacia ? aDate(hacia) : null, agendaEstado: "sin_agendar" });
    await evento(tx, { tareaId: t.id, tipo: "semana", porEmail: ctx.email, datos: { desde: origen, hacia } });
    if (origen && (hacia === null || origen < hacia)) {
      const revisadas = await semanasRevisadas(tx, responsable);
      if (!revisadas.has(origen) && origen < lunesDeHoy(ahora)) await anotarResultado(tx, t, origen, hacia ? "pasa" : "mas_adelante", ctx.email, ahora);
    }
  });
  if (responsable !== ctx.email && t.agendaEstado === "agendada") await avisarBloqueQuedo(t, ctx);
}

async function avisarBloqueQuedo(t: TareaParaEscribir, ctx: ContextoDeTareas) {
  if (!t.responsableEmail) return;
  await avisar({
    para: t.responsableEmail,
    tipo: "tareas.bloque",
    titulo: `${ctx.nombre} cambió «${t.titulo}» y su bloque quedó en tu calendario`,
    detalle: "Quítalo o agéndala de nuevo.",
    href: urlDeLaTarea(t.id),
    actorEmail: ctx.email,
    dedupeKey: `tareas.bloque:${t.id}:${t.version}`,
  });
}

/* ── Asignar ─────────────────────────────────────────────────────────────────────── */

/**
 * Cambia el responsable. Tomarla de «Por asignar» es para uno mismo; asignarla a otra persona es directo solo para el
 * líder del sprint o un compañero del mismo espacio libre. Si no, sale como pedido (nace propuesta para esa persona).
 */
export async function asignar(ctx: ContextoDeTareas, id: string, version: number, para: string, ahora = new Date()) {
  const t = await cargar(prisma, id, ctx);
  if (t.version !== version) throw new ErrorDeTareas(409, "Otra persona cambió esta tarea. Recarga para ver lo último.");
  const acc = accionesPara(t, ctx, ahora);
  const nuevo = para.toLowerCase();
  const equipo = equipoDe(nuevo, ctx.miembros);
  if (!equipo) throw new ErrorDeTareas(400, "Esa persona no está en el equipo.");
  const esTomar = nuevo === ctx.email && !t.responsableEmail;
  if (!(esTomar ? acc.tomar : acc.reasignar)) throw new ErrorDeTareas(403, "No puedes asignar esta tarea.");
  const directo = !nacePropuesta(ctx.email, nuevo, {
    equipoDelResponsable: equipo,
    creadorLideraEseEquipo: ctx.lidera.includes(equipo) || ctx.esSuperAdmin,
    ambosEnElEspacioLibre: await ambosEnElEspacioLibre(prisma, t.proyectoId, ctx.email, nuevo),
  });
  const semanaPedida = comoFecha(t.semana) ?? lunesDeHoy(ahora);
  const semana = directo ? await semanaDestino(prisma, nuevo, semanaPedida, true, ahora) : semanaPedida;
  const estadoNuevo = directo ? (leerEstado(t.estado) === "propuesta" ? "pendiente" : t.estado) : "propuesta";
  try {
    await prisma.$transaction(async (tx) => {
      await actualizar(tx, t, {}, {
        responsableEmail: nuevo,
        equipo,
        estado: estadoNuevo,
        semana: aDate(semana),
        agendaEstado: "sin_agendar",
        ...(directo ? {} : { pedidaPorEmail: ctx.email, pedidaPorEquipo: equipo !== ctx.equipo ? ctx.equipo : null, tipo: equipo !== ctx.equipo ? "apoyo" : "puesto" }),
      });
      // Pasarle a otra persona algo que tenías abierto: se guarda cómo estaba, para devolvértelo si retiras el pedido.
      const antes = !directo && t.responsableEmail === ctx.email ? { estadoAntes: leerEstado(t.estado), semanaAntes: comoFecha(t.semana) } : {};
      await evento(tx, { tareaId: t.id, tipo: "asignada", porEmail: ctx.email, datos: { desde: t.responsableEmail, hacia: nuevo, directo, ...antes } });
    });
  } catch (e) {
    // Esa persona ya tiene esta misma sugerencia tuya sin decidir (mismo título y cliente). El choque abortó la transacción.
    if (directo || !esUnicoDuplicado(e)) throw e;
    const igual = await prisma.tarea.findFirst({
      where: { estado: "propuesta", huella: t.huella, responsableEmail: nuevo, clientId: t.clientId, pedidaPorEmail: ctx.email },
      select: { id: true, numero: true },
    });
    if (!igual) throw e;
    if (leerEstado(t.estado) !== "propuesta") {
      // Una tarea abierta no se funde: perdería su semana, su agenda y su historia.
      throw new ErrorDeTareas(409, `${nombreDe(nuevo, ctx.miembros)} ya tiene esa sugerencia tuya sin decidir (${etiquetaT(igual.numero)}).`);
    }
    // Una propuesta que se reenvía se junta con la que ya tiene, como «No es mía».
    await prisma.$transaction(async (tx) => {
      await actualizar(tx, t, { estado: "propuesta" }, { estado: "fusionada", decision: "misma", decididaPorEmail: ctx.email, decididaAt: ahora, mismaQueId: igual.id }, "Ya la decidió otra persona.");
      await evento(tx, { tareaId: igual.id, tipo: "mencionada", porEmail: ctx.email, sessionId: t.sessionId, cita: t.cita, datos: { de: "asignar", desde: t.id } });
    });
    olvidarMedicion(nuevo);
    olvidarMedicion(ctx.email);
    return;
  }
  if (nuevo !== ctx.email) {
    // Solo una asignación directa avisa: una sugerencia ya es un pendiente en «Para ti» (fase 1.3).
    if (directo) {
      await avisar({
        para: nuevo,
        tipo: "tareas.asignada",
        titulo: `${ctx.nombre} te asignó «${t.titulo}»`,
        href: urlDeLaTarea(t.id),
        actorEmail: ctx.email,
        dedupeKey: `tareas.asignada:${t.id}:${nuevo}`,
      });
    }
    olvidarMedicion(nuevo);
  }
  if (t.responsableEmail && t.responsableEmail !== ctx.email && t.agendaEstado === "agendada") await avisarBloqueQuedo(t, ctx);
  olvidarMedicion(ctx.email);
}

/* ── Revisa tu semana ────────────────────────────────────────────────────────────── */

export type RespuestaDeRevision =
  | { tareaId: string; resultado: "hecha" }
  | { tareaId: string; resultado: "sigue" }
  | { tareaId: string; resultado: "mas_adelante"; desde?: string | null }
  | { tareaId: string; resultado: "no_se_hara"; motivo: string };

/**
 * Responde UNA fila de «Revisa tu semana» (cada respuesta se guarda al hacer clic: si se cierra a la mitad, no se
 * pierde nada). La terminé en una semana pasada fecha la tarea el viernes de esa semana, no hoy. «Sigue» la lleva a la
 * semana de hoy o la siguiente sin revisar, con UN solo pase aunque salte varias semanas.
 */
export async function responderRevision(ctx: ContextoDeTareas, semana: string, r: RespuestaDeRevision, ahora = new Date()) {
  const W = lunesDeFecha(semana);
  const t = await cargar(prisma, r.tareaId, ctx);
  const persona = t.responsableEmail;
  if (!persona) throw new ErrorDeTareas(400, "Esa tarea no tiene responsable.");
  const lidera = !!t.equipo && (ctx.lidera.includes(t.equipo) || ctx.esSuperAdmin);
  if (persona !== ctx.email && !lidera) throw new ErrorDeTareas(403, "Solo la persona o su líder revisan esa semana.");
  // Corregir: una tarea ya respondida en W puede estar en otra semana (siguió); la respuesta nueva reemplaza la de antes.
  const antes = await prisma.resultadoDeSemana.findUnique({ where: { tareaId_semana: { tareaId: t.id, semana: aDate(W) } }, select: { resultado: true } });
  const enW = comoFecha(t.semana) === W;
  if (!enW && !antes) throw new ErrorDeTareas(409, "Esa tarea ya no está en esa semana.");
  const estado = leerEstado(t.estado);
  // Se revisa trabajo: lo abierto, o corregir lo ya cerrado. Una propuesta se decide; una lápida o una vencida no vuelven por acá.
  if (estado !== "pendiente" && estado !== "en_curso" && estado !== "hecha" && estado !== "no_se_hara") {
    throw new ErrorDeTareas(409, "Esa tarea no está en tu semana de trabajo.");
  }
  const reabre = estado === "hecha" || estado === "no_se_hara";
  const hoy = lunesDeHoy(ahora);

  await prisma.$transaction(async (tx) => {
    // Corregir W cuando la tarea ya siguió a otra semana W2: lo que se anotó en W2 (por ejemplo, «hecha» desde el cajón)
    // se borra, si W2 todavía no se revisó. Si no, la tarea quedaría contada en dos semanas.
    const W2 = comoFecha(t.semana);
    if (!enW && W2 && W2 !== W && !(await semanasRevisadas(tx, persona)).has(W2)) await quitarResultado(tx, t.id, W2);
    if (r.resultado === "hecha") {
      const completadaAt = W < hoy ? instanteCR(viernesDe(W), 17) : ahora;
      if (estado !== "hecha" || !enW) {
        // Lo que se marca hecho vuelve a W como hecho, con la fecha de esa semana (si no, se contaría en dos semanas).
        await tx.tarea.update({ where: { id: t.id }, data: { estado: "hecha", ...(estado === "no_se_hara" ? { motivo: null } : {}), completadaAt, semana: aDate(W), agendaEstado: "sin_agendar", version: { increment: 1 } } });
        await evento(tx, { tareaId: t.id, tipo: "revisada", porEmail: ctx.email, datos: { semana: W, resultado: "hecha" } });
      }
      await anotarResultado(tx, t, W, "hecha", ctx.email, ahora);
    } else if (r.resultado === "sigue") {
      const revisadas = await semanasRevisadas(tx, persona);
      revisadas.add(W); // esta semana se está revisando: lo que sigue no puede volver a caer en ella
      const destino = primeraSemanaSinRevisar(sumarSemanas(W, 1), revisadas, { lunesDeHoy: hoy, conPiso: true });
      await tx.tarea.update({
        where: { id: t.id },
        data: { estado: reabre ? "pendiente" : t.estado, ...(estado === "no_se_hara" ? { motivo: null } : {}), completadaAt: null, semana: aDate(destino), agendaEstado: "sin_agendar", version: { increment: 1 } },
      });
      await evento(tx, { tareaId: t.id, tipo: "revisada", porEmail: ctx.email, datos: { semana: W, resultado: "pasa", hacia: destino } });
      await anotarResultado(tx, t, W, "pasa", ctx.email, ahora);
    } else if (r.resultado === "mas_adelante") {
      // Como «Sigue»: una fecha de esta misma semana no la puede dejar abierta en la semana que se está revisando.
      const revisadas = await semanasRevisadas(tx, persona);
      revisadas.add(W);
      const desde = r.desde ? primeraSemanaSinRevisar(r.desde, revisadas, { lunesDeHoy: hoy, conPiso: true }) : null;
      await tx.tarea.update({
        where: { id: t.id },
        data: { estado: reabre ? "pendiente" : t.estado, ...(estado === "no_se_hara" ? { motivo: null } : {}), completadaAt: null, semana: desde ? aDate(desde) : null, agendaEstado: "sin_agendar", version: { increment: 1 } },
      });
      await evento(tx, { tareaId: t.id, tipo: "revisada", porEmail: ctx.email, datos: { semana: W, resultado: "mas_adelante", hacia: desde } });
      await anotarResultado(tx, t, W, "mas_adelante", ctx.email, ahora);
    } else {
      if (!r.motivo?.trim()) throw new ErrorDeTareas(400, "Escribe por qué ya no se hará.");
      await tx.tarea.update({ where: { id: t.id }, data: { estado: "no_se_hara", motivo: r.motivo.trim(), completadaAt: null, semana: aDate(W), version: { increment: 1 } } });
      await evento(tx, { tareaId: t.id, tipo: "revisada", porEmail: ctx.email, datos: { semana: W, resultado: "no_se_hara" } });
      await anotarResultado(tx, t, W, "no_se_hara", ctx.email, ahora);
    }
  }, OPCIONES_DE_TX);
  if (r.resultado === "hecha") await avisarDesbloqueadas(ctx, t.id);
  olvidarMedicion(persona);
  if (persona !== ctx.email) olvidarMedicion(ctx.email);
}

/**
 * Cierra la revisión de una semana: escribe `CierreDeSemana(persona, W)` cuando ya no queda nada abierto en esa semana
 * sin respuesta. Una persona cierra la suya; el líder solo si a esa persona no le queda nada abierto en W en otro sprint.
 */
export async function cerrarRevision(ctx: ContextoDeTareas, persona: string, semana: string, ahora = new Date()): Promise<{ cerrada: boolean; faltanSuyas: number }> {
  const W = lunesDeFecha(semana);
  const p = persona.toLowerCase();
  const equipoDeLaPersona = equipoDe(p, ctx.miembros);
  const lidera = !!equipoDeLaPersona && (ctx.lidera.includes(equipoDeLaPersona) || ctx.esSuperAdmin);
  if (p !== ctx.email && !lidera) throw new ErrorDeTareas(403, "Solo la persona o su líder cierran esa semana.");
  const abiertasEnW: Prisma.TareaWhereInput = { responsableEmail: p, semana: aDate(W), estado: { in: ["pendiente", "en_curso"] }, archivadaAt: null };
  // La líder (Revisar con el equipo) marca lo que ve; lo privado de la persona lo revisa ella. Si queda algo así, la
  // semana no se cierra a su nombre: le llega el aviso con lo que le falta.
  let faltanSuyas = 0;
  if (p === ctx.email) {
    const abiertas = await prisma.tarea.count({ where: abiertasEnW });
    if (abiertas > 0) throw new ErrorDeTareas(409, `Te faltan ${abiertas === 1 ? "1 tarea" : `${abiertas} tareas`} por marcar.`);
  } else {
    const [visibles, todas] = await Promise.all([prisma.tarea.count({ where: { AND: [abiertasEnW, tareasVisiblesWhere(ctx)] } }), prisma.tarea.count({ where: abiertasEnW })]);
    if (visibles > 0) throw new ErrorDeTareas(409, `${visibles === 1 ? "Falta 1 tarea" : `Faltan ${visibles} tareas`} por marcar.`);
    faltanSuyas = todas - visibles;
  }
  if (faltanSuyas === 0) {
    await prisma.$transaction(async (tx) => {
      await tx.cierreDeSemana.upsert({
        where: { personaEmail_semana: { personaEmail: p, semana: aDate(W) } },
        create: { personaEmail: p, semana: aDate(W), cerradaPor: ctx.email, cerradaAt: ahora },
        update: { cerradaPor: ctx.email, cerradaAt: ahora },
      });
    });
  }
  if (p !== ctx.email) {
    // UN aviso por revisión: cuántas marcó contigo, cuántas siguen (para agendarlas) y si te falta algo tuyo.
    const marcadas = await prisma.resultadoDeSemana.findMany({ where: { semana: aDate(W), responsableEmail: p, decididoPor: ctx.email }, select: { resultado: true } });
    const siguen = marcadas.filter((r) => r.resultado === "pasa").length;
    const partes = [
      siguen ? `Agenda ${siguen === 1 ? "la que sigue" : `las ${siguen} que siguen`}.` : null,
      faltanSuyas ? `Te ${faltanSuyas === 1 ? "falta marcar 1" : `faltan marcar ${faltanSuyas}`} de esa semana.` : null,
      "Si algo no quedó bien, corrige tu revisión.",
    ].filter(Boolean);
    await avisar({
      para: p,
      tipo: "tareas.cerrada",
      titulo: marcadas.length
        ? `${ctx.nombre} revisó contigo ${marcadas.length === 1 ? "1 tarea" : `${marcadas.length} tareas`}`
        : `${ctx.nombre} revisó contigo la ${W === lunesDeHoy(ahora) ? "semana" : "semana pasada"}`,
      detalle: partes.join(" "),
      href: siguen && !faltanSuyas ? "/tareas" : `/tareas?revisar=${W}`,
      actorEmail: ctx.email,
      dedupeKey: `tareas.cerrada:${p}:${W}`,
    });
  }
  olvidarMedicion(p);
  return { cerrada: faltanSuyas === 0, faltanSuyas };
}

/* ── Espacios libres (docs/tareas-plan.md §5.3) ──────────────────────────────────────────────────────────────────── */

/**
 * Crear un espacio libre: quien lo crea queda como admin, los demás como miembros, y nace con su primer proyecto, del
 * mismo nombre. A cada miembro le llega un aviso (nunca a quien lo creó).
 */
export async function crearEspacio(ctx: ContextoDeTareas, n: { nombre: string; visibilidad: "miembros" | "todos"; miembros: string[] }) {
  const nombre = n.nombre.trim();
  if (!nombre) throw new ErrorDeTareas(400, "Ponle un nombre al espacio.");
  const miembros = [...new Set(n.miembros.map((e) => e.toLowerCase()).filter((e) => e !== ctx.email))];
  const fuera = miembros.filter((e) => !equipoDe(e, ctx.miembros));
  if (fuera.length) throw new ErrorDeTareas(400, `${fuera.join(", ")} no está en el equipo.`);
  const r = await prisma.$transaction(async (tx) => {
    const e = await tx.espacioDeTareas.create({
      data: {
        tipo: "libre",
        nombre,
        visibilidad: n.visibilidad,
        creadoPorEmail: ctx.email,
        miembros: { create: [{ email: ctx.email, rol: "admin", agregadoPorEmail: ctx.email }, ...miembros.map((email) => ({ email, rol: "miembro", agregadoPorEmail: ctx.email }))] },
      },
      select: { id: true },
    });
    const p = await tx.proyectoDeTareas.create({
      data: { espacioId: e.id, nombre, huella: normalizar(nombre), estado: "activo", responsableEmail: ctx.email, origen: "mano", creadoPorEmail: ctx.email },
      select: { id: true },
    });
    await evento(tx, { proyectoId: p.id, tipo: "creada", porEmail: ctx.email, datos: { espacio: e.id } });
    return { espacioId: e.id, proyectoId: p.id };
  });
  if (miembros.length) {
    await avisar({
      para: miembros,
      tipo: "tareas.espacio",
      titulo: `${ctx.nombre} te sumó al espacio «${nombre}»`,
      detalle: "Ahí van sus proyectos y sus tareas.",
      href: `/tareas/espacios/${r.espacioId}`,
      actorEmail: ctx.email,
      dedupeKey: `tareas.espacio:${r.espacioId}`,
    });
  }
  return r;
}

async function espacioParaAdministrar(ctx: ContextoDeTareas, id: string) {
  const e = await prisma.espacioDeTareas.findUnique({
    where: { id },
    select: { id: true, tipo: true, nombre: true, version: true, archivadoAt: true, miembros: { select: { email: true, rol: true } } },
  });
  if (!e || e.archivadoAt) throw new ErrorDeTareas(404, "Ese espacio no existe.");
  if (e.tipo !== "libre") throw new ErrorDeTareas(400, "Los espacios de equipo salen del área de cada persona: no se editan.");
  const admin = ctx.esSuperAdmin || e.miembros.some((m) => m.email === ctx.email && m.rol === "admin");
  if (!admin) throw new ErrorDeTareas(403, "Lo administra quien lo creó (o un admin del espacio).");
  return e;
}

/** Renombrar, cambiar quién lo ve o archivar (solo sin proyectos activos). */
export async function cambiarEspacio(
  ctx: ContextoDeTareas,
  id: string,
  version: number,
  c: { nombre?: string; visibilidad?: "miembros" | "todos"; archivar?: boolean },
  ahora = new Date(),
) {
  const e = await espacioParaAdministrar(ctx, id);
  if (c.archivar) {
    const activos = await prisma.proyectoDeTareas.count({ where: { espacioId: id, estado: { in: ["activo", "en_pausa", "propuesta"] }, archivadoAt: null } });
    if (activos) throw new ErrorDeTareas(409, `Le ${activos === 1 ? "queda 1 proyecto activo" : `quedan ${activos} proyectos activos`}: termínalos antes de archivarlo.`);
  }
  const r = await prisma.espacioDeTareas.updateMany({
    where: { id, version },
    data: {
      ...(c.nombre ? { nombre: c.nombre.trim() } : {}),
      ...(c.visibilidad ? { visibilidad: c.visibilidad } : {}),
      ...(c.archivar ? { archivadoAt: ahora } : {}),
      version: { increment: 1 },
    },
  });
  if (r.count === 0) throw new ErrorDeTareas(409, `Otra persona cambió «${e.nombre}». Recarga para ver lo último.`);
}

/** Sumar a alguien del equipo a un espacio libre: le llega un aviso. */
export async function sumarAlEspacio(ctx: ContextoDeTareas, id: string, email: string) {
  const e = await espacioParaAdministrar(ctx, id);
  const quien = email.toLowerCase();
  if (!equipoDe(quien, ctx.miembros)) throw new ErrorDeTareas(400, "Esa persona no está en el equipo.");
  if (e.miembros.some((m) => m.email === quien)) return;
  await prisma.miembroDeEspacio.create({ data: { espacioId: id, email: quien, rol: "miembro", agregadoPorEmail: ctx.email } });
  if (quien !== ctx.email) {
    await avisar({
      para: quien,
      tipo: "tareas.espacio",
      titulo: `${ctx.nombre} te sumó al espacio «${e.nombre}»`,
      href: `/tareas/espacios/${id}`,
      actorEmail: ctx.email,
      dedupeKey: `tareas.espacio:${id}:${quien}`,
    });
  }
}

/** Quitar a alguien: sus tareas siguen en su sprint (no se pierden). Nunca al último admin. */
export async function quitarDelEspacio(ctx: ContextoDeTareas, id: string, email: string) {
  const e = await espacioParaAdministrar(ctx, id);
  const quien = email.toLowerCase();
  const m = e.miembros.find((x) => x.email === quien);
  if (!m) return;
  if (m.rol === "admin" && e.miembros.filter((x) => x.rol === "admin").length === 1) throw new ErrorDeTareas(409, "Es el único admin del espacio: suma otro antes de quitarlo.");
  await prisma.miembroDeEspacio.delete({ where: { espacioId_email: { espacioId: id, email: quien } } });
}

/* ── Dependencias (docs/tareas-plan.md §5.7) ──────────────────────────────────────────────────────────────────── */

/** ¿Llegar de `desde` a `hacia` siguiendo «lo bloquea»? (agregar hacia→desde haría un ciclo). */
async function bloqueaTransitivo(db: Db, desde: string, hacia: string): Promise<boolean> {
  const vistos = new Set<string>([desde]);
  let frente = [desde];
  for (let paso = 0; paso < 50 && frente.length; paso++) {
    const filas = await db.tareaRelacion.findMany({ where: { tipo: "bloquea", desdeId: { in: frente } }, select: { haciaId: true } });
    const siguientes: string[] = [];
    for (const f of filas) {
      if (f.haciaId === hacia) return true;
      if (!vistos.has(f.haciaId)) {
        vistos.add(f.haciaId);
        siguientes.push(f.haciaId);
      }
    }
    frente = siguientes;
  }
  return false;
}

/**
 * «Esperar a…»: la tarea `tareaId` espera a `esperaA` (esperaA la bloquea). Quien puede editar la tarea, y solo con una
 * que ve. Puede cruzar personas, equipos y clientes; nunca un ciclo.
 */
export async function esperarA(ctx: ContextoDeTareas, tareaId: string, esperaA: string, ahora = new Date()) {
  if (tareaId === esperaA) throw new ErrorDeTareas(400, "Una tarea no puede esperarse a sí misma.");
  const t = await cargar(prisma, tareaId, ctx);
  if (!accionesPara(t, ctx, ahora).editar) throw new ErrorDeTareas(403, "No puedes cambiar esa tarea.");
  const otra = await cargar(prisma, esperaA, ctx);
  if (await bloqueaTransitivo(prisma, t.id, otra.id)) throw new ErrorDeTareas(409, `T-${otra.numero} ya espera a esta: sería un círculo.`);
  await prisma.$transaction(async (tx) => {
    await tx.tareaRelacion.upsert({
      where: { desdeId_haciaId_tipo: { desdeId: otra.id, haciaId: t.id, tipo: "bloquea" } },
      create: { desdeId: otra.id, haciaId: t.id, tipo: "bloquea", creadaPorEmail: ctx.email },
      update: {},
    });
    await evento(tx, { tareaId: t.id, tipo: "espera", porEmail: ctx.email, datos: { espera: otra.id, numero: otra.numero } });
  });
}

/** Quitar una dependencia: quien puede editar la tarea que espera. */
export async function dejarDeEsperar(ctx: ContextoDeTareas, tareaId: string, esperaA: string, ahora = new Date()) {
  const t = await cargar(prisma, tareaId, ctx);
  if (!accionesPara(t, ctx, ahora).editar) throw new ErrorDeTareas(403, "No puedes cambiar esa tarea.");
  await prisma.$transaction(async (tx) => {
    const r = await tx.tareaRelacion.deleteMany({ where: { desdeId: esperaA, haciaId: t.id, tipo: "bloquea" } });
    if (r.count) await evento(tx, { tareaId: t.id, tipo: "espera", porEmail: ctx.email, datos: { quitada: esperaA } });
  });
}

/**
 * Cuando una tarea queda hecha, el responsable de cada una que la esperaba recibe UN aviso (si ya no espera a otra
 * abierta). Nunca a quien hizo la acción. El título de la hecha va solo si esa persona la ve.
 */
async function avisarDesbloqueadas(ctx: ContextoDeTareas, hechaId: string) {
  const hecha = await prisma.tarea.findUnique({ where: { id: hechaId }, select: { numero: true, responsableEmail: true, creadaPorEmail: true, pedidaPorEmail: true, equipo: true, privada: true, archivadaAt: true, proyecto: { select: { espacio: { select: { tipo: true, visibilidad: true, equipo: true, miembros: { select: { email: true } } } } } } } });
  if (!hecha) return;
  const esperaban = await prisma.tareaRelacion.findMany({
    where: { desdeId: hechaId, tipo: "bloquea" },
    select: {
      hacia: {
        select: {
          id: true,
          numero: true,
          titulo: true,
          estado: true,
          responsableEmail: true,
          archivadaAt: true,
          bloqueadaPor: { where: { tipo: "bloquea", desdeId: { not: hechaId } }, select: { desde: { select: { estado: true } } } },
        },
      },
    },
  });
  for (const { hacia } of esperaban) {
    if (!hacia.responsableEmail || hacia.responsableEmail === ctx.email || hacia.archivadaAt || !estaAbierta(hacia.estado)) continue;
    if (hacia.bloqueadaPor.some((b) => estaAbierta(b.desde.estado) || b.desde.estado === "propuesta")) continue;
    const persona = ctx.miembros.find((m) => m.email === hacia.responsableEmail);
    const laVe = persona ? veLaTarea({ ...hecha, espacio: hecha.proyecto?.espacio ? { ...hecha.proyecto.espacio, miembros: hecha.proyecto.espacio.miembros.map((m) => m.email) } : null }, { email: persona.email, equipo: equipoDe(persona.email, ctx.miembros) ?? "", lidera: equiposQueLidera(persona), esSuperAdmin: persona.roleEnum === "SUPER_ADMIN" }) : false;
    await avisar({
      para: hacia.responsableEmail,
      tipo: "tareas.dependencia",
      titulo: laVe ? `T-${hecha.numero} está hecha: ya puedes empezar T-${hacia.numero}` : `Una tarea que esperabas está hecha: ya puedes empezar T-${hacia.numero}`,
      detalle: `«${hacia.titulo}» ya no espera a nadie.`,
      href: urlDeLaTarea(hacia.id),
      actorEmail: ctx.email,
      dedupeKey: `tareas.dependencia:${hechaId}:${hacia.id}`,
    });
  }
}

/* ── Vínculos (docs/tareas-plan.md §4.4) ──────────────────────────────────────────────────────────────────────── */

export type DestinoDelVinculo = { tipo: "hubspot"; url: string } | { tipo: "propuesta"; id: string } | { tipo: "preventa"; id: string };


/**
 * ¿Puede vincular (y quitar, y actualizar) en ese dueño? Una tarea: quien la puede editar. Un proyecto: quien lo
 * administra. 404 si no lo ve.
 */
async function puedeVincularEn(ctx: ContextoDeTareas, dueno: DuenoDelVinculo, ahora: Date): Promise<{ where: { tareaId: string } | { proyectoId: string }; puede: boolean }> {
  if (dueno.tipo === "tarea") {
    const t = await cargar(prisma, dueno.id, ctx);
    return { where: { tareaId: t.id }, puede: accionesPara(t, ctx, ahora).editar };
  }
  const p = await prisma.proyectoDeTareas.findFirst({
    where: { AND: [{ id: dueno.id, archivadoAt: null }, proyectosVisiblesWhere(ctx)] },
    select: { id: true, responsableEmail: true, creadoPorEmail: true, espacio: { select: { tipo: true, equipo: true, miembros: { select: { email: true, rol: true } } } } },
  });
  if (!p) throw new ErrorDeTareas(404, "Ese proyecto no existe.");
  return { where: { proyectoId: p.id }, puede: await puedeAdministrarProyecto(ctx, p) };
}

/** Lo que el vínculo de HubSpot necesita de afuera (inyectable para las pruebas). */
export interface LectorParaVincular {
  leer: (e: EnlaceDeHubspot) => Promise<FotoDeRegistro>;
  portal: () => Promise<string | null>;
}

const LECTOR_REAL: LectorParaVincular = { leer: leerRegistroParaVincular, portal: portalDelSistema };

/**
 * Vincular a una tarea un registro de HubSpot, una propuesta o una preventa. Lo puede quien puede editar la tarea.
 * Vincular NO es sincronizar: nada se escribe en HubSpot. No cambia el «para quién» de la tarea.
 *
 * HubSpot: un enlace del portal del sistema, de un objeto que la app lee. La empresa del registro decide de qué cliente
 * es: si es uno que no ves, 403 y nada se guarda. Si no hay cliente, hay dos, o HubSpot no respondió, se guarda igual y
 * se ve sin título salvo para quien ve toda la cartera.
 */
export async function vincular(
  ctx: ContextoDeTareas,
  clientes: ClientesQueVes,
  tareaId: string,
  destino: DestinoDelVinculo,
  permisos: PermisosDeVinculo,
  lector: LectorParaVincular = LECTOR_REAL,
  ahora = new Date(),
): Promise<{ id: string }> {
  return vincularA(ctx, clientes, { tipo: "tarea", id: tareaId }, destino, permisos, lector, ahora);
}

/** Lo mismo que `vincular`, para una tarea o para un proyecto de tareas. */
export async function vincularA(
  ctx: ContextoDeTareas,
  clientes: ClientesQueVes,
  dueno: DuenoDelVinculo,
  destino: DestinoDelVinculo,
  permisos: PermisosDeVinculo,
  lector: LectorParaVincular = LECTOR_REAL,
  ahora = new Date(),
): Promise<{ id: string }> {
  const { where: deDueno, puede } = await puedeVincularEn(ctx, dueno, ahora);
  if (!puede) throw new ErrorDeTareas(403, dueno.tipo === "tarea" ? "No puedes cambiar esa tarea." : "No puedes cambiar ese proyecto.");
  const ves = (clientId: string | null) => (clientId ? clientes.ids.has(clientId) : clientes.todos);

  let datos: Prisma.TareaVinculoUncheckedCreateInput;
  if (destino.tipo === "hubspot") {
    const enlace = leerEnlaceDeHubspot(destino.url);
    if (!enlace) throw new ErrorDeTareas(400, "Pega el enlace de la ficha de un registro de HubSpot.");
    if (!seVincula(enlace.objeto)) throw new ErrorDeTareas(403, "Nexus no tiene permiso para leer ese tipo de registro de HubSpot.");
    const portal = await lector.portal();
    if (!portal) throw new ErrorDeTareas(409, "Nexus no está conectado a HubSpot.");
    if (enlace.portal !== portal) throw new ErrorDeTareas(400, "Ese enlace es de otro portal de HubSpot.");
    const ya = await prisma.tareaVinculo.findFirst({ where: { ...deDueno, hubspotObjeto: enlace.objeto, externalHubspotRecordId: enlace.id }, select: { id: true } });
    if (ya) return ya;
    const foto = await lector.leer(enlace);
    if (foto.estado === "sin_permiso") throw new ErrorDeTareas(403, "Nexus no tiene permiso para leer ese tipo de registro de HubSpot.");
    if (foto.estado === "no_existe") throw new ErrorDeTareas(404, "Ese registro no existe en HubSpot.");
    const empresa = await empresaDeLaFoto(foto);
    if (empresa.clientId && !ves(empresa.clientId)) throw new ErrorDeTareas(403, "Ese registro es de una empresa que no ves.");
    const { clientId, empresaResuelta } = empresa;
    const project =
      enlace.objeto === OBJETO_PROYECTOS ? await prisma.project.findUnique({ where: { hubspotServiceId: enlace.id }, select: { id: true } }) : null;
    datos = {
      ...deDueno,
      hubspotPortalId: enlace.portal,
      hubspotObjeto: enlace.objeto,
      externalHubspotRecordId: enlace.id,
      etiqueta: foto.estado === "ok" ? foto.etiqueta : `${OBJETOS_QUE_SE_VINCULAN[enlace.objeto] ?? "Registro"} #${enlace.id}`,
      detalle: foto.estado === "ok" ? foto.detalle : null,
      empresaResuelta,
      clientId,
      projectId: project?.id ?? null,
      fotoAt: ahora,
      creadoPorEmail: ctx.email,
    };
  } else if (destino.tipo === "propuesta") {
    if (!permisos.veVentas) throw new ErrorDeTareas(403, "No puedes abrir propuestas comerciales.");
    const bc = await prisma.businessCase.findUnique({ where: { id: destino.id }, select: { id: true, name: true, clientId: true } });
    if (!bc || !ves(bc.clientId)) throw new ErrorDeTareas(404, "Esa propuesta no existe.");
    const ya = await prisma.tareaVinculo.findFirst({ where: { ...deDueno, businessCaseId: bc.id }, select: { id: true } });
    if (ya) return ya;
    datos = { ...deDueno, businessCaseId: bc.id, etiqueta: bc.name.slice(0, 160), detalle: "Propuesta comercial", empresaResuelta: "cliente", clientId: bc.clientId, creadoPorEmail: ctx.email };
  } else {
    if (!permisos.vePreventa) throw new ErrorDeTareas(403, "No puedes abrir preventas.");
    const ex = await prisma.exploracionDeVenta.findFirst({ where: { id: destino.id, ...DE_LA_PREVENTA }, select: { id: true, clientId: true, client: { select: { name: true } } } });
    if (!ex) throw new ErrorDeTareas(404, "Esa preventa no existe.");
    const ya = await prisma.tareaVinculo.findFirst({ where: { ...deDueno, exploracionId: ex.id }, select: { id: true } });
    if (ya) return ya;
    datos = { ...deDueno, exploracionId: ex.id, etiqueta: `Preventa · ${ex.client.name}`.slice(0, 160), detalle: "Preventa", empresaResuelta: "cliente", clientId: ex.clientId, creadoPorEmail: ctx.email };
  }
  return prisma.$transaction(async (tx) => {
    const v = await tx.tareaVinculo.create({ data: datos, select: { id: true } });
    await evento(tx, { ...deDueno, tipo: "vinculo", porEmail: ctx.email, datos: { vinculo: v.id, tipo: destino.tipo } });
    return v;
  });
}

/** El cliente de un registro de HubSpot, por las empresas a las que está asociado (el mismo desempate de siempre). */
async function empresaDeLaFoto(foto: FotoDeRegistro): Promise<{ clientId: string | null; empresaResuelta: string }> {
  if (foto.estado !== "ok") return { clientId: null, empresaResuelta: "pendiente" };
  const candidatos = foto.empresas.length
    ? await prisma.client.findMany({ where: { hubspotCompanyId: { in: foto.empresas } }, select: { id: true, name: true, kind: true } })
    : [];
  const eleccion = elegirCandidato(candidatos);
  return eleccion.estado === "uno" ? { clientId: eleccion.cliente.id, empresaResuelta: "cliente" } : { clientId: null, empresaResuelta: eleccion.estado };
}

/** Quitar un vínculo: quien lo creó o quien puede editar la tarea. */
export async function quitarVinculo(ctx: ContextoDeTareas, tareaId: string, vinculoId: string, ahora = new Date()) {
  return quitarVinculoDe(ctx, { tipo: "tarea", id: tareaId }, vinculoId, ahora);
}

/** Quitar un vínculo de una tarea o de un proyecto: quien lo creó, o quien puede editar a su dueño. */
export async function quitarVinculoDe(ctx: ContextoDeTareas, dueno: DuenoDelVinculo, vinculoId: string, ahora = new Date()) {
  const { where: deDueno, puede } = await puedeVincularEn(ctx, dueno, ahora);
  const v = await prisma.tareaVinculo.findFirst({ where: { id: vinculoId, ...deDueno }, select: { id: true, creadoPorEmail: true } });
  if (!v) throw new ErrorDeTareas(404, "Ese vínculo no existe.");
  if (v.creadoPorEmail !== ctx.email && !puede) throw new ErrorDeTareas(403, "No puedes quitar ese vínculo.");
  await prisma.$transaction(async (tx) => {
    await tx.tareaVinculo.delete({ where: { id: v.id } });
    await evento(tx, { ...deDueno, tipo: "vinculo", porEmail: ctx.email, datos: { quitado: v.id } });
  });
}

/**
 * Actualiza la foto de un vínculo de HubSpot (nombre, etapa y empresa), que se toma al vincular y no se refresca sola.
 * Lo puede quien puede editar a su dueño. Si HubSpot dice que ya no existe, queda marcado «Ya no está en HubSpot».
 * Nada se escribe en HubSpot. Devuelve el dueño, para volver a cargar la lista.
 */
export async function refrescarVinculo(ctx: ContextoDeTareas, vinculoId: string, lector: LectorParaVincular = LECTOR_REAL, ahora = new Date()): Promise<DuenoDelVinculo> {
  const v = await prisma.tareaVinculo.findUnique({
    where: { id: vinculoId },
    select: { id: true, tareaId: true, proyectoId: true, hubspotPortalId: true, hubspotObjeto: true, externalHubspotRecordId: true },
  });
  if (!v || (!v.tareaId && !v.proyectoId)) throw new ErrorDeTareas(404, "Ese vínculo no existe.");
  const dueno: DuenoDelVinculo = v.tareaId ? { tipo: "tarea", id: v.tareaId } : { tipo: "proyecto", id: v.proyectoId! };
  const { where: deDueno, puede } = await puedeVincularEn(ctx, dueno, ahora);
  if (!puede) throw new ErrorDeTareas(403, "No puedes actualizar ese vínculo.");
  if (!v.hubspotPortalId || !v.hubspotObjeto || !v.externalHubspotRecordId) throw new ErrorDeTareas(400, "Solo se actualizan los registros de HubSpot.");
  const enlace: EnlaceDeHubspot = { portal: v.hubspotPortalId, objeto: v.hubspotObjeto, id: v.externalHubspotRecordId };
  const foto = await lector.leer(enlace);
  if (foto.estado === "sin_permiso") throw new ErrorDeTareas(403, "Nexus no tiene permiso para leer ese tipo de registro de HubSpot.");
  if (foto.estado === "error") throw new ErrorDeTareas(502, "HubSpot no respondió. Prueba de nuevo en un rato.");
  const data: Prisma.TareaVinculoUncheckedUpdateInput =
    foto.estado === "no_existe"
      ? { ausenteAt: ahora, fotoAt: ahora }
      : { ...(await empresaDeLaFoto(foto)), etiqueta: foto.etiqueta, detalle: foto.detalle, ausenteAt: null, fotoAt: ahora };
  await prisma.$transaction(async (tx) => {
    await tx.tareaVinculo.update({ where: { id: v.id }, data });
    await evento(tx, { ...deDueno, tipo: "vinculo", porEmail: ctx.email, datos: { actualizado: v.id, ausente: foto.estado === "no_existe" } });
  });
  return dueno;
}

/* ── Comentarios (docs/tareas-plan.md §5.2, punto 8) ───────────────────────────────────────────────────────────── */

/**
 * Comentar una tarea: lo puede hacer quien la ve. Avisa a los otros involucrados (responsable, quien la pidió y quien la
 * creó), nunca a quien escribió. El cuerpo NO va en el aviso: se lee en la tarea, con su regla de visibilidad.
 */
export async function comentar(ctx: ContextoDeTareas, tareaId: string, cuerpo: string, ahora = new Date()): Promise<{ id: string }> {
  const t = await cargar(prisma, tareaId, ctx);
  const texto = cuerpo.trim();
  if (!texto) throw new ErrorDeTareas(400, "Escribe el comentario.");
  const c = await prisma.$transaction(async (tx) => {
    const nuevo = await tx.tareaComentario.create({ data: { tareaId: t.id, autorEmail: ctx.email, cuerpo: texto, createdAt: ahora }, select: { id: true } });
    await evento(tx, { tareaId: t.id, tipo: "comentada", porEmail: ctx.email, datos: { comentario: nuevo.id } });
    return nuevo;
  });
  const para = [...new Set([t.responsableEmail, t.pedidaPorEmail, t.creadaPorEmail].filter((e): e is string => !!e && e !== ctx.email && e !== "agente" && e !== SISTEMA))];
  if (para.length) {
    await avisar({
      para,
      tipo: "tareas.comentario",
      titulo: `${ctx.nombre} comentó «${t.titulo}»`,
      detalle: "Ábrela para leerlo y responder.",
      href: urlDeLaTarea(t.id),
      actorEmail: ctx.email,
      dedupeKey: `tareas.comentario:${c.id}`,
    });
  }
  return c;
}

async function cargarComentario(ctx: ContextoDeTareas, id: string) {
  const c = await prisma.tareaComentario.findUnique({ where: { id }, select: { id: true, tareaId: true, autorEmail: true, archivadoAt: true } });
  if (!c || c.archivadoAt) throw new ErrorDeTareas(404, "Ese comentario no existe.");
  await cargar(prisma, c.tareaId, ctx); // quien no ve la tarea, no ve el comentario
  return c;
}

/** Editar un comentario: solo quien lo escribió. Queda marcado como editado. */
export async function editarComentario(ctx: ContextoDeTareas, id: string, cuerpo: string, ahora = new Date()) {
  const c = await cargarComentario(ctx, id);
  if (c.autorEmail !== ctx.email) throw new ErrorDeTareas(403, "Solo quien lo escribió lo edita.");
  const texto = cuerpo.trim();
  if (!texto) throw new ErrorDeTareas(400, "Escribe el comentario.");
  await prisma.tareaComentario.update({ where: { id }, data: { cuerpo: texto, editadoAt: ahora } });
}

/** Quitar un comentario: no se borra, se archiva. Quien lo escribió, o un Super Admin. */
export async function archivarComentario(ctx: ContextoDeTareas, id: string, ahora = new Date()) {
  const c = await cargarComentario(ctx, id);
  if (c.autorEmail !== ctx.email && !ctx.esSuperAdmin) throw new ErrorDeTareas(403, "Solo quien lo escribió lo quita.");
  await prisma.tareaComentario.update({ where: { id }, data: { archivadoAt: ahora } });
}

/* ── El job del lunes (docs/tareas-plan.md §5.8, pasos 2 a 4) ─────────────────────────────────────────────────── */

export interface ResultadoDelLunes {
  vencidas: number;
  proyectosVencidos: number;
  aPorAsignar: number;
  /** Las privadas de quien se dio de baja: no se pasan a «Por asignar» (su título no es del equipo). */
  privadasDeBajas: number;
  mudadas: number;
}

/**
 * Lo que hace el job `tareas-semana-lunes` sin decidir por nadie, todo como `sistema` y con su evento:
 *   - vence las propuestas (tareas y proyectos) que nadie decidió en DIAS_PARA_VENCER_UNA_PROPUESTA días. No son
 *     lápidas: si se vuelve a hablar del tema, se vuelve a proponer. Las tareas de un proyecto vencido quedan sueltas;
 *   - pasa a «Por asignar» lo abierto de quien se dio de baja (sin responsable ni semana, en su mismo sprint; en un
 *     proyecto de su sprint personal, queda en el proyecto). Lo privado no: el título es solo suyo;
 *   - muda al sprint de casa lo abierto (y lo propuesto) de quien cambió de área.
 * El cierre automático de la semana (paso 1) va aparte, apagado mientras no se prenda `TAREAS_CIERRE_AUTOMATICO`.
 */
export async function mantenimientoDelLunes(ahora = new Date()): Promise<ResultadoDelLunes> {
  const limite = new Date(ahora.getTime() - DIAS_PARA_VENCER_UNA_PROPUESTA * 86_400_000);
  const miembros = await prisma.teamMember.findMany({ select: { email: true, area: true, deactivatedAt: true } });
  const deBaja = miembros.filter((m) => m.deactivatedAt).map((m) => m.email.toLowerCase());
  const casa = new Map(miembros.filter((m) => !m.deactivatedAt).map((m) => [m.email.toLowerCase(), claveDeEquipo(m.area, m.email)]));

  const r = await prisma.$transaction(async (tx) => {
    // 2a. Proyectos propuestos que nadie decidió: descartados por vencimiento; sus tareas propuestas quedan sueltas.
    const proyectos = await tx.proyectoDeTareas.updateManyAndReturn({
      where: { estado: "propuesta", createdAt: { lte: limite } },
      data: { estado: "descartado", decision: "vencida", decididaPorEmail: SISTEMA, decididaAt: ahora, version: { increment: 1 } },
      select: { id: true },
    });
    if (proyectos.length) {
      const ids = proyectos.map((x) => x.id);
      await tx.tarea.updateMany({ where: { proyectoId: { in: ids }, archivadaAt: null, equipo: { not: null } }, data: { proyectoId: null, version: { increment: 1 } } });
      // Las de un plan del chat esperaban sin dueño ni sprint: sin esto quedaban abiertas para siempre en un proyecto
      // descartado (lo mismo que hace descartarlo a mano).
      await tx.tarea.updateMany({ where: { proyectoId: { in: ids }, archivadaAt: null, equipo: null, responsableEmail: null, origen: "chat" }, data: { archivadaAt: ahora, version: { increment: 1 } } });
      await tx.tareaEvento.createMany({ data: ids.map((id) => ({ proyectoId: id, tipo: "decidida", porEmail: SISTEMA, datos: { decision: "vencida" } })) });
    }

    // 2b. Tareas propuestas que nadie decidió.
    const vencidas = await tx.tarea.updateManyAndReturn({
      where: { estado: "propuesta", createdAt: { lte: limite } },
      data: { estado: "vencida", decision: "vencida", decididaPorEmail: SISTEMA, decididaAt: ahora, version: { increment: 1 } },
      select: { id: true },
    });
    if (vencidas.length) await tx.tareaEvento.createMany({ data: vencidas.map((t) => ({ tareaId: t.id, tipo: "decidida", porEmail: SISTEMA, datos: { decision: "vencida" } })) });

    // 3. Lo abierto de quien se dio de baja.
    let aPorAsignar = 0;
    let privadasDeBajas = 0;
    if (deBaja.length) {
      const abiertas = await tx.tarea.findMany({
        where: { responsableEmail: { in: deBaja }, estado: { in: ["pendiente", "en_curso"] }, archivadaAt: null },
        select: { id: true, responsableEmail: true, equipo: true, proyectoId: true, privada: true },
      });
      for (const t of abiertas) {
        if (t.privada) {
          privadasDeBajas++;
          continue;
        }
        // Su sprint personal se queda sin nadie: en un proyecto, la tarea queda en el proyecto (sin sprint). Fuera de uno,
        // queda donde está y la señala INV43.
        const sprintMuerto = !!t.equipo && esEquipoPersonal(t.equipo) && duenoDelEquipoPersonal(t.equipo) === t.responsableEmail;
        await tx.tarea.update({
          where: { id: t.id },
          data: { responsableEmail: null, semana: null, ...(sprintMuerto && t.proyectoId ? { equipo: null } : {}), version: { increment: 1 } },
        });
        await evento(tx, { tareaId: t.id, tipo: "asignada", porEmail: SISTEMA, datos: { desde: t.responsableEmail, hacia: null, motivo: "baja" } });
        aPorAsignar++;
      }
    }

    // 4. Lo de quien cambió de área: a su sprint de casa.
    const conResponsable = await tx.tarea.findMany({
      where: { responsableEmail: { in: [...casa.keys()] }, estado: { in: ["propuesta", "pendiente", "en_curso"] }, archivadaAt: null },
      select: { id: true, responsableEmail: true, equipo: true },
    });
    let mudadas = 0;
    for (const t of conResponsable) {
      const destino = casa.get(t.responsableEmail!);
      if (!destino || destino === t.equipo) continue;
      await tx.tarea.update({ where: { id: t.id }, data: { equipo: destino, version: { increment: 1 } } });
      await evento(tx, { tareaId: t.id, tipo: "sprint", porEmail: SISTEMA, datos: { desde: t.equipo, hacia: destino } });
      mudadas++;
    }

    return { vencidas: vencidas.length, proyectosVencidos: proyectos.length, aPorAsignar, privadasDeBajas, mudadas };
  }, OPCIONES_DE_TX);
  return r;
}

/* ── El pase de cuenta (2026-10-19) ──────────────────────────────────────────────────────────────────────────────── */

export interface PaseDeTareas {
  clientId: string;
  /**
   * A quién va cada tarea de la cuenta que se muda (lib/tareas/pase.ts), según su responsable y su proyecto; null = se
   * queda. Lo arma lib/cuentas/pase.ts: un proyecto cuyo dueño cambió manda las suyas al dueño nuevo; las de la cuenta
   * van al encargado nuevo.
   */
  destino: (t: { responsableEmail: string; projectId: string | null }) => string | null;
  /** Quien hizo el pase; null = cambió en HubSpot (firma el sistema). */
  porEmail: string | null;
  motivo: MotivoDelPase;
}

export interface TareaDelPase {
  id: string;
  numero: number;
  titulo: string;
  de: string;
  a: string;
  porQue: PorQueLaMueve;
}

export interface ResultadoDelPaseDeTareas {
  movidas: TareaDelPase[];
  /** Propuestas que la persona nueva ya tenía iguales: se juntan con la suya, como «No es mía». */
  fusionadas: number;
  /** Otra persona la cambió mientras tanto (versión distinta): queda como estaba. */
  noSePudieron: number;
}

/**
 * Muda al encargado nuevo las tareas abiertas de la cuenta que eran del anterior POR SER EL ENCARGADO (el criterio vive
 * en lib/tareas/pase.ts). Una transacción por tarea, con su evento «asignada» (`motivo: "pase"`, «pasó de X a Y por el
 * pase de cuenta»). Va a la semana de la persona nueva (`semanaDestino`, nunca una ya revisada) y su sprint de casa; el
 * bloque de la agenda era del calendario de la anterior, así que vuelve a «sin agendar». Con `simular` no escribe nada.
 * Correrla dos veces no mueve nada la segunda: la tarea ya es de la persona nueva.
 */
export async function pasarTareasPorElPase(p: PaseDeTareas, opciones: { simular?: boolean } = {}, ahora = new Date()): Promise<ResultadoDelPaseDeTareas> {
  const [candidatas, miembros] = await Promise.all([
    prisma.tarea.findMany({
      where: { clientId: p.clientId, archivadaAt: null, privada: false, responsableEmail: { not: null }, estado: { in: [...ESTADOS_QUE_SE_MUDAN] } },
      select: {
        id: true,
        numero: true,
        titulo: true,
        version: true,
        estado: true,
        privada: true,
        archivadaAt: true,
        origen: true,
        origenId: true,
        clase: true,
        lado: true,
        creadaPorEmail: true,
        equipo: true,
        responsableEmail: true,
        projectId: true,
        semana: true,
        huella: true,
        pedidaPorEmail: true,
        sessionId: true,
        cita: true,
        agendaEstado: true,
      },
      orderBy: { numero: "asc" },
    }),
    prisma.teamMember.findMany({ where: { deactivatedAt: null }, select: { email: true, name: true, area: true, lideraEquipos: true } }),
  ]);
  const casa = new Map(miembros.map((m) => [m.email.toLowerCase(), claveDeEquipo(m.area, m.email)]));
  // El siguiente paso de CS lo lleva alguien del sprint de CS (de casa o porque lo lidera): a otra persona no se le pasa.
  const deCs = new Set(miembros.filter((m) => claveDeEquipo(m.area, m.email) === "cs" || m.lideraEquipos.includes("cs")).map((m) => m.email.toLowerCase()));
  const nombre = new Map(miembros.map((m) => [m.email.toLowerCase(), m.name]));
  const firma = firmaDelPase(p.porEmail);
  const r: ResultadoDelPaseDeTareas = { movidas: [], fusionadas: 0, noSePudieron: 0 };
  const tocadas = new Set<string>();

  for (const t of candidatas) {
    const porQue = porQueLaMueveElPase(t);
    if (!porQue) continue;
    const de = t.responsableEmail!.toLowerCase();
    const a = p.destino({ responsableEmail: de, projectId: t.projectId })?.toLowerCase() ?? null;
    if (!a || a === de) continue;
    const equipoNuevo = casa.get(a);
    if (!equipoNuevo) continue; // solo a alguien del equipo activo
    if (porQue === "siguiente-paso" && !deCs.has(a)) continue;
    r.movidas.push({ id: t.id, numero: t.numero, titulo: t.titulo, de, a, porQue });
    if (opciones.simular) continue;

    const datos = { desde: de, hacia: a, motivo: "pase", porque: p.motivo, texto: textoDelPase(nombre.get(de) ?? de, nombre.get(a) ?? a, p.motivo) };
    const esPropuesta = t.estado === "propuesta";
    // Una propuesta igual que la persona nueva ya tiene (mismo título, cliente y pedido) chocaría con el único: se junta.
    const igual = esPropuesta
      ? await prisma.tarea.findFirst({
          where: { estado: "propuesta", huella: t.huella, responsableEmail: a, clientId: p.clientId, pedidaPorEmail: t.pedidaPorEmail ?? null, id: { not: t.id } },
          select: { id: true },
        })
      : null;
    try {
      await prisma.$transaction(async (tx) => {
        if (igual) {
          const n = await tx.tarea.updateMany({
            where: { id: t.id, version: t.version, estado: "propuesta" },
            data: { estado: "fusionada", decision: "misma", decididaPorEmail: firma, decididaAt: ahora, mismaQueId: igual.id, version: { increment: 1 } },
          });
          if (n.count === 0) throw new ErrorDeTareas(409, "cambió");
          await evento(tx, { tareaId: t.id, tipo: "pase", porEmail: firma, datos: { ...datos, juntadaCon: igual.id } });
          await evento(tx, { tareaId: igual.id, tipo: "mencionada", porEmail: firma, sessionId: t.sessionId, cita: t.cita, datos: { de: "pase", desde: t.id } });
          return;
        }
        const semana = t.semana && !esPropuesta ? await semanaDestino(tx, a, comoFecha(t.semana)!, true, ahora) : comoFecha(t.semana);
        const n = await tx.tarea.updateMany({
          where: { id: t.id, version: t.version, responsableEmail: t.responsableEmail },
          data: {
            responsableEmail: a,
            // Una tarea sin sprint (la de un proyecto) sigue sin sprint; las demás van al sprint de casa de la persona nueva.
            // El siguiente paso es del sprint de CS: se queda ahí (la persona nueva es de CS o lo lidera).
            ...(t.equipo === null || porQue === "siguiente-paso" ? {} : { equipo: equipoNuevo }),
            semana: semana ? aDate(semana) : null,
            ...(t.agendaEstado === "sin_agendar" ? {} : { agendaEstado: "sin_agendar" }),
            version: { increment: 1 },
          },
        });
        if (n.count === 0) throw new ErrorDeTareas(409, "cambió");
        await evento(tx, { tareaId: t.id, tipo: "pase", porEmail: firma, datos });
      }, OPCIONES_DE_TX);
      if (igual) r.fusionadas++;
      tocadas.add(de).add(a);
    } catch (e) {
      // Otra corrida la movió primero (versión distinta) o dejó una propuesta igual (el único): queda como está y se sigue.
      if (!(e instanceof ErrorDeTareas) && !esUnicoDuplicado(e)) throw e;
      r.movidas.pop();
      r.noSePudieron++;
    }
  }
  for (const e of tocadas) olvidarMedicion(e);
  return r;
}

/** ¿Está prendido el cierre automático de la semana? (`TAREAS_CIERRE_AUTOMATICO=1`, apagado por defecto). */
export function cierreAutomaticoPrendido(env: Record<string, string | undefined> = process.env): boolean {
  return env.TAREAS_CIERRE_AUTOMATICO === "1";
}

/**
 * El paso 1 del lunes (docs/tareas-plan.md §5.8): la semana PASADA de quien no la revisó la revisa el sistema. Lo que
 * quedó abierto pasa a la primera semana que la persona no revisó (desde la de hoy), con un solo pase del sistema que
 * no cuenta ni avisa, y la semana queda cerrada por `sistema`. Solo la semana pasada: las anteriores siguen en
 * «Semanas sin revisar». Lo privado entra igual: es de la persona y el sistema solo lo corre de semana. La persona lo
 * corrige con «Revisar» en Mis tareas, y su respuesta reemplaza la del sistema.
 */
export async function cerrarSemanaPasadaComoSistema(ahora = new Date()): Promise<{ personas: number; tareas: number }> {
  const hoy = lunesDeHoy(ahora);
  const W = sumarSemanas(hoy, -1);
  const abiertas = await prisma.tarea.findMany({
    where: { semana: aDate(W), estado: { in: ["pendiente", "en_curso"] }, archivadaAt: null, responsableEmail: { not: null } },
    select: { id: true, responsableEmail: true, equipo: true, clientId: true, projectId: true, proyectoId: true, venceEl: true, minutosEstimados: true },
  });
  const porPersona = new Map<string, typeof abiertas>();
  for (const t of abiertas) porPersona.set(t.responsableEmail!, [...(porPersona.get(t.responsableEmail!) ?? []), t]);
  const yaCerradas = new Set(
    (await prisma.cierreDeSemana.findMany({ where: { semana: aDate(W), personaEmail: { in: [...porPersona.keys()] } }, select: { personaEmail: true } })).map((c) => c.personaEmail),
  );
  let personas = 0;
  let tareas = 0;
  for (const [persona, suyas] of porPersona) {
    if (yaCerradas.has(persona)) continue;
    await prisma.$transaction(async (tx) => {
      const revisadas = await semanasRevisadas(tx, persona);
      revisadas.add(W);
      const destino = primeraSemanaSinRevisar(hoy, revisadas, { lunesDeHoy: hoy, conPiso: true });
      for (const t of suyas) {
        await tx.tarea.update({ where: { id: t.id }, data: { semana: aDate(destino), agendaEstado: "sin_agendar", version: { increment: 1 } } });
        await evento(tx, { tareaId: t.id, tipo: "revisada", porEmail: SISTEMA, datos: { semana: W, resultado: "pasa", hacia: destino } });
        await anotarResultado(tx, t, W, "pasa", SISTEMA, ahora);
      }
      await tx.cierreDeSemana.create({ data: { personaEmail: persona, semana: aDate(W), cerradaPor: SISTEMA, cerradaAt: ahora } });
    }, OPCIONES_DE_TX);
    personas++;
    tareas += suyas.length;
    olvidarMedicion(persona);
  }
  return { personas, tareas };
}

/* ── Agenda ──────────────────────────────────────────────────────────────────────── */

/**
 * Guarda los bloques que se crearon (o que la persona dice haber guardado). Solo la dueña de la tarea. Reemplaza SOLO
 * los suyos: los de otro calendario (de quien la tenía antes) se conservan, para que esa persona los pueda quitar, y
 * también los propios que se piden conservar (los que no se pudieron borrar de Calendar). El estado y el inicio de la
 * agenda salen de los nuevos.
 */
export async function anotarAgenda(ctx: ContextoDeTareas, id: string, bloques: BloqueDeAgenda[], minutos?: number | null, ahora = new Date(), conservar: readonly BloqueDeAgenda[] = []) {
  const t = await cargar(prisma, id, ctx);
  if (t.responsableEmail !== ctx.email) throw new ErrorDeTareas(403, "Solo la dueña de la tarea la agenda en su calendario.");
  const ordenados = [...bloques].sort((a, b) => a.inicio.localeCompare(b.inicio));
  const { ajenos } = repartirBloques(leerBloques(t.agendaBloques), ctx.email, ahora);
  const guardados = [...ajenos, ...conservar, ...ordenados];
  await prisma.$transaction(async (tx) => {
    await actualizar(tx, t, {}, {
      agendaEstado: ordenados.length ? "agendada" : "sin_agendar",
      agendaBloques: guardados as unknown as Prisma.InputJsonValue,
      agendaInicio: ordenados[0] ? new Date(ordenados[0].inicio) : null,
      agendadaAt: ordenados.length ? ahora : null,
      ...(minutos ? { minutosEstimados: minutos } : {}),
    });
    await evento(tx, { tareaId: t.id, tipo: "agenda", porEmail: ctx.email, datos: { bloques: ordenados.length } });
  });
}

/**
 * Saca de la tarea los bloques del calendario de quien hace clic (ya borrados de Calendar, o que no se pudieron borrar y
 * la persona quita a mano). Lo puede hacer la dueña del CALENDARIO aunque ya no sea la responsable: el bloque es suyo.
 * Si quien quita es la responsable, la tarea queda sin agendar.
 */
export async function soltarMisBloques(ctx: ContextoDeTareas, id: string, ahora = new Date()) {
  const t = await cargar(prisma, id, ctx);
  const { mios, ajenos } = repartirBloques(leerBloques(t.agendaBloques), ctx.email, ahora);
  if (!mios.length) throw new ErrorDeTareas(403, "No tienes bloques de esta tarea en tu calendario.");
  const esResponsable = t.responsableEmail === ctx.email;
  await prisma.$transaction(async (tx) => {
    await actualizar(tx, t, {}, {
      agendaBloques: ajenos as unknown as Prisma.InputJsonValue,
      ...(esResponsable ? { agendaEstado: "sin_agendar", agendaInicio: null, agendadaAt: null } : {}),
    });
    await evento(tx, { tareaId: t.id, tipo: "agenda", porEmail: ctx.email, datos: { quitados: mios.length } });
  });
}

/**
 * Une una reunión planeada (tarea de clase «reunion») con la reunión de Meet que la cumplió (P3 etapa 2,
 * lib/tareas/reunion-hecha-server.ts). Solo si todavía no tenía una. No sube la versión (no es un cambio de la persona) y
 * deja su evento firmado por el sistema. false = ya estaba unida.
 */
export async function unirReunionHecha(tareaId: string, sessionId: string, ahora = new Date()): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const r = await tx.tarea.updateMany({ where: { id: tareaId, clase: "reunion", reunionHechaId: null }, data: { reunionHechaId: sessionId } });
    if (!r.count) return false;
    await evento(tx, { tareaId, tipo: "reunion_hecha", porEmail: SISTEMA, sessionId, datos: { en: ahora.toISOString() } });
    return true;
  }, OPCIONES_DE_TX);
}

/* ── Proyectos ───────────────────────────────────────────────────────────────────── */

export interface NuevoProyecto {
  nombre: string;
  espacioId?: string | null;
  responsableEmail?: string | null;
  descripcion?: string | null;
  iniciaEl?: string | null;
  venceEl?: string | null;
  clientId?: string | null;
  projectId?: string | null;
}

/** El espacio donde puede crear: el de su equipo (o uno libre donde es miembro). */
async function espacioParaCrear(ctx: ContextoDeTareas, espacioId: string | null | undefined): Promise<string> {
  if (!espacioId) return (await asegurarEspacio(prisma, ctx.equipo)).id;
  const e = await prisma.espacioDeTareas.findUnique({ where: { id: espacioId }, select: { id: true, tipo: true, equipo: true, archivadoAt: true, miembros: { where: { email: ctx.email }, select: { email: true } } } });
  if (!e || e.archivadoAt) throw new ErrorDeTareas(404, "Ese espacio no existe.");
  const puede = ctx.esSuperAdmin || (e.tipo === "equipo" ? e.equipo === ctx.equipo || ctx.lidera.includes(e.equipo ?? "") : e.miembros.length > 0);
  if (!puede) throw new ErrorDeTareas(403, "No eres de ese espacio.");
  return e.id;
}

export async function crearProyecto(ctx: ContextoDeTareas, clientes: ClientesQueVes, n: NuevoProyecto) {
  const nombre = n.nombre.trim();
  if (!nombre) throw new ErrorDeTareas(400, "Ponle un nombre al proyecto.");
  const espacioId = await espacioParaCrear(ctx, n.espacioId);
  const para = await resolverParaQuien(prisma, { clientId: n.clientId ?? null, projectId: n.projectId ?? null, proyectoId: null }, clientes, ctx);
  const responsable = (n.responsableEmail ?? ctx.email).toLowerCase();
  if (!equipoDe(responsable, ctx.miembros)) throw new ErrorDeTareas(400, "Esa persona no está en el equipo.");
  const p = await prisma.$transaction(async (tx) => {
    const p = await tx.proyectoDeTareas.create({
      data: {
        espacioId,
        nombre,
        huella: normalizar(nombre),
        descripcion: n.descripcion?.trim() || null,
        estado: "activo",
        responsableEmail: responsable,
        iniciaEl: n.iniciaEl ? aDate(n.iniciaEl) : null,
        venceEl: n.venceEl ? aDate(n.venceEl) : null,
        clientId: para.clientId,
        projectId: para.projectId,
        origen: "mano",
        creadoPorEmail: ctx.email,
      },
      select: { id: true },
    });
    await evento(tx, { proyectoId: p.id, tipo: "creada", porEmail: ctx.email, datos: {} });
    return p;
  });
  if (responsable !== ctx.email) {
    await avisar({ para: responsable, tipo: "tareas.proyecto", titulo: `${ctx.nombre} te nombró responsable de «${nombre}»`, href: `/tareas?p=${p.id}`, actorEmail: ctx.email, dedupeKey: `tareas.proyecto:${p.id}:${responsable}` });
  }
  return p;
}

export interface CambiosDeProyecto {
  nombre?: string;
  descripcion?: string | null;
  responsableEmail?: string | null;
  iniciaEl?: string | null;
  venceEl?: string | null;
  clientId?: string | null;
  projectId?: string | null;
  estado?: "activo" | "en_pausa" | "terminado";
  secciones?: string[];
}

async function puedeAdministrarProyecto(ctx: ContextoDeTareas, p: { responsableEmail: string | null; creadoPorEmail: string | null; espacio: { tipo: string; equipo: string | null; miembros: { email: string; rol: string }[] } }): Promise<boolean> {
  return administraElProyecto(ctx, p);
}

/** Edita un proyecto. Cambiar su cliente lo cambia en TODAS sus tareas, en la misma transacción. */
export async function editarProyecto(ctx: ContextoDeTareas, clientes: ClientesQueVes, id: string, version: number, c: CambiosDeProyecto) {
  const p = await prisma.proyectoDeTareas.findUnique({
    where: { id },
    select: { id: true, version: true, nombre: true, estado: true, clientId: true, projectId: true, responsableEmail: true, creadoPorEmail: true, espacio: { select: { tipo: true, equipo: true, miembros: { select: { email: true, rol: true } } } } },
  });
  if (!p) throw new ErrorDeTareas(404, "Ese proyecto no existe.");
  if (p.version !== version) throw new ErrorDeTareas(409, "Otra persona cambió este proyecto. Recarga para ver lo último.");
  if (!(await puedeAdministrarProyecto(ctx, p))) throw new ErrorDeTareas(403, "No puedes editar este proyecto.");
  if (c.estado !== undefined && (p.estado === "propuesta" || p.estado === "descartado")) {
    throw new ErrorDeTareas(409, p.estado === "propuesta" ? "Ese proyecto es un borrador: actívalo o descártalo desde su página." : "Ese proyecto se descartó.");
  }
  const tocaCliente = c.clientId !== undefined || c.projectId !== undefined;
  const para = tocaCliente
    ? await resolverParaQuien(prisma, { clientId: c.clientId !== undefined ? c.clientId : p.clientId, projectId: c.projectId !== undefined ? c.projectId : c.clientId !== undefined ? null : p.projectId, proyectoId: null }, clientes, ctx)
    : null;
  if (para && para.clientId !== p.clientId) {
    await exigirClienteDeLaCita(
      await prisma.tarea.findMany({ where: { proyectoId: id, sessionId: { not: null }, cita: { not: null } }, select: { sessionId: true, cita: true, clientId: true } }),
      para.clientId,
    );
  }
  if (c.secciones && c.secciones.length > MAX_SECCIONES) throw new ErrorDeTareas(400, `Un proyecto tiene como mucho ${MAX_SECCIONES} secciones.`);
  await prisma.$transaction(async (tx) => {
    const r = await tx.proyectoDeTareas.updateMany({
      where: { id, version },
      data: {
        ...(c.nombre !== undefined ? { nombre: c.nombre.trim(), huella: normalizar(c.nombre) } : {}),
        ...(c.descripcion !== undefined ? { descripcion: c.descripcion } : {}),
        ...(c.responsableEmail !== undefined ? { responsableEmail: c.responsableEmail?.toLowerCase() ?? null } : {}),
        ...(c.iniciaEl !== undefined ? { iniciaEl: c.iniciaEl ? aDate(c.iniciaEl) : null } : {}),
        ...(c.venceEl !== undefined ? { venceEl: c.venceEl ? aDate(c.venceEl) : null } : {}),
        ...(c.estado !== undefined ? { estado: c.estado } : {}),
        ...(c.secciones !== undefined ? { secciones: c.secciones } : {}),
        ...(para ? { clientId: para.clientId, projectId: para.projectId } : {}),
        version: { increment: 1 },
      },
    });
    if (r.count === 0) throw new ErrorDeTareas(409, "Otra persona cambió este proyecto. Recarga para ver lo último.");
    if (para && (para.clientId !== p.clientId || para.projectId !== p.projectId)) {
      await tx.tarea.updateMany({ where: { proyectoId: id }, data: { clientId: para.clientId, projectId: para.projectId, version: { increment: 1 } } });
    }
    await evento(tx, { proyectoId: id, tipo: "editada", porEmail: ctx.email, datos: { campos: Object.keys(c) } });
  });
}

/** Usar o descartar un proyecto propuesto (lo sugirió una lectura). Sus tareas siguen como propuestas sueltas o dentro. */
export async function decidirProyecto(ctx: ContextoDeTareas, id: string, version: number, decision: "usar" | "descartar", cambios: { nombre?: string; responsableEmail?: string | null } = {}, ahora = new Date()) {
  const p = await prisma.proyectoDeTareas.findUnique({
    where: { id },
    select: { id: true, version: true, nombre: true, estado: true, origen: true, responsableEmail: true, creadoPorEmail: true, lectura: { select: { pedidaPorEmail: true } }, espacio: { select: { tipo: true, equipo: true, miembros: { select: { email: true, rol: true } } } } },
  });
  if (!p) throw new ErrorDeTareas(404, "Ese proyecto no existe.");
  if (p.estado !== "propuesta") throw new ErrorDeTareas(409, "Ese proyecto ya se decidió.");
  const puede = ctx.esSuperAdmin || p.lectura?.pedidaPorEmail === ctx.email || (await puedeAdministrarProyecto(ctx, p));
  if (!puede) throw new ErrorDeTareas(403, "Lo decide quien leyó la reunión o el líder del espacio.");
  const avisosDelPlan: Parameters<typeof avisar>[0][] = [];
  await prisma.$transaction(async (tx) => {
    const r = await tx.proyectoDeTareas.updateMany({
      where: { id, version, estado: "propuesta" },
      data: decision === "usar"
        ? {
            estado: "activo",
            decision: cambios.nombre && cambios.nombre.trim() !== p.nombre ? "con_cambios" : "tal_cual",
            decididaPorEmail: ctx.email,
            decididaAt: ahora,
            responsableEmail: (cambios.responsableEmail ?? p.responsableEmail ?? ctx.email).toLowerCase(),
            ...(cambios.nombre ? { nombre: cambios.nombre.trim(), huella: normalizar(cambios.nombre) } : {}),
            version: { increment: 1 },
          }
        : { estado: "descartado", decision: "rechazada", decididaPorEmail: ctx.email, decididaAt: ahora, version: { increment: 1 } },
    });
    if (r.count === 0) throw new ErrorDeTareas(409, "Ese proyecto ya se decidió.");
    // Descartado: sus tareas salieron de líneas reales, así que siguen, sueltas: las propuestas y lo ya aceptado (las
    // «Por asignar», las que alguien ya usó). Sin sprint no pueden salir (el CHECK pide proyecto): esas quedan.
    if (decision === "descartar") await tx.tarea.updateMany({ where: { proyectoId: id, archivadaAt: null, equipo: { not: null } }, data: { proyectoId: null, version: { increment: 1 } } });
    // Un plan del chat: activarlo reparte sus tareas; descartarlo archiva las que esperaban (nunca le llegaron a nadie).
    if (p.origen === "chat") {
      if (decision === "usar") avisosDelPlan.push(...(await repartirElPlan(tx, ctx, id, ahora)));
      else await tx.tarea.updateMany({ where: { proyectoId: id, archivadaAt: null, equipo: null, responsableEmail: null, origen: "chat" }, data: { archivadaAt: ahora, version: { increment: 1 } } });
    }
    await evento(tx, { proyectoId: id, tipo: "decidida", porEmail: ctx.email, datos: { decision } });
  }, OPCIONES_DE_TX);
  for (const a of avisosDelPlan) await avisar(a);
  for (const a of avisosDelPlan) for (const para of [a.para].flat()) if (para) olvidarMedicion(para);
  olvidarMedicion(ctx.email);
}

/**
 * Activar un plan del chat (docs/tareas-plan.md §6.6): cada tarea que esperaba sin responsable recibe a quien iba (su
 * evento `plan`), con las reglas de siempre evaluadas para QUIEN ACTIVA: lo suyo, pendiente en su semana; lo de otros,
 * propuesta (o asignado, si lo lidera o comparten el espacio); lo de un equipo, a su líder. «Nadie» se queda sin
 * responsable dentro del proyecto. Si esa persona ya no está, también.
 */
async function repartirElPlan(tx: Tx, ctx: ContextoDeTareas, proyectoId: string, ahora: Date): Promise<Parameters<typeof avisar>[0][]> {
  const avisos: Parameters<typeof avisar>[0][] = [];
  const yo = ctx.email;
  const filas = await tx.tarea.findMany({
    where: { proyectoId, archivadaAt: null, responsableEmail: null, equipo: null, origen: "chat", estado: "pendiente" },
    select: { ...SELECT_PARA_ESCRIBIR, eventos: { where: { tipo: "plan" }, orderBy: { createdAt: "desc" }, take: 1, select: { porEmail: true, datos: true } } },
  });
  for (const t of filas) {
    const plan = t.eventos[0];
    if (!plan) continue;
    const d = (plan.datos ?? {}) as { para?: { tipo?: string; email?: string; clave?: string }; semana?: string | null; privada?: boolean };
    let responsable: string | null = null;
    let equipo: string | null = null;
    if (d.para?.tipo === "yo") responsable = plan.porEmail.toLowerCase();
    else if (d.para?.tipo === "persona" && d.para.email) responsable = d.para.email.toLowerCase();
    else if (d.para?.tipo === "equipo" && d.para.clave && lideresDe(d.para.clave, ctx.miembros).length) equipo = d.para.clave;
    else continue;
    if (responsable) {
      equipo = equipoDe(responsable, ctx.miembros);
      if (!equipo) continue;
    }
    const paraEquipo = !responsable && equipo;
    const nace = nacePropuesta(yo, responsable, {
      equipoDelResponsable: equipo,
      creadorLideraEseEquipo: !!equipo && (ctx.lidera.includes(equipo) || ctx.esSuperAdmin),
      ambosEnElEspacioLibre: responsable ? await ambosEnElEspacioLibre(tx, proyectoId, yo, responsable) : false,
    });
    const propuesta = !!paraEquipo || (!!responsable && responsable !== yo && nace);
    const pedidaPorEmail = (!!responsable && responsable !== yo) || paraEquipo ? yo : null;
    if (propuesta) {
      const igual = await tx.tarea.findFirst({ where: { estado: "propuesta", huella: t.huella, clientId: t.clientId, pedidaPorEmail, ...(responsable ? { responsableEmail: responsable } : { responsableEmail: null, equipo }) }, select: { id: true } });
      if (igual) {
        // Ya le llegó la misma sugerencia: esta copia del plan se archiva (no queda sin dueño en el proyecto) y la otra
        // registra que el plan la volvió a nombrar.
        await tx.tarea.update({ where: { id: t.id }, data: { archivadaAt: ahora, mismaQueId: igual.id, version: { increment: 1 } } });
        await evento(tx, { tareaId: igual.id, tipo: "mencionada", porEmail: yo, datos: { de: "plan", proyectoId } });
        continue;
      }
    }
    const deseada = d.semana ?? null;
    const semana = deseada && responsable ? (propuesta ? deseada : await semanaDestino(tx, responsable, deseada, true, ahora)) : null;
    const deOtroEquipo = !!equipo && equipo !== ctx.equipo;
    await actualizar(tx, t, { responsableEmail: null, equipo: null }, {
      responsableEmail: responsable,
      equipo,
      estado: propuesta ? "propuesta" : "pendiente",
      semana: semana ? aDate(semana) : null,
      privada: !!d.privada && responsable === plan.porEmail.toLowerCase() && responsable === yo,
      pedidaPorEmail,
      pedidaPorEquipo: deOtroEquipo && pedidaPorEmail ? ctx.equipo : null,
      tipo: deOtroEquipo && pedidaPorEmail ? "apoyo" : "puesto",
    });
    await evento(tx, { tareaId: t.id, tipo: "repartida", porEmail: yo, datos: { para: responsable, equipo, propuesta } });
    // Una sugerencia o un pedido a un equipo no avisa (fase 1.3): ya es un pendiente en «Para ti».
    if (!propuesta && !paraEquipo && responsable && responsable !== yo) {
      avisos.push({ para: responsable, tipo: "tareas.asignada", titulo: `${ctx.nombre} te asignó «${t.titulo}»`, href: urlDeLaTarea(t.id), actorEmail: yo, dedupeKey: `tareas.asignada:${t.id}:${responsable}` });
    }
  }
  return avisos;
}

/* ── Lo que necesita la lectura ──────────────────────────────────────────────────── */

export interface PropuestaDeLectura {
  /** Huella de la línea: `l:<lectura>:<id>` hace que volver a leer no duplique. */
  lineaId: string;
  titulo: string;
  notas: string | null;
  /** Lo escribió Nexus: para qué es, para quién y qué se espera (lib/tareas/contexto-de-tarea.ts). */
  contexto: string | null;
  cita: string;
  responsableEmail: string | null;
  /** El sprint: el de casa del responsable; sin responsable, el de la lectura. */
  equipo: string;
  semana: string | null;
  venceEl: string | null;
  clientId: string | null;
  projectId: string | null;
  proyectoId: string | null;
  pedidaPorEmail: string | null;
  pedidaPorEquipo: string | null;
  mismaQueId: string | null;
  /** Lo que sugirió Nexus (cliente, proyecto, menciones, candidatas…): va en el evento `propuesta`, sin citas. */
  sugerido: { clienteSugeridoId?: string; proyectoSugeridoId?: string; confirmarPersona?: string } & Record<string, unknown>;
  /** «Por asignar»: nace aceptada, sin responsable ni semana. */
  porAsignar: boolean;
}

/**
 * Escribe las propuestas de una lectura. Las que ya existen (mismo `origenId`) no se tocan: releer no pisa lo decidido.
 * `sinTope`: las pidió su propia dueña («Proponérmelas», lib/tareas/lectura.ts › `proponerLasQueQuedaronFuera`): el
 * cupo de 5 por persona por reunión no las frena. `tope`: el de una reunión con un cliente o un prospecto
 * (`MAX_PROPUESTAS_POR_PERSONA_POR_REUNION_CON_CLIENTE`, 3); sin decir, el de siempre (5).
 */
export async function escribirPropuestasDeLectura(
  tx: Tx,
  lectura: { id: string; sessionId: string | null; tituloReunion: string; pedidaPorEmail: string | null },
  propuestas: readonly PropuestaDeLectura[],
  o: { sinTope?: boolean; tope?: number } = {},
): Promise<{ creadas: { id: string; responsableEmail: string | null }[]; yaEstaban: number; sumadas: number; sinLugar: Map<string, number> }> {
  const creadas: { id: string; responsableEmail: string | null }[] = [];
  let yaEstaban = 0;
  let sumadas = 0;
  // Como mucho 5 por persona por reunión (ficha A, 2026-10-17), contando lo que ya dejó esta misma lectura.
  const duenos = [...new Set(propuestas.flatMap((p) => (!p.porAsignar && p.responsableEmail ? [p.responsableEmail.toLowerCase()] : [])))];
  const yaTiene = duenos.length
    ? await tx.tarea.groupBy({
        by: ["responsableEmail"],
        // Lo que se retiró porque el texto de la reunión cambió (retirarPropuestasDeLaReunion) no ocupa el cupo de la relectura.
        where: {
          lecturaId: lectura.id,
          creadaPorEmail: null,
          origen: { in: ["reunion", "notas"] },
          responsableEmail: { in: duenos },
          OR: [{ origenId: null }, { NOT: { origenId: { contains: ":retirada:" } } }],
        },
        _count: { _all: true },
      })
    : [];
  const cupo = cupoPorPersona(new Map(yaTiene.flatMap((g) => (g.responsableEmail ? [[g.responsableEmail, g._count._all] as const] : []))), o.tope);
  for (const p of propuestas) {
    const origenId = `l:${lectura.id}:${p.lineaId}`;
    const existe = await tx.tarea.findUnique({ where: { origenId }, select: { id: true } });
    if (existe) {
      yaEstaban++;
      continue;
    }
    const huella = huellaDeTexto(p.titulo);
    const estado = p.porAsignar ? "pendiente" : "propuesta";
    // Una propuesta idéntica para la misma persona, del mismo cliente y del mismo pedido: suma la cita.
    if (estado === "propuesta") {
      const igual = await tx.tarea.findFirst({
        where: { estado: "propuesta", huella, responsableEmail: p.responsableEmail, equipo: p.responsableEmail ? undefined : p.equipo, clientId: p.clientId, pedidaPorEmail: p.pedidaPorEmail },
        select: { id: true },
      });
      if (igual) {
        await evento(tx, { tareaId: igual.id, tipo: "mencionada", porEmail: "agente", sessionId: lectura.sessionId, cita: p.cita, datos: { lectura: lectura.id } });
        sumadas++;
        continue;
      }
    }
    if (!o.sinTope && !p.porAsignar && p.responsableEmail && !cupo.tomar(p.responsableEmail)) continue;
    const t = await tx.tarea.create({
      data: {
        titulo: p.titulo,
        huella,
        notas: p.notas,
        contexto: p.contexto,
        estado,
        equipo: p.equipo,
        responsableEmail: p.porAsignar ? null : p.responsableEmail,
        semana: !p.porAsignar && p.responsableEmail && p.semana ? aDate(p.semana) : null,
        venceEl: p.venceEl ? aDate(p.venceEl) : null,
        clientId: p.clientId,
        projectId: p.projectId,
        proyectoId: p.proyectoId,
        lado: p.sugerido.lado === "cliente" ? "cliente" : "smarteam",
        origen: "reunion",
        creadaPorEmail: null,
        pedidaPorEmail: p.pedidaPorEmail,
        pedidaPorEquipo: p.pedidaPorEquipo,
        // El título de la reunión ya vive en origenTitulo y se sirve con la regla de la cita: acá no se repite.
        pedidaPorTexto: null,
        tipo: p.pedidaPorEquipo ? "apoyo" : "puesto",
        lecturaId: lectura.id,
        sessionId: lectura.sessionId,
        origenTitulo: lectura.tituloReunion,
        cita: p.cita,
        origenId,
        mismaQueId: p.mismaQueId,
      },
      select: { id: true },
    });
    await evento(tx, { tareaId: t.id, tipo: p.porAsignar ? "creada" : "propuesta", porEmail: "agente", datos: { lectura: lectura.id, ...p.sugerido } });
    creadas.push({ id: t.id, responsableEmail: p.porAsignar ? null : p.responsableEmail });
  }
  for (const email of new Set(creadas.flatMap((c) => (c.responsableEmail ? [c.responsableEmail] : [])))) await podarSugerencias(tx, email);
  return { creadas, yaEstaban, sumadas, sinLugar: cupo.sinLugar() };
}

/** El `origenId` de lo que sale de un correo: `cor:<comunicación>:<línea>`. Releer el correo no duplica. */
export function origenIdDeUnCorreo(comunicacionId: string, lineaId: string): string {
  return `cor:${comunicacionId}:${lineaId}`;
}

/**
 * Escribe las propuestas que salen de un CORREO que mandó Smarteam (iniciativa B, lib/comunicaciones/compromisos-server.ts):
 * las mismas reglas que las de una reunión (`escribirPropuestasDeLectura`), sin reunión ni lectura. `origen = "correo"`;
 * el título del correo va en `pedidaPorTexto` («Correo del jue 16 oct «Minuta…»»), que se ve con la fila: un correo con
 * el cliente lo ve quien ve la cuenta. Como mucho 3 por persona por correo, y entran al tope de sugerencias abiertas.
 */
export async function escribirPropuestasDeComunicacion(
  tx: Tx,
  correo: { id: string; titulo: string },
  propuestas: readonly PropuestaDeLectura[],
): Promise<{ creadas: { id: string; responsableEmail: string | null }[]; yaEstaban: number; sumadas: number; sinLugar: Map<string, number> }> {
  const creadas: { id: string; responsableEmail: string | null }[] = [];
  let yaEstaban = 0;
  let sumadas = 0;
  const duenos = [...new Set(propuestas.flatMap((p) => (!p.porAsignar && p.responsableEmail ? [p.responsableEmail.toLowerCase()] : [])))];
  const yaTiene = duenos.length
    ? await tx.tarea.groupBy({
        by: ["responsableEmail"],
        where: { origen: "correo", creadaPorEmail: null, responsableEmail: { in: duenos }, origenId: { startsWith: `cor:${correo.id}:` } },
        _count: { _all: true },
      })
    : [];
  // Un correo es con un cliente o un prospecto: el tope de 3 (pocos y esenciales, 2026-10-19).
  const cupo = cupoPorPersona(new Map(yaTiene.flatMap((g) => (g.responsableEmail ? [[g.responsableEmail, g._count._all] as const] : []))), MAX_PROPUESTAS_POR_PERSONA_POR_REUNION_CON_CLIENTE);
  for (const p of propuestas) {
    const origenId = origenIdDeUnCorreo(correo.id, p.lineaId);
    const existe = await tx.tarea.findUnique({ where: { origenId }, select: { id: true } });
    if (existe) {
      yaEstaban++;
      continue;
    }
    const huella = huellaDeTexto(p.titulo);
    const estado = p.porAsignar ? "pendiente" : "propuesta";
    if (estado === "propuesta") {
      const igual = await tx.tarea.findFirst({
        where: { estado: "propuesta", huella, responsableEmail: p.responsableEmail, equipo: p.responsableEmail ? undefined : p.equipo, clientId: p.clientId, pedidaPorEmail: p.pedidaPorEmail },
        select: { id: true },
      });
      if (igual) {
        await evento(tx, { tareaId: igual.id, tipo: "mencionada", porEmail: "agente", cita: p.cita, datos: { correo: correo.id } });
        sumadas++;
        continue;
      }
    }
    if (!p.porAsignar && p.responsableEmail && !cupo.tomar(p.responsableEmail)) continue;
    const t = await tx.tarea.create({
      data: {
        titulo: p.titulo,
        huella,
        notas: p.notas,
        contexto: p.contexto,
        estado,
        equipo: p.equipo,
        responsableEmail: p.porAsignar ? null : p.responsableEmail,
        semana: !p.porAsignar && p.responsableEmail && p.semana ? aDate(p.semana) : null,
        venceEl: p.venceEl ? aDate(p.venceEl) : null,
        clientId: p.clientId,
        projectId: p.projectId,
        proyectoId: p.proyectoId,
        lado: p.sugerido.lado === "cliente" ? "cliente" : "smarteam",
        origen: "correo",
        creadaPorEmail: null,
        pedidaPorEmail: p.pedidaPorEmail,
        pedidaPorEquipo: p.pedidaPorEquipo,
        pedidaPorTexto: correo.titulo,
        tipo: p.pedidaPorEquipo ? "apoyo" : "puesto",
        cita: p.cita,
        origenId,
        mismaQueId: p.mismaQueId,
      },
      select: { id: true },
    });
    await evento(tx, { tareaId: t.id, tipo: p.porAsignar ? "creada" : "propuesta", porEmail: "agente", datos: { correo: correo.id, ...p.sugerido } });
    creadas.push({ id: t.id, responsableEmail: p.porAsignar ? null : p.responsableEmail });
  }
  for (const email of new Set(creadas.flatMap((c) => (c.responsableEmail ? [c.responsableEmail] : [])))) await podarSugerencias(tx, email);
  return { creadas, yaEstaban, sumadas, sinLugar: cupo.sinLugar() };
}

/**
 * Con más de `MAX_SUGERENCIAS_POR_PERSONA` sugerencias de las reuniones sin decidir, las más viejas vencen solas (fase
 * 1.4): quedan las más nuevas. Solo lo que propuso Nexus de una reunión; lo que pidió una persona no se toca. Vencer no
 * es una lápida: si se vuelve a hablar del tema, se vuelve a proponer.
 */
async function podarSugerencias(tx: Tx, email: string): Promise<number> {
  const sobran = await tx.tarea.findMany({
    where: { estado: "propuesta", archivadaAt: null, responsableEmail: email, creadaPorEmail: null, origen: { in: ["reunion", "notas", "correo"] } },
    orderBy: [{ createdAt: "desc" }, { numero: "desc" }],
    skip: MAX_SUGERENCIAS_POR_PERSONA,
    select: { id: true, version: true },
  });
  const ahora = new Date();
  for (const t of sobran) {
    const r = await tx.tarea.updateMany({
      where: { id: t.id, version: t.version, estado: "propuesta" },
      data: {
        estado: "vencida",
        decision: "vencida",
        decididaPorEmail: SISTEMA,
        decididaAt: ahora,
        motivo: `Había más de ${MAX_SUGERENCIAS_POR_PERSONA} sugerencias de las reuniones sin decidir: quedaron las más nuevas.`,
        version: { increment: 1 },
      },
    });
    if (r.count) await evento(tx, { tareaId: t.id, tipo: "decidida", porEmail: SISTEMA, datos: { decision: "vencida", porTope: MAX_SUGERENCIAS_POR_PERSONA } });
  }
  return sobran.length;
}

/** Lo que Nexus propuso de una reunión o un correo: lo único que la limpieza de «Por decidir» puede vencer. */
export const ORIGENES_DE_SUGERENCIA = ["reunion", "notas", "correo"] as const;

/**
 * Las tareas que una PERSONA tocó (un evento suyo, el pase de cuenta incluido, un comentario, una dependencia o un
 * vínculo): la limpieza de «Por decidir» no las vence. La misma consulta para el simulacro (scripts/aligerar-tareas.ts) y
 * para aplicar, así el número que se revisa es el que se aplica.
 */
export async function sugerenciasTocadas(db: Db, ids: readonly string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const lista = [...ids];
  const [eventos, comentarios, relaciones, vinculos] = await Promise.all([
    db.tareaEvento.findMany({ where: { tareaId: { in: lista }, porEmail: { notIn: NO_SON_PERSONAS } }, select: { tareaId: true } }),
    db.tareaComentario.findMany({ where: { tareaId: { in: lista } }, select: { tareaId: true } }),
    db.tareaRelacion.findMany({ where: { OR: [{ desdeId: { in: lista } }, { haciaId: { in: lista } }] }, select: { desdeId: true, haciaId: true } }),
    db.tareaVinculo.findMany({ where: { tareaId: { in: lista } }, select: { tareaId: true } }),
  ]);
  return new Set<string>([
    ...eventos.flatMap((e) => (e.tareaId ? [e.tareaId] : [])),
    ...comentarios.map((c) => c.tareaId),
    ...relaciones.flatMap((r) => [r.desdeId, r.haciaId]),
    ...vinculos.flatMap((v) => (v.tareaId ? [v.tareaId] : [])),
  ]);
}

/**
 * La limpieza de «Por decidir» (roadmap D2 etapa 1, 2026-10-27; scripts/aligerar-tareas.ts › C): vence como `sistema`
 * las sugerencias de Nexus que nadie decidió ni tocó, con su motivo. Es lo mismo que hace el tope o el job del lunes
 * (vencer no es una lápida: si se vuelve a hablar del tema, se vuelve a proponer) y nada se borra. Dentro de la
 * transacción se vuelve a mirar cada una: si una persona la tocó (un evento, un comentario, una dependencia o un
 * vínculo) o cambió de versión, queda como está. Devuelve cuántas venció.
 */
export async function vencerSugerenciasSinDecidir(lote: readonly { id: string; version: number; motivo: string; regla: string }[], ahora = new Date()): Promise<number> {
  if (!lote.length) return 0;
  return prisma.$transaction(async (tx) => {
    const tocadas = await sugerenciasTocadas(tx, lote.map((x) => x.id));
    let vencidas = 0;
    for (const t of lote) {
      if (tocadas.has(t.id)) continue;
      const r = await tx.tarea.updateMany({
        where: { id: t.id, version: t.version, estado: "propuesta", archivadaAt: null, creadaPorEmail: null, origen: { in: [...ORIGENES_DE_SUGERENCIA] } },
        data: { estado: "vencida", decision: "vencida", decididaPorEmail: SISTEMA, decididaAt: ahora, motivo: t.motivo.slice(0, 500), version: { increment: 1 } },
      });
      if (!r.count) continue;
      await evento(tx, { tareaId: t.id, tipo: "decidida", porEmail: SISTEMA, datos: { decision: "vencida", limpieza: t.regla } });
      vencidas++;
    }
    return vencidas;
  }, OPCIONES_DE_TX);
}

/**
 * Un proyecto que sugiere la lectura (R10). Si ya hay uno propuesto con la misma huella en el espacio, devuelve ese,
 * pero solo si es del MISMO cliente: si es de otro, `null` y las líneas quedan sueltas (no se crea otro: el índice
 * único es por espacio y nombre, y meterlas adentro mezclaría dos clientes en un proyecto, INV38).
 */
export async function escribirProyectoSugerido(
  tx: Tx,
  lectura: { id: string; sessionId: string | null },
  espacioId: string,
  grupo: { clave: string; nombre: string; cita: string; clientId: string | null },
): Promise<{ id: string; nuevo: boolean } | null> {
  const huella = normalizar(grupo.nombre);
  const origenId = `g:${lectura.id}:${grupo.clave}`;
  const ya = await tx.proyectoDeTareas.findFirst({ where: { OR: [{ origenId }, { espacioId, huella, estado: "propuesta" }] }, select: { id: true, clientId: true } });
  if (ya) return (ya.clientId ?? null) === (grupo.clientId ?? null) ? { id: ya.id, nuevo: false } : null;
  const p = await tx.proyectoDeTareas.create({
    data: {
      espacioId,
      nombre: grupo.nombre,
      huella,
      estado: "propuesta",
      origen: "reunion",
      lecturaId: lectura.id,
      sessionId: lectura.sessionId,
      cita: grupo.cita,
      clientId: grupo.clientId,
      origenId,
    },
    select: { id: true },
  });
  await evento(tx, { proyectoId: p.id, tipo: "propuesta", porEmail: "agente", datos: { lectura: lectura.id } });
  return { id: p.id, nuevo: true };
}

/** Las sugerencias de cierre que dejó la retro (prellenan «Revisa tu semana» en azul). */
export async function escribirSugerenciaDeCierre(tx: Tx, tareaId: string, d: { sessionId: string | null; cita: string; resultado: "hecha" | "no_hecha"; semana: string; lectura: string }) {
  await evento(tx, { tareaId, tipo: "sugerido_cierre", porEmail: "agente", sessionId: d.sessionId, cita: d.cita, datos: { resultado: d.resultado, semana: d.semana, lectura: d.lectura } });
}

/* ── El chat de tareas: aplicar un acuerdo (docs/tareas-plan.md §6.5) ───────────────────────────────────────────── */

export interface AcuerdoParaAplicar {
  hiloId: string;
  turnoId: string;
  /** Lo que quedó marcado, ya normalizado (con ids), en el orden del acuerdo. */
  operaciones: readonly OperacionDeTareas[];
  /** Lo que se dice además en el desenlace (lo que quedó sin aplicar). */
  notas: readonly string[];
}

export interface ResultadoDelAcuerdo {
  yaEstaba: boolean;
  /** Las tareas que se crearon (o que ya existían por su origen), con su número y su semana. */
  tareas: { id: string; numero: number; titulo: string; estado: string; responsableEmail: string | null; semana: string | null }[];
  proyectos: { id: string; nombre: string; borrador: boolean }[];
  /** Lo que se cambió de tareas o proyectos que ya existían. */
  cambios: number;
  /** El texto del desenlace que quedó en el hilo. */
  desenlace: string;
}

/** El orden de aplicar: lo que crea una ref, antes de lo que la usa (estable; un ciclo no puede venir de la prueba en seco). */
function ordenDeAplicar(deps: readonly (readonly number[])[]): number[] {
  const orden: number[] = [];
  const puesto = new Set<number>();
  for (let vuelta = 0; vuelta <= deps.length && orden.length < deps.length; vuelta++) {
    deps.forEach((d, i) => {
      if (!puesto.has(i) && d.every((j) => puesto.has(j) || j === i)) {
        puesto.add(i);
        orden.push(i);
      }
    });
  }
  return [...orden, ...deps.map((_, i) => i).filter((i) => !puesto.has(i))];
}

/** Lo que dice el desenlace: qué entró, contado. */
function detalleDelAcuerdo(r: Omit<ResultadoDelAcuerdo, "desenlace" | "yaEstaba">, yo: string, miembros: ContextoDeTareas["miembros"]): string {
  const partes: string[] = [];
  const tuyas = r.tareas.filter((t) => t.responsableEmail === yo);
  const sugeridas = r.tareas.filter((t) => t.estado === "propuesta");
  const otras = r.tareas.filter((t) => !tuyas.includes(t) && !sugeridas.includes(t));
  const lista = (ts: typeof r.tareas) => ts.slice(0, 4).map((t) => etiquetaT(t.numero)).join(", ") + (ts.length > 4 ? ` y ${ts.length - 4} más` : "");
  if (tuyas.length) partes.push(`${tuyas.length === 1 ? "quedó" : "quedaron"} ${lista(tuyas)} para ti`);
  if (sugeridas.length) {
    const personas = [...new Set(sugeridas.map((t) => (t.responsableEmail ? nombreDe(t.responsableEmail, miembros) : "el líder del equipo")))];
    partes.push(`${sugeridas.length === 1 ? "salió la sugerencia" : `salieron ${sugeridas.length} sugerencias`} para ${personas.join(" y ")}`);
  }
  if (otras.length) partes.push(`${otras.length === 1 ? "se creó" : "se crearon"} ${lista(otras)}`);
  for (const p of r.proyectos) partes.push(p.borrador ? `quedó el borrador del proyecto «${p.nombre}»: actívalo desde su página para repartir sus tareas` : `se creó el proyecto «${p.nombre}»`);
  if (r.cambios) partes.push(r.cambios === 1 ? "quedó 1 cambio" : `quedaron ${r.cambios} cambios`);
  return partes.join("; ") || "no había nada que cambiar";
}

/**
 * Aplica lo acordado en el chat de tareas, TODO O NADA, en una transacción: bloquea el hilo, exige que el acuerdo siga
 * vivo (si ya se aplicó, «Ya estaba aplicado» sin escribir nada), aplica cada operación con las mismas reglas que la
 * pantalla, y escribe el desenlace en el hilo en la misma transacción. Los avisos salen después del commit.
 *
 * Un plan (un proyecto nuevo con tareas) entra como BORRADOR: el proyecto en `propuesta` y sus tareas adentro, sin
 * responsable ni sprint, con a quién iban en su evento `plan`. Nadie recibe un aviso hasta que se active.
 */
export async function aplicarAcuerdoDelChat(ctx: ContextoDeTareas, clientes: ClientesQueVes, a: AcuerdoParaAplicar, ahora = new Date()): Promise<ResultadoDelAcuerdo> {
  const yo = ctx.email;
  const avisosDespues: Parameters<typeof avisar>[0][] = [];
  const tocadas = new Set<string>([yo]);
  const resultado = await prisma
    .$transaction(
    async (tx): Promise<ResultadoDelAcuerdo> => {
      const turnos = await bloquearHiloEnTx(tx, a.hiloId);
      const i = turnos.findIndex((t) => t.id === a.turnoId);
      if (i < 0) throw new ErrorDeTareas(404, "Ese acuerdo no es de tu conversación.");
      const estado = estadosDeAcuerdo(turnos)[i];
      if (estado === "aplicado") return { yaEstaba: true, tareas: [], proyectos: [], cambios: 0, desenlace: "" };
      if (estado !== "vivo") throw new ErrorDeTareas(409, "Ese acuerdo ya no está vigente: pídeselo de nuevo al asistente.");

      const ops = a.operaciones;
      const refTareas = new Map<string, { id: string; numero: number }>();
      const refProyectos = new Map<string, { id: string; borrador: boolean; clientId: string | null; projectId: string | null }>();
      const tareas: ResultadoDelAcuerdo["tareas"] = [];
      const anotar = (t: { id: string; numero: number; titulo: string; estado: string; responsableEmail: string | null; semana: Date | null }) => tareas.push({ ...t, semana: comoFecha(t.semana) });
      const proyectos: ResultadoDelAcuerdo["proyectos"] = [];
      let cambios = 0;

      const tareaPorRef = async (r: RefATarea): Promise<TareaParaEscribir> => {
        let id: string | undefined;
        if ("numero" in r) id = (await tx.tarea.findUnique({ where: { numero: r.numero }, select: { id: true } }))?.id;
        else id = refTareas.get(r.ref)?.id;
        if (!id) throw new ErrorDeTareas(422, "numero" in r ? `${etiquetaT(r.numero)} ya no existe.` : "Una tarea del acuerdo no se pudo crear.");
        return cargar(tx, id, ctx);
      };
      const esperar = async (t: { id: string; numero: number }, despuesDe: readonly RefATarea[]) => {
        for (const d of despuesDe) {
          const otra = await tareaPorRef(d);
          if (otra.id === t.id) continue;
          if (await bloqueaTransitivo(tx, t.id, otra.id)) throw new ErrorDeTareas(422, `${etiquetaT(otra.numero)} ya espera a ${etiquetaT(t.numero)}: sería un círculo.`);
          await tx.tareaRelacion.upsert({
            where: { desdeId_haciaId_tipo: { desdeId: otra.id, haciaId: t.id, tipo: "bloquea" } },
            create: { desdeId: otra.id, haciaId: t.id, tipo: "bloquea", creadaPorEmail: yo },
            update: {},
          });
          await evento(tx, { tareaId: t.id, tipo: "espera", porEmail: yo, datos: { espera: otra.id, numero: otra.numero, hiloId: a.hiloId } });
        }
      };

      for (const k of ordenDeAplicar(dependenciasDeOperacionesDeTareas(ops))) {
        const o = ops[k];
        switch (o.op) {
          case "proyecto.crear": {
            if (o.origen) {
              const ya = await tx.proyectoDeTareas.findUnique({ where: { origenId: o.origen }, select: { id: true, nombre: true, estado: true, clientId: true, projectId: true, creadoPorEmail: true } });
              if (ya && ya.creadoPorEmail?.toLowerCase() !== yo) throw new ErrorDeTareas(409, "Ese acuerdo choca con otro: pídeselo de nuevo al asistente.");
              if (ya) {
                refProyectos.set(o.ref, { id: ya.id, borrador: ya.estado === "propuesta", clientId: ya.clientId, projectId: ya.projectId });
                continue;
              }
            }
            const clave = o.espacioId.startsWith("equipo:") ? o.espacioId.slice("equipo:".length) : null;
            let espacioId: string;
            if (clave) {
              if (!(ctx.esSuperAdmin || clave === ctx.equipo || ctx.lidera.includes(clave))) throw new ErrorDeTareas(403, "No eres de ese espacio.");
              espacioId = (await asegurarEspacio(tx, clave)).id;
            } else {
              const e = await tx.espacioDeTareas.findUnique({ where: { id: o.espacioId }, select: { id: true, tipo: true, equipo: true, archivadoAt: true, miembros: { where: { email: yo }, select: { email: true } } } });
              if (!e || e.archivadoAt) throw new ErrorDeTareas(422, "Ese espacio ya no está.");
              if (!(ctx.esSuperAdmin || (e.tipo === "equipo" ? e.equipo === ctx.equipo || ctx.lidera.includes(e.equipo ?? "") : e.miembros.length > 0))) throw new ErrorDeTareas(403, "No eres de ese espacio.");
              espacioId = e.id;
            }
            const para = await resolverParaQuien(tx, { clientId: o.clientId ?? null, projectId: o.projectId ?? null, proyectoId: null }, clientes, ctx);
            const responsable = (o.responsableEmail ?? yo).toLowerCase();
            if (!equipoDe(responsable, ctx.miembros)) throw new ErrorDeTareas(422, `${nombreDe(responsable, ctx.miembros)} ya no está en el equipo.`);
            const borrador = ops.some((x) => x.op === "tarea.crear" && x.proyecto && "ref" in x.proyecto && x.proyecto.ref === o.ref);
            const huella = normalizar(o.nombre);
            if (borrador && (await tx.proyectoDeTareas.findFirst({ where: { espacioId, huella, estado: "propuesta" }, select: { id: true } }))) {
              throw new ErrorDeTareas(409, `Ya hay un borrador «${o.nombre}» en ese espacio: decídelo o cámbiale el nombre a este.`);
            }
            const p = await tx.proyectoDeTareas.create({
              data: {
                espacioId,
                nombre: o.nombre,
                huella,
                estado: borrador ? "propuesta" : "activo",
                responsableEmail: responsable,
                iniciaEl: o.inicia ? aDate(o.inicia) : null,
                venceEl: o.vence ? aDate(o.vence) : null,
                clientId: para.clientId,
                projectId: para.projectId,
                secciones: (o.secciones ?? []).slice(0, MAX_SECCIONES),
                origen: "chat",
                creadoPorEmail: yo,
                origenId: o.origen ?? null,
              },
              select: { id: true },
            });
            await evento(tx, { proyectoId: p.id, tipo: borrador ? "propuesta" : "creada", porEmail: yo, datos: { hiloId: a.hiloId } });
            refProyectos.set(o.ref, { id: p.id, borrador, clientId: para.clientId, projectId: para.projectId });
            proyectos.push({ id: p.id, nombre: o.nombre, borrador });
            if (!borrador && responsable !== yo) {
              tocadas.add(responsable);
              avisosDespues.push({ para: responsable, tipo: "tareas.proyecto", titulo: `${ctx.nombre} te nombró responsable de «${o.nombre}»`, href: `/tareas/proyectos/${p.id}`, actorEmail: yo, dedupeKey: `tareas.proyecto:${p.id}:${responsable}` });
            }
            break;
          }
          case "tarea.crear": {
            if (o.origen) {
              const ya = await tx.tarea.findUnique({ where: { origenId: o.origen }, select: { id: true, numero: true, titulo: true, estado: true, responsableEmail: true, semana: true, creadaPorEmail: true } });
              if (ya && ya.creadaPorEmail?.toLowerCase() !== yo) throw new ErrorDeTareas(409, "Ese acuerdo choca con otro: pídeselo de nuevo al asistente.");
              if (ya) {
                if (o.ref) refTareas.set(o.ref, ya);
                anotar({ id: ya.id, numero: ya.numero, titulo: ya.titulo, estado: ya.estado, responsableEmail: ya.responsableEmail, semana: ya.semana });
                continue;
              }
            }
            const delLote = o.proyecto && "ref" in o.proyecto ? refProyectos.get(o.proyecto.ref) : undefined;
            if (o.proyecto && "ref" in o.proyecto && !delLote) throw new ErrorDeTareas(422, "Una tarea va en un proyecto que no se creó.");
            const proyectoId = o.proyecto ? ("id" in o.proyecto ? o.proyecto.id : delLote!.id) : null;
            const huella = huellaDeTexto(o.titulo);
            const comun = {
              titulo: o.titulo,
              huella,
              notas: o.notas ?? null,
              contexto: o.contexto ?? null,
              // La reunión del chip de ese turno (la puso el servidor): el contexto se ve con la regla de su cita. Sin
              // cita: la línea literal no viene del chat (INV42 mira solo las que traen cita).
              sessionId: o.sesion ?? null,
              prioridad: o.prioridad ?? "media",
              seccion: o.seccion ?? null,
              etiquetas: (o.etiquetas ?? []).slice(0, 5),
              venceEl: o.cuando?.vence ? aDate(o.cuando.vence) : null,
              minutosEstimados: o.minutos ?? null,
              origen: "chat",
              creadaPorEmail: yo,
              origenId: o.origen ?? null,
            };

            // Dentro de un BORRADOR: sin responsable ni sprint; a quién iba queda en su evento `plan`.
            if (delLote?.borrador) {
              const clientId = delLote.clientId ?? o.clientId ?? null;
              if (clientId && clientId !== delLote.clientId && !clientes.ids.has(clientId)) throw new ErrorDeTareas(404, "No puedes elegir esa empresa.");
              // El proyecto de HubSpot de la tarea, solo si es del mismo cliente que queda (INV38).
              const projectId = delLote.projectId ?? (o.projectId && (o.clientId ?? null) === clientId ? o.projectId : null);
              const t = await tx.tarea.create({
                data: { ...comun, estado: "pendiente", tipo: "puesto", privada: false, equipo: null, responsableEmail: null, semana: null, proyectoId, clientId, projectId },
                select: { id: true, numero: true, titulo: true, estado: true, responsableEmail: true, semana: true },
              });
              await evento(tx, { tareaId: t.id, tipo: "plan", porEmail: yo, datos: { para: o.para, semana: o.cuando?.semana ?? null, vence: o.cuando?.vence ?? null, dia: o.dia ?? null, privada: !!o.privada, hiloId: a.hiloId } });
              if (o.ref) refTareas.set(o.ref, t);
              anotar(t);
              if (o.despuesDe?.length) await esperar(t, o.despuesDe);
              break;
            }

            let responsable: string | null = null;
            let equipo: string | null = null;
            const paraEquipo = o.para.tipo === "equipo" ? o.para.clave : null;
            if (o.para.tipo === "yo") responsable = yo;
            if (o.para.tipo === "persona") responsable = o.para.email.toLowerCase();
            if (responsable) {
              equipo = equipoDe(responsable, ctx.miembros);
              if (!equipo) throw new ErrorDeTareas(422, `${nombreDe(responsable, ctx.miembros)} ya no está en el equipo.`);
            }
            if (paraEquipo) {
              if (!lideresDe(paraEquipo, ctx.miembros).length) throw new ErrorDeTareas(422, `${nombreDelEquipo(paraEquipo)} ya no tiene líder: pídeselo a una persona.`);
              equipo = paraEquipo;
            }
            if (o.para.tipo === "nadie" && !proyectoId) throw new ErrorDeTareas(422, "Una tarea sin responsable va dentro de un proyecto.");
            const para = await resolverParaQuien(tx, { clientId: o.clientId ?? null, projectId: o.projectId ?? null, proyectoId }, clientes, ctx);
            const nace = nacePropuesta(yo, responsable, {
              equipoDelResponsable: equipo,
              creadorLideraEseEquipo: !!equipo && (ctx.lidera.includes(equipo) || ctx.esSuperAdmin),
              ambosEnElEspacioLibre: responsable ? await ambosEnElEspacioLibre(tx, para.proyectoId, yo, responsable) : false,
            });
            // Lo que el chat acordó como sugerencia sigue siendo sugerencia aunque quien aplica pudiera asignarla.
            const propuesta = !!paraEquipo || (!!responsable && responsable !== yo && (o.modo === "proponer" || nace));
            const deOtraPersona = !!responsable && responsable !== yo;
            const deOtroEquipo = !!equipo && equipo !== ctx.equipo;
            const pedidaPorEmail = deOtraPersona || paraEquipo ? yo : null;
            const deseada = responsable ? (o.cuando ? o.cuando.semana : proyectoId ? null : lunesDeHoy(ahora)) : null;
            const semana = deseada && responsable ? (propuesta ? deseada : await semanaDestino(tx, responsable, deseada, true, ahora)) : null;

            if (propuesta) {
              const igual = await tx.tarea.findFirst({
                where: { estado: "propuesta", huella, clientId: para.clientId, pedidaPorEmail, ...(responsable ? { responsableEmail: responsable } : { responsableEmail: null, equipo }) },
                select: { id: true, numero: true, titulo: true, estado: true, responsableEmail: true, semana: true },
              });
              if (igual) {
                await evento(tx, { tareaId: igual.id, tipo: "mencionada", porEmail: yo, datos: { de: "chat", hiloId: a.hiloId } });
                if (o.ref) refTareas.set(o.ref, igual);
                anotar(igual);
                if (o.despuesDe?.length) await esperar(igual, o.despuesDe);
                break;
              }
            }
            const t = await tx.tarea.create({
              data: {
                ...comun,
                estado: propuesta ? "propuesta" : "pendiente",
                tipo: deOtroEquipo && (deOtraPersona || paraEquipo) ? "apoyo" : "puesto",
                privada: !!o.privada && responsable === yo,
                equipo,
                responsableEmail: responsable,
                semana: semana ? aDate(semana) : null,
                proyectoId: para.proyectoId,
                clientId: para.clientId,
                projectId: para.projectId,
                pedidaPorEmail,
                pedidaPorEquipo: deOtroEquipo ? ctx.equipo : null,
              },
              select: { id: true, numero: true, titulo: true, estado: true, responsableEmail: true, semana: true },
            });
            await evento(tx, { tareaId: t.id, tipo: propuesta ? "propuesta" : "creada", porEmail: yo, datos: { para: responsable, equipo, hiloId: a.hiloId } });
            if (o.ref) refTareas.set(o.ref, t);
            anotar(t);
            if (o.despuesDe?.length) await esperar(t, o.despuesDe);
            if (responsable) tocadas.add(responsable);
            // Una sugerencia o un pedido a un equipo no avisa (fase 1.3): ya es un pendiente en «Para ti».
            if (paraEquipo) {
              lideresDe(paraEquipo, ctx.miembros).forEach((l) => tocadas.add(l.email));
            } else if (!propuesta && deOtraPersona && responsable) {
              avisosDespues.push({ para: responsable, tipo: "tareas.asignada", titulo: `${ctx.nombre} te asignó «${o.titulo}»`, href: urlDeLaTarea(t.id), actorEmail: yo, dedupeKey: `tareas.asignada:${t.id}:${responsable}` });
            }
            break;
          }
          case "tarea.editar": {
            const t = await tareaPorRef(o.tarea);
            const acc = accionesPara(t, ctx, ahora);
            if (!acc.editar) throw new ErrorDeTareas(403, `No puedes editar ${etiquetaT(t.numero)}.`);
            let data: Prisma.TareaUncheckedUpdateInput;
            switch (o.campo) {
              case "titulo":
                data = { titulo: String(o.valor).trim(), huella: huellaDeTexto(String(o.valor)) };
                break;
              case "prioridad":
                data = { prioridad: leerPrioridad(String(o.valor)) };
                break;
              case "vence":
                data = { venceEl: o.valor ? aDate(String(o.valor)) : null };
                break;
              case "minutos":
                data = { minutosEstimados: o.valor === null ? null : Number(o.valor) };
                break;
              case "notas":
                data = { notas: o.valor === null ? null : String(o.valor).trim() || null };
                break;
              case "etiquetas":
                data = { etiquetas: (Array.isArray(o.valor) ? o.valor : []).slice(0, 5) };
                break;
              case "seccion":
                data = { seccion: o.valor === null ? null : String(o.valor).slice(0, 60) };
                break;
              case "cliente":
              case "proyecto": {
                const pedido =
                  o.campo === "cliente"
                    ? { clientId: o.valor === null ? null : String(o.valor), projectId: null, proyectoId: t.proyectoId }
                    : { clientId: t.clientId, projectId: t.projectId, proyectoId: o.valor === null ? null : String(o.valor) };
                const para = await resolverParaQuien(tx, pedido, clientes, ctx, t.proyectoId, t.clientId);
                await exigirClienteDeLaCita([t], para.clientId);
                if (!para.proyectoId && !t.equipo) throw new ErrorDeTareas(422, `${etiquetaT(t.numero)} no tiene sprint: asígnala a alguien antes de sacarla del proyecto.`);
                data = { clientId: para.clientId, projectId: para.projectId, proyectoId: para.proyectoId };
                break;
              }
            }
            await actualizar(tx, t, {}, data);
            await evento(tx, { tareaId: t.id, tipo: "editada", porEmail: yo, datos: { campos: Object.keys(data), hiloId: a.hiloId } });
            cambios++;
            break;
          }
          case "tarea.asignar": {
            const t = await tareaPorRef(o.tarea);
            const acc = accionesPara(t, ctx, ahora);
            const nuevo = o.para.tipo === "persona" ? o.para.email.toLowerCase() : yo;
            const equipo = equipoDe(nuevo, ctx.miembros);
            if (!equipo) throw new ErrorDeTareas(422, `${nombreDe(nuevo, ctx.miembros)} ya no está en el equipo.`);
            const esTomar = nuevo === yo && !t.responsableEmail;
            if (!(esTomar ? acc.tomar : acc.reasignar)) throw new ErrorDeTareas(403, `No puedes asignar ${etiquetaT(t.numero)}.`);
            const puede = !nacePropuesta(yo, nuevo, {
              equipoDelResponsable: equipo,
              creadorLideraEseEquipo: ctx.lidera.includes(equipo) || ctx.esSuperAdmin,
              ambosEnElEspacioLibre: await ambosEnElEspacioLibre(tx, t.proyectoId, yo, nuevo),
            });
            const directo = nuevo === yo || (puede && o.modo === "asignar");
            const semanaPedida = comoFecha(t.semana) ?? lunesDeHoy(ahora);
            if (!directo) {
              const igual = await tx.tarea.findFirst({ where: { estado: "propuesta", huella: t.huella, responsableEmail: nuevo, clientId: t.clientId, pedidaPorEmail: yo, NOT: { id: t.id } }, select: { id: true, numero: true } });
              if (igual) throw new ErrorDeTareas(422, `${nombreDe(nuevo, ctx.miembros)} ya tiene esa sugerencia tuya sin decidir (${etiquetaT(igual.numero)}).`);
            }
            const semana = directo ? await semanaDestino(tx, nuevo, semanaPedida, true, ahora) : semanaPedida;
            await actualizar(tx, t, {}, {
              responsableEmail: nuevo,
              equipo,
              estado: directo ? (leerEstado(t.estado) === "propuesta" ? "pendiente" : t.estado) : "propuesta",
              semana: aDate(semana),
              agendaEstado: "sin_agendar",
              ...(directo ? {} : { pedidaPorEmail: yo, pedidaPorEquipo: equipo !== ctx.equipo ? ctx.equipo : null, tipo: equipo !== ctx.equipo ? "apoyo" : "puesto" }),
            });
            await evento(tx, { tareaId: t.id, tipo: "asignada", porEmail: yo, datos: { desde: t.responsableEmail, hacia: nuevo, directo, hiloId: a.hiloId } });
            cambios++;
            tocadas.add(nuevo);
            if (nuevo !== yo && directo) {
              avisosDespues.push({ para: nuevo, tipo: "tareas.asignada", titulo: `${ctx.nombre} te asignó «${t.titulo}»`, href: urlDeLaTarea(t.id), actorEmail: yo, dedupeKey: `tareas.asignada:${t.id}:${nuevo}` });
            }
            break;
          }
          case "tarea.mover-semana": {
            const t = await tareaPorRef(o.tarea);
            if (!accionesPara(t, ctx, ahora).moverDeSemana) throw new ErrorDeTareas(403, `No puedes mover ${etiquetaT(t.numero)}.`);
            if (!t.responsableEmail) throw new ErrorDeTareas(422, `${etiquetaT(t.numero)} no tiene responsable: asígnala antes.`);
            const responsable = t.responsableEmail;
            const hacia = o.cuando.semana ? await semanaDestino(tx, responsable, o.cuando.semana, true, ahora) : null;
            const origen = comoFecha(t.semana);
            if (hacia === origen) break;
            await actualizar(tx, t, {}, { semana: hacia ? aDate(hacia) : null, agendaEstado: "sin_agendar" });
            await evento(tx, { tareaId: t.id, tipo: "semana", porEmail: yo, datos: { desde: origen, hacia, hiloId: a.hiloId } });
            if (origen && (hacia === null || origen < hacia)) {
              const revisadas = await semanasRevisadas(tx, responsable);
              if (!revisadas.has(origen) && origen < lunesDeHoy(ahora)) await anotarResultado(tx, t, origen, hacia ? "pasa" : "mas_adelante", yo, ahora);
            }
            cambios++;
            break;
          }
          case "tarea.depender": {
            const t = await tareaPorRef(o.tarea);
            if (!accionesPara(t, ctx, ahora).editar) throw new ErrorDeTareas(403, `No puedes cambiar ${etiquetaT(t.numero)}.`);
            await esperar(t, o.despuesDe);
            cambios++;
            break;
          }
          case "proyecto.editar": {
            const id = "id" in o.proyecto ? o.proyecto.id : refProyectos.get(o.proyecto.ref)?.id;
            if (!id) throw new ErrorDeTareas(422, "Un proyecto del acuerdo no se pudo crear.");
            const p = await tx.proyectoDeTareas.findUnique({
              where: { id },
              select: { id: true, version: true, estado: true, responsableEmail: true, creadoPorEmail: true, archivadoAt: true, espacio: { select: { tipo: true, equipo: true, miembros: { select: { email: true, rol: true } } } } },
            });
            if (!p || p.archivadoAt) throw new ErrorDeTareas(422, "Ese proyecto ya no está.");
            if (!administraElProyecto(ctx, p)) throw new ErrorDeTareas(403, "No administras ese proyecto.");
            if (o.campo === "estado" && p.estado === "propuesta") throw new ErrorDeTareas(422, "Ese proyecto es un borrador: actívalo desde su página, así se reparten sus tareas.");
            const data: Prisma.ProyectoDeTareasUpdateManyMutationInput =
              o.campo === "nombre"
                ? { nombre: String(o.valor).trim(), huella: normalizar(String(o.valor)) }
                : o.campo === "vence"
                  ? { venceEl: o.valor ? aDate(String(o.valor)) : null }
                  : o.campo === "responsable"
                    ? { responsableEmail: String(o.valor).toLowerCase() }
                    : o.campo === "secciones"
                      ? { secciones: (Array.isArray(o.valor) ? o.valor : []).slice(0, MAX_SECCIONES) }
                      : { estado: String(o.valor) };
            const r = await tx.proyectoDeTareas.updateMany({ where: { id, version: p.version }, data: { ...data, version: { increment: 1 } } });
            if (r.count === 0) throw new ErrorDeTareas(409, "Otra persona cambió ese proyecto: vuelve a aplicar.");
            await evento(tx, { proyectoId: id, tipo: "editada", porEmail: yo, datos: { campos: [o.campo], hiloId: a.hiloId } });
            cambios++;
            break;
          }
        }
      }

      const parcial = { tareas, proyectos, cambios };
      const desenlace = textoDelDesenlaceDeTareas({ ok: true, detalle: detalleDelAcuerdo(parcial, yo, ctx.miembros), notas: a.notas });
      await agregarTurnoEnTx(tx, a.hiloId, { rol: "ASISTENTE", contenido: `${marcaDeDesenlace({ ok: true })}\n\n${desenlace}`, shaDeContexto: null });
      return { yaEstaba: false, ...parcial, desenlace };
    },
    { timeout: 30_000, maxWait: 10_000 },
    )
    .catch((e: unknown) => {
      // Un título o un cliente cambiado que choca con una sugerencia (o un borrador) igual sin decidir.
      if (esUnicoDuplicado(e)) throw new ErrorDeTareas(409, "Ya hay una sugerencia o un borrador igual sin decidir: decide ese primero y vuelve a aplicar.");
      throw e;
    });
  if (!resultado.yaEstaba) {
    for (const aviso of avisosDespues) await avisar(aviso);
    for (const email of tocadas) olvidarMedicion(email);
  }
  return resultado;
}

/* ── Las tareas de HubSpot (2026-10-15, etapa 3 de docs/mi-dia-plan.md) ────────────────────────────────────────────
   Lo escribe la copia de lib/tareas-hubspot (job `tareas-hubspot`): las tareas de HubSpot del equipo entran como
   `origen = "hubspot"` y lo que cambia allá se aplica acá. Este archivo nunca llama a HubSpot: lo que cambia en Nexus lo
   escribe allá lib/tareas-hubspot, y acá solo se anota (`anotarSincronizacionConHubspot`). */

/** Quien firma lo que llega de HubSpot en la historia de una tarea. */
export const HUBSPOT = "hubspot";

export interface TareaDesdeHubspot {
  hubspotTaskId: string;
  titulo: string;
  /** Las notas de la tarea en HubSpot, como texto. No se editan en Nexus (lo de la persona va en notas). */
  contexto: string | null;
  estado: "pendiente" | "en_curso" | "hecha";
  completadaAt: Date | null;
  venceEl: string | null;
  prioridad: Prioridad;
  responsableEmail: string;
  equipo: string;
  clientId: string | null;
  projectId: string | null;
  datos: Prisma.InputJsonValue;
  acordado: Prisma.InputJsonValue;
}

/** La semana de una tarea abierta de HubSpot: la de su vencimiento (lo vencido, la de hoy); sin vencimiento, ninguna. */
async function semanaDeHubspot(db: Db, responsable: string, venceEl: string | null, ahora: Date): Promise<string | null> {
  if (!venceEl) return null;
  return semanaDestino(db, responsable, lunesDeFecha(venceEl), true, ahora);
}

/** Crea la tarea de una tarea de HubSpot que todavía no está. null = ya estaba (otra corrida llegó primero). */
export async function crearTareaDeHubspot(n: TareaDesdeHubspot, ahora = new Date()): Promise<{ id: string } | null> {
  const hecha = n.estado === "hecha";
  const semana = hecha
    ? n.completadaAt
      ? lunesDeFecha(hoyEnCostaRica(n.completadaAt))
      : null
    : await semanaDeHubspot(prisma, n.responsableEmail, n.venceEl, ahora);
  const titulo = n.titulo.trim().slice(0, 300);
  try {
    return await prisma.$transaction(async (tx) => {
      const t = await tx.tarea.create({
        data: {
          titulo,
          huella: huellaDeTexto(titulo),
          contexto: n.contexto,
          estado: n.estado,
          completadaAt: hecha ? (n.completadaAt ?? ahora) : null,
          prioridad: n.prioridad,
          tipo: "puesto",
          equipo: n.equipo,
          responsableEmail: n.responsableEmail,
          semana: semana ? aDate(semana) : null,
          venceEl: n.venceEl ? aDate(n.venceEl) : null,
          clientId: n.clientId,
          projectId: n.projectId,
          origen: "hubspot",
          origenId: `h:${n.hubspotTaskId}`,
          pedidaPorTexto: "HubSpot",
          hubspotTaskId: n.hubspotTaskId,
          hubspotAcordado: n.acordado,
          hubspotDatos: n.datos,
          hubspotSincronizadaAt: ahora,
        },
        select: { id: true },
      });
      await evento(tx, { tareaId: t.id, tipo: "creada", porEmail: HUBSPOT, datos: { desde: "hubspot" } });
      return t;
    }, OPCIONES_DE_TX);
  } catch (e) {
    if (esUnicoDuplicado(e)) return null;
    throw e;
  }
}

/** Un siguiente paso que alguien escribió en HubSpot (`siguiente_paso_<equipo>`), fase 0.2. */
export interface PasoDesdeHubspot {
  titulo: string;
  venceEl: string | null;
  /** El dueño de HubSpot, si es del sprint del equipo. Sin él, va a «Por asignar» del sprint. */
  responsableEmail: string | null;
  /** El sprint del equipo del paso (cs, desarrollo, ventas). */
  equipo: string;
  nombreDelEquipo: string;
  clientId: string | null;
  projectId: string | null;
  hubspotDealId: string | null;
}

/**
 * Lo que alguien escribió en HubSpot como siguiente paso entra como TAREA del sprint de ese equipo: el siguiente paso
 * es una tarea (DECISIONS «Nexus, el sistema de trabajo de cada cuenta»). Pendiente, no propuesta: ya lo decidió quien
 * lo escribió allá. La semana es la de su fecha (lo vencido, esta).
 */
export async function crearTareaDePasoDeHubspot(n: PasoDesdeHubspot, ahora = new Date()): Promise<{ id: string }> {
  const titulo = n.titulo.trim().slice(0, 300);
  const semana = n.responsableEmail
    ? await semanaDestino(prisma, n.responsableEmail, n.venceEl ? lunesDeFecha(n.venceEl) : lunesDeHoy(ahora), true, ahora)
    : null;
  return prisma.$transaction(async (tx) => {
    const t = await tx.tarea.create({
      data: {
        titulo,
        huella: huellaDeTexto(titulo),
        contexto: `Lo escribieron en HubSpot como el siguiente paso de ${n.nombreDelEquipo}.`,
        estado: "pendiente",
        prioridad: "media",
        tipo: "puesto",
        equipo: n.equipo,
        responsableEmail: n.responsableEmail,
        semana: semana ? aDate(semana) : null,
        venceEl: n.venceEl ? aDate(n.venceEl) : null,
        clientId: n.clientId,
        projectId: n.projectId,
        hubspotDealId: n.hubspotDealId,
        origen: "paso",
        pedidaPorTexto: "HubSpot",
      },
      select: { id: true },
    });
    await evento(tx, { tareaId: t.id, tipo: "creada", porEmail: HUBSPOT, datos: { desde: "siguiente_paso_hubspot" } });
    return t;
  }, OPCIONES_DE_TX);
}

export interface CambiosDesdeHubspot {
  titulo?: string;
  estado?: "pendiente" | "en_curso" | "hecha" | "no_se_hara";
  /** Por qué «Ya no se hará» (se borró en HubSpot, pasó a alguien de afuera). */
  motivo?: string;
  completadaAt?: Date | null;
  venceEl?: string | null;
  prioridad?: Prioridad;
  /** Con su sprint de casa. */
  responsable?: { email: string; equipo: string };
  contexto?: string | null;
  clientId?: string | null;
  projectId?: string | null;
}

/**
 * Aplica lo que cambió en HubSpot. Con control de versión: si una persona la cambió mientras se leía HubSpot, no toca
 * nada y la corrida siguiente vuelve a comparar con lo nuevo. Mueve la semana con el vencimiento (o el responsable), y
 * anota el resultado de la semana como lo haría la persona al terminarla.
 */
export async function aplicarDesdeHubspot(
  id: string,
  version: number,
  c: CambiosDesdeHubspot,
  extra: { datos: Prisma.InputJsonValue; acordado: Prisma.InputJsonValue; conflictos: ReadonlyArray<{ campo: string; gano: string }>; error?: string | null },
  ahora = new Date(),
): Promise<"aplicado" | "cambio-en-nexus"> {
  const t = await prisma.tarea.findUnique({ where: { id }, select: SELECT_PARA_ESCRIBIR });
  if (!t || t.version !== version || t.archivadaAt) return "cambio-en-nexus";
  const desde = leerEstado(t.estado);
  const hacia = c.estado ?? desde;
  const responsable = c.responsable?.email ?? t.responsableEmail;
  const semanaActual = comoFecha(t.semana);
  const abierta = estaAbierta(hacia);

  try {
    await prisma.$transaction(async (tx) => {
      const data: Prisma.TareaUncheckedUpdateInput = {
        hubspotDatos: extra.datos,
        hubspotAcordado: extra.acordado,
        hubspotSincronizadaAt: ahora,
        hubspotError: extra.error ?? null,
      };
      if (c.titulo !== undefined) {
        data.titulo = c.titulo.slice(0, 300);
        data.huella = huellaDeTexto(c.titulo);
      }
      if (c.prioridad !== undefined) data.prioridad = c.prioridad;
      if (c.contexto !== undefined) data.contexto = c.contexto;
      if (c.venceEl !== undefined) data.venceEl = c.venceEl ? aDate(c.venceEl) : null;
      if (c.clientId !== undefined) data.clientId = c.clientId;
      if (c.projectId !== undefined) data.projectId = c.projectId;
      if (c.responsable) {
        data.responsableEmail = c.responsable.email;
        data.equipo = c.responsable.equipo;
      }
      if (hacia !== desde) {
        data.estado = hacia;
        data.completadaAt = hacia === "hecha" ? (c.completadaAt ?? ahora) : null;
        if (hacia === "no_se_hara") data.motivo = c.motivo ?? "Cambió en HubSpot.";
        else if (desde === "no_se_hara") data.motivo = null;
      }

      // La semana de lo abierto sigue al vencimiento: si cambió, si cambió el responsable o si se reabrió.
      let semana = semanaActual;
      const reabierta = hacia !== desde && !estaAbierta(desde) && abierta;
      if (abierta && responsable && (c.venceEl !== undefined || c.responsable || reabierta)) {
        const vence = c.venceEl !== undefined ? c.venceEl : comoFecha(t.venceEl);
        const deseada = vence ? lunesDeFecha(vence) : semanaActual;
        semana = deseada ? await semanaDestino(tx, responsable, deseada, true, ahora) : null;
        if (semana !== semanaActual) {
          data.semana = semana ? aDate(semana) : null;
          data.agendaEstado = "sin_agendar";
        }
      }

      const r = await tx.tarea.updateMany({ where: { id, version }, data: { ...data, version: { increment: 1 } } });
      if (r.count === 0) throw new ErrorDeTareas(409, "cambio-en-nexus");

      // El resultado de la semana, como al terminarla o reabrirla a mano.
      if (hacia !== desde && semanaActual && t.responsableEmail) {
        if (hacia === "hecha" || hacia === "no_se_hara") {
          try {
            await anotarResultado(tx, { ...t, responsableEmail: responsable }, semanaActual, hacia, HUBSPOT, ahora);
          } catch (e) {
            // La persona ya revisó esa semana: lo que cerró ella no se corrige desde HubSpot.
            if (!(e instanceof ErrorDeTareas)) throw e;
          }
        } else if (reabierta && semana === semanaActual) {
          await quitarResultado(tx, t.id, semanaActual);
        }
      }

      const campos = Object.keys(c).filter((k) => k !== "completadaAt" && k !== "motivo" && k !== "contexto" && k !== "clientId" && k !== "projectId");
      if (campos.length || extra.conflictos.length) {
        await evento(tx, {
          tareaId: t.id,
          tipo: "hubspot",
          porEmail: HUBSPOT,
          datos: { campos, conflictos: extra.conflictos.map((x) => ({ ...x })), ...(hacia !== desde ? { desde, hacia } : {}) },
        });
      }
      if (semana !== semanaActual) await evento(tx, { tareaId: t.id, tipo: "semana", porEmail: HUBSPOT, datos: { desde: semanaActual, hacia: semana } });
    }, OPCIONES_DE_TX);
  } catch (e) {
    if (e instanceof ErrorDeTareas && e.message === "cambio-en-nexus") return "cambio-en-nexus";
    throw e;
  }
  if (t.responsableEmail) olvidarMedicion(t.responsableEmail);
  if (responsable && responsable !== t.responsableEmail) olvidarMedicion(responsable);
  return "aplicado";
}

/**
 * Lo que se anota después de mirar HubSpot sin cambiar nada de lo que ve la persona: lo acordado, lo de HubSpot que se
 * muestra, y si se pudo escribir allá. No sube la versión: no es un cambio de la tarea (una persona que la está
 * editando no tiene por qué chocar).
 */
export async function anotarSincronizacionConHubspot(
  id: string,
  d: {
    acordado?: Prisma.InputJsonValue;
    datos?: Prisma.InputJsonValue;
    error: string | null;
    /** Lo que se escribió en HubSpot (los campos), para la historia de la tarea. */
    escritos?: readonly string[];
    conflictos?: ReadonlyArray<{ campo: string; gano: string }>;
  },
  ahora = new Date(),
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.tarea.updateMany({
      where: { id },
      data: {
        ...(d.acordado !== undefined ? { hubspotAcordado: d.acordado } : {}),
        ...(d.datos !== undefined ? { hubspotDatos: d.datos } : {}),
        hubspotError: d.error,
        hubspotSincronizadaAt: ahora,
      },
    });
    if (d.escritos?.length) {
      await evento(tx, { tareaId: id, tipo: "a_hubspot", porEmail: "agente", datos: { campos: [...d.escritos], conflictos: (d.conflictos ?? []).map((x) => ({ ...x })) } });
    }
  }, OPCIONES_DE_TX);
}

/* ── El seguimiento comercial que nace en Nexus y se crea en HubSpot (2026-10-27, roadmap D4) ──────────────────────
   lib/tareas-hubspot lo crea allá; acá se reserva la tarea antes de llamar (una sola creación por tarea, aunque la ruta
   y el job lleguen a la vez) y se anota el id que devolvió HubSpot. */

/**
 * Reserva la tarea para crearla en HubSpot: solo si todavía no tiene su tarea allá y nadie la reservó en los últimos
 * `minutos` (una corrida que se cayó a mitad se retoma). Usa `hubspotSincronizadaAt` como la marca del intento: en una
 * tarea sin `hubspotTaskId` no significa otra cosa. true = la tomaste tú.
 */
export async function reservarCreacionEnHubspot(id: string, minutos: number, ahora = new Date()): Promise<{ tomada: boolean; intentoAnterior: Date | null }> {
  const t = await prisma.tarea.findUnique({ where: { id }, select: { updatedAt: true, hubspotSincronizadaAt: true } });
  if (!t) return { tomada: false, intentoAnterior: null };
  const r = await prisma.tarea.updateMany({
    where: { id, hubspotTaskId: null, archivadaAt: null, OR: [{ hubspotSincronizadaAt: null }, { hubspotSincronizadaAt: { lt: new Date(+ahora - minutos * 60_000) } }] },
    // `updatedAt` queda como estaba: un intento no es un cambio de la tarea (el job mira lo que cambió hace poco).
    data: { hubspotSincronizadaAt: ahora, updatedAt: t.updatedAt },
  });
  return { tomada: r.count === 1, intentoAnterior: t.hubspotSincronizadaAt };
}

/**
 * Anota la tarea que se creó en HubSpot: su id, lo acordado (lo que se escribió allá) y lo que se muestra. No sube la
 * versión (la persona que la tiene abierta no choca), y deja su evento firmado como `agente` (no es un toque de una
 * persona). false = otra corrida la anotó primero.
 */
export async function anotarCreadaEnHubspot(
  id: string,
  d: { hubspotTaskId: string; acordado: Prisma.InputJsonValue; datos: Prisma.InputJsonValue },
  ahora = new Date(),
): Promise<boolean> {
  try {
    return await prisma.$transaction(async (tx) => {
      const antes = await tx.tarea.findUnique({ where: { id }, select: { updatedAt: true } });
      const r = await tx.tarea.updateMany({
        where: { id, hubspotTaskId: null },
        data: { hubspotTaskId: d.hubspotTaskId, hubspotAcordado: d.acordado, hubspotDatos: d.datos, hubspotError: null, hubspotSincronizadaAt: ahora, ...(antes ? { updatedAt: antes.updatedAt } : {}) },
      });
      if (!r.count) return false;
      await evento(tx, { tareaId: id, tipo: "a_hubspot", porEmail: "agente", datos: { creada: d.hubspotTaskId } });
      return true;
    }, OPCIONES_DE_TX);
  } catch (e) {
    if (esUnicoDuplicado(e)) return false;
    throw e;
  }
}

/** Por qué no se pudo crear en HubSpot (o null, ya no falta nada). No sube la versión ni toca la reserva. */
export async function anotarErrorDeCreacionEnHubspot(id: string, error: string | null): Promise<void> {
  const t = await prisma.tarea.findUnique({ where: { id }, select: { updatedAt: true } });
  if (!t) return;
  // Sin tocar `updatedAt`: si cada intento fallido lo moviera, la ventana de 7 días del job no la soltaría nunca.
  await prisma.tarea.updateMany({ where: { id, hubspotTaskId: null }, data: { hubspotError: error ? error.slice(0, 400) : null, updatedAt: t.updatedAt } });
}

export { etiquetaT, claveDeEquipo };

/* ── El sprint de cada equipo: las series que se leen solas (ficha A, 2026-10-17) ─────────────── */
// Las valida lib/tareas/fuentes-server.ts (quién lidera, qué reunión, quiénes están); acá solo se escriben.

export interface FilaNuevaDeFuente {
  equipo: string;
  duenoEmail: string;
  serie: string;
  titulo: string;
  rol: string;
  diaSemana: number;
  finHora: string;
  personas: string[];
}

/**
 * La fuente PERSONAL de una persona del piloto (roadmap H1, lib/tareas/lectura-personal.ts): «todas mis reuniones
 * internas», sin equipo. La crea la primera vez (idempotente: la busca por dueña y serie). Si alguien la pausó, la
 * devuelve pausada: prender la bandera no la vuelve a prender.
 */
export async function asegurarFuentePersonal(email: string, serie: string, titulo: string): Promise<{ id: string; activa: boolean; createdAt: Date }> {
  const duenoEmail = email.trim().toLowerCase();
  const ya = await prisma.fuenteDeTareas.findFirst({ where: { equipo: null, duenoEmail, serie }, select: { id: true, activa: true, createdAt: true }, orderBy: { createdAt: "asc" } });
  if (ya) return ya;
  return prisma.fuenteDeTareas.create({
    data: { equipo: null, duenoEmail, serie, titulo, rol: "planning", personas: [duenoEmail], activa: true },
    select: { id: true, activa: true, createdAt: true },
  });
}

export async function escribirFuente(n: FilaNuevaDeFuente): Promise<{ id: string }> {
  try {
    return await prisma.fuenteDeTareas.create({ data: n, select: { id: true } });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") throw new ErrorDeTareas(409, "Tu sprint ya lee esa reunión.");
    throw e;
  }
}

export async function cambiarFilaDeFuente(id: string, c: { activa?: boolean; pausadaMotivo?: string | null; rol?: string; personas?: string[] }): Promise<void> {
  try {
    await prisma.fuenteDeTareas.update({ where: { id }, data: c });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") throw new ErrorDeTareas(409, "Tu sprint ya lee esa reunión en otra fila activa.");
    throw e;
  }
}

/** Lo que ya se leyó queda: las lecturas pierden la referencia (SET NULL), no las tareas. */
export async function borrarFuente(id: string): Promise<void> {
  await prisma.fuenteDeTareas.delete({ where: { id } });
}

/* ── La semana (fase 2 de docs/nexus-sistema-de-trabajo-plan.md, 2026-10-17) ─────── */

const CORREO_DE_INVITADO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
/** Cuántos invitados guarda una reunión planeada. */
const MAX_INVITADOS_DE_LA_REUNION = 20;
/** Hasta cuándo se puede planear una reunión (más allá, no es la semana de nadie). */
const DIAS_PARA_PLANEAR_UNA_REUNION = 120;

export interface ReunionPlaneadaNueva {
  clientId: string;
  titulo: string;
  /** ISO: cuándo es. */
  inicio: string;
  invitados?: readonly string[];
  /** Para qué es la reunión (va a las notas). */
  objetivo?: string | null;
  /** La reunión de la que es la próxima (la página de una reunión): agendarla otra vez mueve la misma tarea. */
  deLaReunion?: string | null;
  /** El evento del calendario que la persona eligió con «Ya la agendé» (lib/tareas/reunion-elegida.ts). */
  eventoId?: string | null;
}

/**
 * La reunión planeada (`clase = "reunion"`, fase 0.2) que deja «Agendar»: la persona guardó el evento en Google Calendar
 * (Nexus no lo escribe) y dice «Ya lo guardé»; acá queda la tarea suya, con la cuenta, la hora y los invitados, en la
 * semana de esa reunión. Con eso la cuenta cuenta como con reunión (lib/mi-dia/servicio.ts) aunque su calendario no se
 * pueda leer, y la reunión aparece en sus tareas.
 *
 * Repetir no duplica: la clave es la próxima de esa reunión (`proxima:<reunión>`) o la cuenta con la hora
 * (`agenda:<cuenta>:<inicio>`). Agendar otra vez la próxima de la misma reunión, con otra hora, mueve la tarea si sigue
 * abierta.
 */
export async function planearReunion(
  ctx: ContextoDeTareas,
  clientes: ClientesQueVes,
  n: ReunionPlaneadaNueva,
  ahora = new Date(),
): Promise<{ id: string; numero: number; yaExistia: boolean }> {
  const titulo = n.titulo.trim().slice(0, 200);
  if (!titulo) throw new ErrorDeTareas(400, "La reunión necesita un título.");
  if (!clientes.todos && !clientes.ids.has(n.clientId)) throw new ErrorDeTareas(404, "No puedes elegir esa empresa.");
  const inicio = new Date(n.inicio);
  if (Number.isNaN(inicio.getTime())) throw new ErrorDeTareas(400, "La hora de la reunión no es válida.");
  if (inicio.getTime() < ahora.getTime() - 86_400_000) throw new ErrorDeTareas(400, "Esa reunión ya pasó.");
  if (inicio.getTime() > ahora.getTime() + DIAS_PARA_PLANEAR_UNA_REUNION * 86_400_000) throw new ErrorDeTareas(400, "Esa reunión está demasiado lejos para planearla.");
  const yo = ctx.email;
  const equipo = equipoDe(yo, ctx.miembros);
  if (!equipo) throw new ErrorDeTareas(400, "Tu cuenta no está en el equipo.");
  const invitados = [...new Set((n.invitados ?? []).map((x) => x.trim().toLowerCase()).filter((x) => CORREO_DE_INVITADO.test(x)))].slice(0, MAX_INVITADOS_DE_LA_REUNION);
  const semana = await semanaDestino(prisma, yo, lunesDeFecha(hoyEnCostaRica(inicio)), true, ahora);
  const origenId = n.eventoId
    ? origenDeLaElegida(n.clientId, n.eventoId)
    : n.deLaReunion
      ? `proxima:${n.deLaReunion}`
      : `agenda:${n.clientId}:${inicio.toISOString().slice(0, 16)}`;
  const notas = n.objetivo?.trim() ? `Objetivo: ${n.objetivo.trim()}`.slice(0, 2_000) : null;

  const existe = await prisma.tarea.findUnique({ where: { origenId }, select: { id: true, numero: true, version: true, estado: true, reunionInicio: true, responsableEmail: true } });
  if (existe) {
    const abierta = existe.estado === "pendiente" || existe.estado === "en_curso";
    if (abierta && existe.responsableEmail === yo && existe.reunionInicio?.getTime() !== inicio.getTime()) {
      await prisma.$transaction(async (tx) => {
        await actualizar(tx, existe, {}, { reunionInicio: inicio, semana: aDate(semana), titulo, huella: huellaDeTexto(titulo), invitados });
        await evento(tx, { tareaId: existe.id, tipo: "editada", porEmail: yo, datos: { reunion: { desde: existe.reunionInicio?.toISOString() ?? null, hacia: inicio.toISOString() } } });
      }, OPCIONES_DE_TX);
      olvidarMedicion(yo);
    }
    return { id: existe.id, numero: existe.numero, yaExistia: true };
  }

  try {
    const creada = await prisma.$transaction(async (tx) => {
      const t = await tx.tarea.create({
        data: {
          titulo,
          huella: huellaDeTexto(titulo),
          notas,
          estado: "pendiente",
          prioridad: "media",
          tipo: "puesto",
          equipo,
          responsableEmail: yo,
          semana: aDate(semana),
          clientId: n.clientId,
          lado: "smarteam",
          clase: "reunion",
          invitados,
          reunionInicio: inicio,
          origen: "mano",
          origenId,
          creadaPorEmail: yo,
        },
        select: { id: true, numero: true },
      });
      await evento(tx, { tareaId: t.id, tipo: "creada", porEmail: yo, datos: { reunion: inicio.toISOString(), equipo } });
      return t;
    }, OPCIONES_DE_TX);
    olvidarMedicion(yo);
    return { ...creada, yaExistia: false };
  } catch (e) {
    if (!esUnicoDuplicado(e)) throw e;
    const misma = await prisma.tarea.findUnique({ where: { origenId }, select: { id: true, numero: true } });
    if (!misma) throw e;
    return { ...misma, yaExistia: true };
  }
}

/** El motivo con que quedan las propuestas de una reunión cuyo texto cambió. */
export const MOTIVO_TEXTO_CAMBIO = "El texto de la reunión cambió: se vuelve a leer con el nuevo y lo que siga valiendo se vuelve a proponer.";

/**
 * Las propuestas que dejó la lectura de una reunión (`origenId` «l:…») y nadie decidió, cuando el texto de la reunión
 * cambió y se vuelve a leer (lib/sessions/reanalizar.ts). Quedan vencidas, firmadas por el sistema y con su motivo; no
 * son lápidas. Su clave se libera (se le suma «:retirada:<hora>») para que la lectura nueva pueda volver a proponer la
 * misma línea si sigue en el texto nuevo. Lo que una persona ya decidió no se toca. Devuelve cuántas quedaron vencidas.
 */
export async function retirarPropuestasDeLaReunion(sessionId: string, motivo = MOTIVO_TEXTO_CAMBIO, ahora = new Date()): Promise<number> {
  const responsables = new Set<string>();
  const n = await prisma.$transaction(async (tx) => {
    const filas = await tx.tarea.findMany({
      where: { sessionId, estado: "propuesta", decididaAt: null, archivadaAt: null, origenId: { startsWith: "l:" } },
      select: { id: true, version: true, origenId: true, responsableEmail: true },
    });
    let vencidas = 0;
    for (const t of filas) {
      const r = await tx.tarea.updateMany({
        where: { id: t.id, version: t.version, estado: "propuesta", decididaAt: null },
        data: {
          estado: "vencida",
          decision: "vencida",
          decididaPorEmail: SISTEMA,
          decididaAt: ahora,
          motivo,
          origenId: `${t.origenId}:retirada:${ahora.getTime()}`,
          version: { increment: 1 },
        },
      });
      if (!r.count) continue;
      vencidas++;
      if (t.responsableEmail) responsables.add(t.responsableEmail);
      await evento(tx, { tareaId: t.id, tipo: "decidida", porEmail: SISTEMA, datos: { decision: "vencida", porTextoNuevo: true } });
    }
    return vencidas;
  }, OPCIONES_DE_TX);
  for (const email of responsables) olvidarMedicion(email);
  return n;
}

/* ── Un seguimiento por reunión y cuenta (2026-10-19) ─────────────────────────────────────────────────────────── */

export interface GrupoDeSeguimientos {
  /** Las propuestas sueltas de lo que prometió el cliente, de la misma reunión (o correo), cuenta y destino. */
  tareaIds: readonly string[];
  /** El `origenId` de la que las junta: `l:<lectura>:seg-c-g-…` o `cor:<correo>:seg-c-g-…`. */
  origenId: string;
  titulo: string;
  contexto: string;
  cita: string;
  venceEl: string | null;
}

export const MOTIVO_SEGUIMIENTO_AGRUPADO = "Se juntó en un solo seguimiento de la reunión: lo que prometió el cliente va en una tarea.";

/**
 * Junta en UNA propuesta las propuestas sueltas de seguimiento de una reunión (scripts/agrupar-seguimientos-propuestos.ts).
 * La nueva copia del primer grupo el responsable, el equipo, la semana más temprana, el cliente, el proyecto, la reunión
 * y la lectura; las sueltas quedan `fusionada` en ella, firmadas por el sistema. Si alguna ya la decidió una persona, o
 * la que las junta ya existe, no hace nada (devuelve null): lo decidido no se toca.
 */
export async function agruparSeguimientosPropuestos(g: GrupoDeSeguimientos, ahora = new Date()): Promise<{ id: string } | null> {
  if (g.tareaIds.length < 2) return null;
  const r = await prisma.$transaction(async (tx) => {
    const filas = await tx.tarea.findMany({
      where: { id: { in: [...g.tareaIds] }, estado: "propuesta", decididaAt: null, archivadaAt: null },
      orderBy: { numero: "asc" },
    });
    if (filas.length !== g.tareaIds.length) return null;
    const base = filas[0]!;
    const igual = (f: (typeof filas)[number]) =>
      f.clientId === base.clientId && f.responsableEmail === base.responsableEmail && f.equipo === base.equipo && f.sessionId === base.sessionId && f.lecturaId === base.lecturaId;
    if (!filas.every(igual)) return null;
    if (await tx.tarea.findUnique({ where: { origenId: g.origenId }, select: { id: true } })) return null;
    const semanas = filas.flatMap((f) => (f.semana ? [f.semana] : [])).sort((a, b) => +a - +b);
    const nueva = await tx.tarea.create({
      data: {
        titulo: g.titulo,
        huella: huellaDeTexto(g.titulo),
        notas: null,
        contexto: g.contexto,
        estado: "propuesta",
        prioridad: base.prioridad,
        equipo: base.equipo,
        responsableEmail: base.responsableEmail,
        semana: semanas[0] ?? null,
        venceEl: g.venceEl ? aDate(g.venceEl) : null,
        clientId: base.clientId,
        projectId: base.projectId,
        lado: "cliente",
        origen: base.origen,
        creadaPorEmail: null,
        pedidaPorEmail: base.pedidaPorEmail,
        pedidaPorEquipo: base.pedidaPorEquipo,
        pedidaPorTexto: base.pedidaPorTexto,
        tipo: base.tipo,
        lecturaId: base.lecturaId,
        sessionId: base.sessionId,
        origenTitulo: base.origenTitulo,
        cita: g.cita,
        origenId: g.origenId,
      },
      select: { id: true },
    });
    await evento(tx, { tareaId: nueva.id, tipo: "propuesta", porEmail: SISTEMA, datos: { lado: "cliente", seguimiento: true, agrupa: filas.length, desde: filas.map((f) => f.id) } });
    for (const f of filas) {
      const u = await tx.tarea.updateMany({
        where: { id: f.id, version: f.version, estado: "propuesta", decididaAt: null },
        data: { estado: "fusionada", decision: "misma", decididaPorEmail: SISTEMA, decididaAt: ahora, mismaQueId: nueva.id, motivo: MOTIVO_SEGUIMIENTO_AGRUPADO, version: { increment: 1 } },
      });
      // Una que cambió en el medio: se deshace todo, lo decidido no se toca.
      if (!u.count) throw new ErrorDeTareas(409, "Una de las propuestas cambió mientras se juntaban.");
      await evento(tx, { tareaId: f.id, tipo: "decidida", porEmail: SISTEMA, datos: { decision: "misma", agrupadaEn: nueva.id } });
    }
    return { id: nueva.id, responsable: base.responsableEmail };
  }, OPCIONES_DE_TX);
  if (r?.responsable) olvidarMedicion(r.responsable);
  return r ? { id: r.id } : null;
}

/* ── Lo que prometió el cliente, en «Por asignar» (2026-10-19, «Menos tareas a la vista») ─────────────────────── */

export const MOTIVO_POR_ASIGNAR_AGRUPADO = "Se juntó en un solo seguimiento de la reunión mientras esperaba en «Por asignar».";

/**
 * Lo mismo que `agruparSeguimientosPropuestos`, para los seguimientos que ya entraron a «Por asignar» de un equipo
 * (abiertos, sin responsable ni semana): la que los junta nace también en «Por asignar» y las sueltas quedan
 * `fusionada` en ella, firmadas por el sistema. Más frenos que con las propuestas, porque una abierta se puede haber
 * trabajado: si alguna tiene un evento de una persona, un comentario, una dependencia o un vínculo, no hace nada.
 */
export async function agruparSeguimientosPorAsignar(g: GrupoDeSeguimientos, ahora = new Date()): Promise<{ id: string } | null> {
  if (g.tareaIds.length < 2) return null;
  return prisma.$transaction(async (tx) => {
    const ids = [...g.tareaIds];
    const filas = await tx.tarea.findMany({
      where: { id: { in: ids }, estado: "pendiente", responsableEmail: null, semana: null, archivadaAt: null },
      orderBy: { numero: "asc" },
    });
    if (filas.length !== ids.length) return null;
    const base = filas[0]!;
    const igual = (f: (typeof filas)[number]) => f.clientId === base.clientId && f.equipo === base.equipo && f.sessionId === base.sessionId && f.lecturaId === base.lecturaId;
    if (!filas.every(igual)) return null;
    const [toques, comentarios, relaciones, vinculos] = await Promise.all([
      tx.tareaEvento.count({ where: { tareaId: { in: ids }, porEmail: { notIn: NO_SON_PERSONAS } } }),
      tx.tareaComentario.count({ where: { tareaId: { in: ids } } }),
      tx.tareaRelacion.count({ where: { OR: [{ desdeId: { in: ids } }, { haciaId: { in: ids } }] } }),
      tx.tareaVinculo.count({ where: { tareaId: { in: ids } } }),
    ]);
    if (toques + comentarios + relaciones + vinculos > 0) return null;
    if (await tx.tarea.findUnique({ where: { origenId: g.origenId }, select: { id: true } })) return null;
    const nueva = await tx.tarea.create({
      data: {
        titulo: g.titulo,
        huella: huellaDeTexto(g.titulo),
        notas: null,
        contexto: g.contexto,
        estado: "pendiente",
        prioridad: base.prioridad,
        equipo: base.equipo,
        responsableEmail: null,
        semana: null,
        venceEl: g.venceEl ? aDate(g.venceEl) : null,
        clientId: base.clientId,
        projectId: base.projectId,
        lado: "cliente",
        origen: base.origen,
        creadaPorEmail: null,
        pedidaPorEmail: base.pedidaPorEmail,
        pedidaPorEquipo: base.pedidaPorEquipo,
        pedidaPorTexto: base.pedidaPorTexto,
        tipo: base.tipo,
        lecturaId: base.lecturaId,
        sessionId: base.sessionId,
        origenTitulo: base.origenTitulo,
        cita: g.cita,
        origenId: g.origenId,
      },
      select: { id: true },
    });
    await evento(tx, { tareaId: nueva.id, tipo: "creada", porEmail: SISTEMA, datos: { lado: "cliente", seguimiento: true, agrupa: filas.length, desde: filas.map((f) => f.id) } });
    for (const f of filas) {
      const u = await tx.tarea.updateMany({
        where: { id: f.id, version: f.version, estado: "pendiente", responsableEmail: null },
        data: { estado: "fusionada", decision: "misma", decididaPorEmail: SISTEMA, decididaAt: ahora, mismaQueId: nueva.id, motivo: MOTIVO_POR_ASIGNAR_AGRUPADO, version: { increment: 1 } },
      });
      if (!u.count) throw new ErrorDeTareas(409, "Una de las tareas cambió mientras se juntaban.");
      await evento(tx, { tareaId: f.id, tipo: "estado", porEmail: SISTEMA, datos: { desde: "pendiente", hacia: "fusionada", agrupadaEn: nueva.id } });
    }
    return { id: nueva.id };
  }, OPCIONES_DE_TX);
}
