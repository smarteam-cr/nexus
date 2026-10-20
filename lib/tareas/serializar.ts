/**
 * lib/tareas/serializar.ts — el ÚNICO serializador de Tareas internas (docs/tareas-plan.md §3). SERVIDOR.
 *
 * Todo lo que llega al navegador sale de acá, con lo que quien mira puede ver:
 *   - LA CITA y el título de una reunión: en una reunión de puertas adentro la ven quien estuvo, el responsable, quien
 *     creó la tarea y el líder de su sprint. En una reunión de cliente, solo quien estuvo y ve ese cliente, leído AL
 *     MOMENTO (una corrección del dueño de la reunión vale para lo viejo). Si no: «Salió de una reunión con un cliente».
 *   - LAS TAREAS QUE NO VES (una fusión, una candidata): sin título.
 *   - El cliente de una fila que ves NO se enmascara (decisión 16): al lado de un título que lo nombra no protegería nada.
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { salasDeReuniones, type SalaDeLaReunion } from "@/lib/sessions/reuniones-para-tareas";
import { origenDeLaTarea } from "./origen";
import { sugerenciaDeCierre } from "./aligerar";
import { ultimosToquesDePersonas } from "./toques";
import { accionesDe, leerBloques, leerEstado, leerEstadoDeAgenda, leerEstadoDeProyecto, leerPrioridad, estaAbierta } from "./estados";
import { comoFecha, hoyEnCostaRica, lunesDeHoy, viernesDe, estaAtrasada } from "./semana";
import { claveDeEquipo, nombreDelEquipo } from "./equipos";
import { datosDeAmbito, ambitoConDatos, type DatosDeAmbito } from "./ambito-server";
import { administraElProyecto, veLaTarea } from "./visibilidad";
import { equipoDe, type ContextoDeTareas } from "./servidor";
import type { ClientesQueVes } from "./clientes";
import type { EmpresaVista, HubspotDeTarea, PersonaVista, ProyectoVista, SalioDe, SugerenciasDeTarea, TareaVista, RelacionVista } from "./tipos";
import { portalDelSistema } from "@/lib/hubspot/registro-para-vincular";
import { hubspotCompanyUrl, hubspotDealUrl, hubspotProjectUrl } from "@/lib/hubspot/urls";
import { leerDatosDeHubspot, rotuloDeHubspot } from "@/lib/tareas-hubspot/reglas";

const ESPACIO_SELECT = { tipo: true, visibilidad: true, equipo: true, miembros: { select: { email: true } } } as const;

/** Lo que hace falta de una tarea relacionada para decidir si quien mira la ve (sin título si no). */
const SELECT_RELACIONADA = {
  id: true,
  numero: true,
  titulo: true,
  estado: true,
  semana: true,
  responsableEmail: true,
  creadaPorEmail: true,
  pedidaPorEmail: true,
  equipo: true,
  privada: true,
  archivadaAt: true,
  clientId: true,
  proyecto: { select: { espacio: { select: ESPACIO_SELECT } } },
} as const;

export const SELECT_TAREA = {
  id: true,
  numero: true,
  titulo: true,
  tituloCorto: true,
  tituloCortoDe: true,
  notas: true,
  contexto: true,
  estado: true,
  prioridad: true,
  tipo: true,
  lado: true,
  clase: true,
  privada: true,
  seccion: true,
  etiquetas: true,
  equipo: true,
  responsableEmail: true,
  semana: true,
  venceEl: true,
  minutosEstimados: true,
  completadaAt: true,
  proyectoId: true,
  clientId: true,
  projectId: true,
  origen: true,
  creadaPorEmail: true,
  pedidaPorEmail: true,
  pedidaPorEquipo: true,
  pedidaPorTexto: true,
  sessionId: true,
  origenTitulo: true,
  cita: true,
  mismaQueId: true,
  decision: true,
  decididaPorEmail: true,
  decididaAt: true,
  motivo: true,
  agendaEstado: true,
  agendaInicio: true,
  agendaBloques: true,
  version: true,
  archivadaAt: true,
  createdAt: true,
  hubspotTaskId: true,
  hubspotDatos: true,
  hubspotError: true,
  proyecto: { select: { id: true, nombre: true, estado: true, espacio: { select: ESPACIO_SELECT } } },
  mismaQue: {
    select: {
      id: true,
      numero: true,
      titulo: true,
      responsableEmail: true,
      creadaPorEmail: true,
      pedidaPorEmail: true,
      equipo: true,
      privada: true,
      archivadaAt: true,
      proyecto: { select: { espacio: { select: ESPACIO_SELECT } } },
    },
  },
  resultados: { where: { resultado: "pasa", decididoPor: { not: "sistema" } }, select: { semana: true, venceEl: true } },
  // Dependencias (§5.7): «desde» bloquea a «hacia».
  bloqueadaPor: { where: { tipo: "bloquea" }, select: { desde: { select: SELECT_RELACIONADA } }, take: 20 },
  bloqueaA: { where: { tipo: "bloquea" }, select: { hacia: { select: SELECT_RELACIONADA } }, take: 20 },
} satisfies Prisma.TareaSelect;

export type FilaDeTarea = Prisma.TareaGetPayload<{ select: typeof SELECT_TAREA }>;

type EspacioFila = { tipo: string; visibilidad: string; equipo: string | null; miembros: { email: string }[] } | null | undefined;
const aEspacio = (e: EspacioFila) => (e ? { tipo: e.tipo, visibilidad: e.visibilidad, equipo: e.equipo, miembros: e.miembros.map((m) => m.email) } : null);

export interface ContextoDeSerializar {
  ctx: ContextoDeTareas;
  clientes: ClientesQueVes;
  ambito: DatosDeAmbito;
  salas: Map<string, SalaDeLaReunion>;
  /** Lo que sugirió Nexus a cada propuesta (su evento `propuesta`). */
  sugeridos: Map<string, Record<string, unknown>>;
  /** Lo que dijo la retro, por tarea. */
  cierres: Map<string, { resultado: "hecha" | "no_hecha"; cita: string | null; semana: string; sessionId: string | null }>;
  /** Las candidatas («¿Es T-12?») que quien mira puede ver. */
  candidatas: Map<string, { id: string; numero: number; titulo: string; responsable: string | null; pases: number }>;
  ahora: Date;
  /** El portal de HubSpot del sistema, para los enlaces de las tareas de HubSpot (null si no hay ninguna). */
  portal?: string | null;
  /** La última vez que una persona tocó cada tarea abierta o propuesta (lib/tareas/toques.ts): para `sugerenciaDeCierre`. */
  toques?: Map<string, Date>;
}

/** Arma todo lo que el serializador necesita para un lote de filas, en pocas consultas. */
export async function prepararSerializacion(ctx: ContextoDeTareas, clientes: ClientesQueVes, filas: readonly FilaDeTarea[], ahora = new Date()): Promise<ContextoDeSerializar> {
  const propuestas = filas.filter((f) => f.estado === "propuesta").map((f) => f.id);
  const abiertasPasadas = filas.filter((f) => estaAbierta(f.estado) && f.semana && comoFecha(f.semana)! <= lunesDeHoy(ahora)).map((f) => f.id);
  const vivas = filas.filter((f) => (f.estado === "propuesta" || estaAbierta(f.estado)) && f.origen !== "hubspot").map((f) => f.id);
  const [ambito, salas, eventos, cierres, toques] = await Promise.all([
    datosDeAmbito(filas.map((f) => f.clientId), filas.map((f) => f.projectId)),
    salasDeReuniones({ email: ctx.email, esSuperAdmin: ctx.esSuperAdmin, clientes }, filas.map((f) => f.sessionId).filter((x): x is string => !!x)),
    propuestas.length ? prisma.tareaEvento.findMany({ where: { tareaId: { in: propuestas }, tipo: "propuesta" }, select: { tareaId: true, datos: true } }) : [],
    abiertasPasadas.length
      ? prisma.tareaEvento.findMany({ where: { tareaId: { in: abiertasPasadas }, tipo: "sugerido_cierre" }, select: { tareaId: true, datos: true, cita: true, sessionId: true }, orderBy: { createdAt: "desc" } })
      : [],
    ultimosToquesDePersonas(vivas),
  ]);
  const sugeridos = new Map<string, Record<string, unknown>>();
  for (const e of eventos) if (e.tareaId) sugeridos.set(e.tareaId, (e.datos ?? {}) as Record<string, unknown>);

  // Las candidatas que quien mira puede ver.
  const idsCandidatas = [...new Set([...sugeridos.values()].flatMap((d) => (Array.isArray(d.candidatas) ? (d.candidatas as unknown[]).filter((x): x is string => typeof x === "string") : [])))];
  const filasCandidatas = idsCandidatas.length
    ? await prisma.tarea.findMany({
        where: { id: { in: idsCandidatas } },
        select: {
          id: true,
          numero: true,
          titulo: true,
          responsableEmail: true,
          creadaPorEmail: true,
          pedidaPorEmail: true,
          equipo: true,
          privada: true,
          archivadaAt: true,
          clientId: true,
          proyecto: { select: { espacio: { select: ESPACIO_SELECT } } },
          _count: { select: { resultados: { where: { resultado: "pasa", decididoPor: { not: "sistema" } } } } },
        },
      })
    : [];
  const candidatas = new Map<string, { id: string; numero: number; titulo: string; responsable: string | null; pases: number }>();
  for (const c of filasCandidatas) {
    if (!veLaTarea({ ...c, espacio: aEspacio(c.proyecto?.espacio) }, ctx)) continue;
    candidatas.set(c.id, { id: c.id, numero: c.numero, titulo: c.titulo, responsable: ctx.miembros.find((m) => m.email === c.responsableEmail)?.nombre ?? null, pases: c._count.resultados });
  }

  const porTarea = new Map<string, { resultado: "hecha" | "no_hecha"; cita: string | null; semana: string; sessionId: string | null }>();
  for (const e of cierres) {
    if (!e.tareaId || porTarea.has(e.tareaId)) continue;
    const d = (e.datos ?? {}) as Record<string, unknown>;
    if ((d.resultado === "hecha" || d.resultado === "no_hecha") && typeof d.semana === "string") porTarea.set(e.tareaId, { resultado: d.resultado, cita: e.cita, semana: d.semana, sessionId: e.sessionId });
  }
  // Las salas de las citas de cierre también.
  const faltan = [...porTarea.values()].map((c) => c.sessionId).filter((s): s is string => !!s && !salas.has(s));
  if (faltan.length) for (const [k, v] of await salasDeReuniones({ email: ctx.email, esSuperAdmin: ctx.esSuperAdmin, clientes }, faltan)) salas.set(k, v);

  const portal = filas.some((f) => f.hubspotTaskId) ? await portalDelSistema().catch(() => null) : null;
  return { ctx, clientes, ambito, salas, sugeridos, cierres: porTarea, candidatas, ahora, portal, toques };
}

const NOMBRE_DEL_REGISTRO = { deal: "el negocio", company: "la empresa", "0-970": "el proyecto" } as const;

/** De dónde viene una tarea de HubSpot y dónde abrirla. */
function hubspotDe(f: FilaDeTarea, s: ContextoDeSerializar): HubspotDeTarea | null {
  if (!f.hubspotTaskId) return null;
  const d = leerDatosDeHubspot(f.hubspotDatos);
  const portal = s.portal ?? null;
  const reg = d.registro;
  const regUrl = !reg ? null : reg.objeto === "deal" ? hubspotDealUrl(portal, reg.id) : reg.objeto === "company" ? hubspotCompanyUrl(portal, reg.id) : hubspotProjectUrl(portal, reg.id);
  return {
    rotulo: rotuloDeHubspot(d),
    url: portal ? `https://app.hubspot.com/tasks/${portal}/view/all/task/${f.hubspotTaskId}` : null,
    registro: reg && regUrl ? { texto: `Abrir ${NOMBRE_DEL_REGISTRO[reg.objeto]} en HubSpot`, url: regUrl } : null,
    error: f.hubspotError,
  };
}

function persona(email: string | null | undefined, s: ContextoDeSerializar): PersonaVista | null {
  if (!email) return null;
  const m = s.ctx.miembros.find((x) => x.email === email.toLowerCase());
  return { email: email.toLowerCase(), nombre: m?.nombre ?? email, equipo: m ? claveDeEquipo(m.area, m.email) : null };
}

function empresa(id: string | null, s: ContextoDeSerializar): EmpresaVista | null {
  if (!id) return null;
  const e = s.ambito.empresas.get(id) ?? s.clientes.porId.get(id);
  return e ? { id, nombre: e.nombre, kind: e.kind } : null;
}

/** ¿Ve la cita de esa reunión? (la regla de arriba). */
function veLaCita(sala: SalaDeLaReunion, t: { responsableEmail: string | null; creadaPorEmail: string | null; equipo: string | null }, s: ContextoDeSerializar): boolean {
  return veLaCitaDe(sala, t, { email: s.ctx.email, esSuperAdmin: s.ctx.esSuperAdmin, lidera: s.ctx.lidera });
}

function salioDe(sessionId: string | null, cita: string | null, t: { responsableEmail: string | null; creadaPorEmail: string | null; equipo: string | null }, s: ContextoDeSerializar): SalioDe | null {
  if (!sessionId) return null;
  const sala = s.salas.get(sessionId);
  if (!sala) return { visible: false, texto: "Salió de una reunión" };
  if (!veLaCita(sala, t, s)) return { visible: false, texto: sala.puertasAdentro ? "Salió de una reunión del equipo" : "Salió de una reunión con un cliente" };
  return { visible: true, sesionId: sessionId, titulo: sala.titulo, fecha: sala.inicio.toISOString(), cita };
}

/** Quién mira, para las reglas de la cita y del contexto (la pantalla y el chat usan la misma). */
export interface QuienMira {
  email: string;
  esSuperAdmin: boolean;
  lidera: readonly string[];
}

/** La regla de la cita (arriba), sin el contexto entero de serializar: la usa también el chat. */
export function veLaCitaDe(sala: SalaDeLaReunion, t: { responsableEmail: string | null; creadaPorEmail: string | null; equipo: string | null }, q: QuienMira): boolean {
  if (q.esSuperAdmin) return true;
  if (!sala.clienteVisible) return false;
  if (sala.puertasAdentro) return sala.estuvo || t.responsableEmail === q.email || t.creadaPorEmail === q.email || (!!t.equipo && q.lidera.includes(t.equipo));
  return sala.estuvo;
}

/**
 * ¿Ve el CONTEXTO que escribió Nexus desde una reunión? Lo que ve la cita, y además quien la hace o la pidió si ve al
 * cliente: lo necesita para hacerla aunque no haya estado (Elías, 2026-10-09). El de una tarea sin reunión (el chat) va
 * con la fila y no pasa por acá.
 */
export function veElContexto(
  sala: SalaDeLaReunion,
  t: { responsableEmail: string | null; creadaPorEmail: string | null; pedidaPorEmail: string | null; equipo: string | null },
  q: QuienMira,
): boolean {
  if (veLaCitaDe(sala, t, q)) return true;
  // La excepción pide SABER de quién es la reunión: una de afuera sin dueño resuelto podría ser de un cliente que no ve.
  return (sala.puertasAdentro || sala.conDueno) && sala.clienteVisible && (t.responsableEmail === q.email || t.pedidaPorEmail === q.email);
}

/** Lo que se dice en lugar del contexto que no se ve. */
export function contextoOcultoPara(sala: SalaDeLaReunion | undefined): string {
  if (!sala) return "El contexto salió de una reunión.";
  return sala.puertasAdentro ? "El contexto salió de una reunión del equipo en la que no estuviste." : "El contexto salió de una reunión con un cliente en la que no estuviste.";
}

function contextoVisible(
  f: { contexto: string | null; sessionId: string | null; responsableEmail: string | null; creadaPorEmail: string | null; pedidaPorEmail: string | null; equipo: string | null },
  s: ContextoDeSerializar,
): { contexto: string | null; contextoOculto: string | null } {
  if (!f.contexto) return { contexto: null, contextoOculto: null };
  if (!f.sessionId) return { contexto: f.contexto, contextoOculto: null };
  const sala = s.salas.get(f.sessionId);
  if (sala && veElContexto(sala, f, { email: s.ctx.email, esSuperAdmin: s.ctx.esSuperAdmin, lidera: s.ctx.lidera })) return { contexto: f.contexto, contextoOculto: null };
  return { contexto: null, contextoOculto: contextoOcultoPara(sala) };
}

/** Las notas de una tarea que salió de una reunión: si todavía son el texto de la reunión, siguen la regla de la cita. */
function notasVisibles(f: { notas: string | null; cita: string | null; sessionId: string | null; responsableEmail: string | null; creadaPorEmail: string | null; equipo: string | null }, s: ContextoDeSerializar): string | null {
  if (!f.notas || !f.sessionId || !f.cita || !f.cita.includes(f.notas.trim())) return f.notas;
  const sala = s.salas.get(f.sessionId);
  return sala && veLaCita(sala, f, s) ? f.notas : null;
}

/** La agenda de una tarea, y si alguno de sus bloques está en el calendario de quien mira. */
function agendaVista(f: { agendaEstado: string | null; agendaInicio: Date | null; agendaBloques: unknown }, email: string): TareaVista["agenda"] {
  const bloques = leerBloques(f.agendaBloques);
  const yo = email.toLowerCase();
  return { estado: leerEstadoDeAgenda(f.agendaEstado), inicio: f.agendaInicio?.toISOString() ?? null, bloques, tienesBloque: bloques.some((b) => b.calendario.toLowerCase() === yo) };
}

/** Pases que cuentan: los que decidió una persona, sin los de una tarea que todavía no vencía ese viernes. */
function pasesQueCuentan(resultados: { semana: Date; venceEl: Date | null }[]): number {
  return resultados.filter((r) => {
    const vence = comoFecha(r.venceEl);
    return !vence || vence <= viernesDe(comoFecha(r.semana)!);
  }).length;
}

export function serializarTarea(f: FilaDeTarea, s: ContextoDeSerializar): TareaVista {
  const ctx = s.ctx;
  const espacio = aEspacio(f.proyecto?.espacio);
  const semana = comoFecha(f.semana);
  const venceEl = comoFecha(f.venceEl);
  const estado = leerEstado(f.estado);
  const proyectoHs = f.projectId ? s.ambito.proyectos.get(f.projectId) : null;
  const espacioLibreMio = espacio?.tipo === "libre" && espacio.miembros.includes(ctx.email);

  let mismaQue: TareaVista["mismaQue"] = null;
  if (f.mismaQue) {
    const ve = veLaTarea({ ...f.mismaQue, espacio: aEspacio(f.mismaQue.proyecto?.espacio) }, ctx);
    mismaQue = { id: f.mismaQue.id, numero: f.mismaQue.numero, titulo: ve ? f.mismaQue.titulo : null };
  }

  let sugerencias: SugerenciasDeTarea | undefined;
  const d = s.sugeridos.get(f.id);
  if (d && estado === "propuesta") {
    sugerencias = {};
    if (typeof d.clienteSugeridoId === "string" && !f.clientId) {
      const e = empresa(d.clienteSugeridoId, s);
      if (e && s.clientes.ids.has(e.id)) sugerencias.cliente = e;
    }
    if (typeof d.proyectoSugeridoId === "string" && !f.proyectoId) sugerencias.proyecto = { id: d.proyectoSugeridoId, nombre: "" };
    if (Array.isArray(d.candidatas)) {
      const vistas = (d.candidatas as unknown[]).flatMap((id) => (typeof id === "string" && s.candidatas.has(id) ? [s.candidatas.get(id)!] : []));
      if (vistas.length) sugerencias.candidatas = vistas.slice(0, 3);
    }
    if (Array.isArray(d.menciones)) {
      sugerencias.menciones = (d.menciones as { nombreDicho?: unknown; candidatos?: unknown; pide?: unknown }[]).flatMap((m) =>
        typeof m.nombreDicho === "string" && Array.isArray(m.candidatos)
          ? [{ nombreDicho: m.nombreDicho, pide: m.pide === true, candidatos: (m.candidatos as string[]).map((e) => persona(e, s)).filter((p): p is PersonaVista => !!p) }]
          : [],
      );
    }
    if (d.sinIa === true) sugerencias.sinIa = true;
    if (d.deLaConversacion === true) sugerencias.deLaConversacion = true;
    if (d.revisarTitulo === true) sugerencias.revisarTitulo = true;
    if (typeof d.confirmarPersona === "string") sugerencias.confirmarPersona = persona(d.confirmarPersona, s) ?? undefined;
    if (Array.isArray(d.candidatosPersona)) sugerencias.candidatosPersona = (d.candidatosPersona as string[]).map((e) => persona(e, s)).filter((p): p is PersonaVista => !!p);
  }

  const relacionada = (r: (typeof f.bloqueadaPor)[number]["desde"]): RelacionVista | null => {
    if (r.archivadaAt) return null;
    const ve = veLaTarea({ ...r, espacio: aEspacio(r.proyecto?.espacio) }, ctx);
    return { id: r.id, numero: r.numero, titulo: ve ? r.titulo : null, abierta: estaAbierta(r.estado) || r.estado === "propuesta", semana: comoFecha(r.semana) };
  };
  const esperando = f.bloqueadaPor.map((r) => relacionada(r.desde)).filter((r): r is RelacionVista => !!r);
  const laEsperan = f.bloqueaA.map((r) => relacionada(r.hacia)).filter((r): r is RelacionVista => !!r);

  const cierre = s.cierres.get(f.id);
  let sugeridoCierre: TareaVista["sugeridoCierre"];
  if (cierre) {
    const sala = cierre.sessionId ? s.salas.get(cierre.sessionId) : undefined;
    sugeridoCierre = { resultado: cierre.resultado, semana: cierre.semana, cita: sala && veLaCita(sala, f, s) ? cierre.cita : null };
  }

  const acciones = accionesDe({ ...f, semana }, ctx, { lunesDeHoy: lunesDeHoy(s.ahora), esMiembroDelEspacioLibre: espacioLibreMio });
  // «Ya pasó»: solo a quien la puede cerrar (su responsable, quien lidera el sprint, dirección). Nunca se cierra sola.
  const cerrar = s.toques
    ? sugerenciaDeCierre(
        { titulo: f.titulo, minutosEstimados: f.minutosEstimados, estado, origen: f.origen, venceEl, semana, creadaAt: f.createdAt.toISOString(), ultimoToque: s.toques.get(f.id)?.toISOString() ?? null },
        hoyEnCostaRica(s.ahora),
      )
    : null;
  const puedeCerrar = !!cerrar && (cerrar.accion === "descartar" ? acciones.decidir : acciones.noSeHara);

  return {
    id: f.id,
    numero: f.numero,
    titulo: f.titulo,
    // El nombre corto vale solo si salió del título de hoy (lib/tareas/titulo-corto.ts).
    tituloCorto: f.tituloCortoDe === f.titulo ? f.tituloCorto : null,
    notas: notasVisibles(f, s),
    ...contextoVisible(f, s),
    estado,
    prioridad: leerPrioridad(f.prioridad),
    tipo: f.tipo,
    lado: f.lado === "cliente" ? "cliente" : "smarteam",
    clase: f.clase,
    privada: f.privada,
    seccion: f.seccion,
    etiquetas: f.etiquetas,
    equipo: f.equipo,
    equipoNombre: f.equipo ? nombreDelEquipo(f.equipo, { paraMi: f.equipo === ctx.equipo, miembros: f.equipo === ctx.equipo ? ctx.companeros.length : undefined }) : null,
    responsable: persona(f.responsableEmail, s),
    semana,
    venceEl,
    minutosEstimados: f.minutosEstimados,
    completadaAt: f.completadaAt?.toISOString() ?? null,
    atrasada: estaAtrasada(venceEl, estaAbierta(estado), hoyEnCostaRica(s.ahora)),
    proyecto: f.proyecto ? { id: f.proyecto.id, nombre: f.proyecto.nombre, estado: leerEstadoDeProyecto(f.proyecto.estado) } : null,
    cliente: empresa(f.clientId, s),
    proyectoHubspot: proyectoHs ? { id: proyectoHs.id, nombre: proyectoHs.nombre, cerrado: proyectoHs.cerrado } : null,
    ambito: ambitoConDatos(s.ambito, f.clientId, f.projectId),
    origen: f.origen,
    de: origenDeLaTarea(f, f.sessionId ? s.salas.get(f.sessionId) : null),
    creadaPor: f.creadaPorEmail,
    pedidaPor: persona(f.pedidaPorEmail, s),
    pedidaPorEquipoNombre: f.pedidaPorEquipo ? nombreDelEquipo(f.pedidaPorEquipo) : null,
    // Lo que salió de una reunión no lleva texto suelto: su título lo da `salioDe`, con la regla de la cita.
    pedidaPorTexto: f.sessionId ? null : f.pedidaPorTexto,
    salioDe: salioDe(f.sessionId, f.cita, f, s),
    mismaQue,
    decision: f.decision,
    decididaPor: f.decididaPorEmail,
    decididaAt: f.decididaAt?.toISOString() ?? null,
    motivo: f.motivo,
    agenda: agendaVista(f, ctx.email),
    pases: pasesQueCuentan(f.resultados),
    esperando,
    laEsperan,
    version: f.version,
    acciones,
    ...(cerrar && puedeCerrar ? { cerrar } : {}),
    ...(sugerencias && Object.keys(sugerencias).length ? { sugerencias } : {}),
    ...(sugeridoCierre ? { sugeridoCierre } : {}),
    hubspot: hubspotDe(f, s),
  };
}

/* ── Proyectos ───────────────────────────────────────────────────────────────────── */

export const SELECT_PROYECTO = {
  id: true,
  nombre: true,
  estado: true,
  descripcion: true,
  responsableEmail: true,
  creadoPorEmail: true,
  iniciaEl: true,
  venceEl: true,
  clientId: true,
  projectId: true,
  origen: true,
  sessionId: true,
  cita: true,
  secciones: true,
  version: true,
  createdAt: true,
  lectura: { select: { pedidaPorEmail: true } },
  espacio: { select: { id: true, nombre: true, tipo: true, equipo: true, miembros: { select: { email: true, rol: true } } } },
} satisfies Prisma.ProyectoDeTareasSelect;

export type FilaDeProyecto = Prisma.ProyectoDeTareasGetPayload<{ select: typeof SELECT_PROYECTO }>;

export function serializarProyecto(
  p: FilaDeProyecto,
  s: ContextoDeSerializar,
  avance: { hechas: number; total: number; sumadasEstaSemana: number; queVes: number; propuestas: number },
): ProyectoVista {
  const ctx = s.ctx;
  const proyectoHs = p.projectId ? s.ambito.proyectos.get(p.projectId) : null;
  const puedeAdministrar = administraElProyecto(ctx, p);
  return {
    id: p.id,
    nombre: p.nombre,
    estado: leerEstadoDeProyecto(p.estado),
    descripcion: p.descripcion,
    responsable: persona(p.responsableEmail, s),
    iniciaEl: comoFecha(p.iniciaEl),
    venceEl: comoFecha(p.venceEl),
    cliente: empresa(p.clientId, s),
    proyectoHubspot: proyectoHs ? { id: proyectoHs.id, nombre: proyectoHs.nombre, cerrado: proyectoHs.cerrado } : null,
    ambito: ambitoConDatos(s.ambito, p.clientId, p.projectId),
    espacio: { id: p.espacio.id, nombre: p.espacio.nombre, tipo: p.espacio.tipo },
    origen: p.origen,
    salioDe: salioDe(p.sessionId, p.cita, { responsableEmail: p.responsableEmail, creadaPorEmail: p.creadoPorEmail, equipo: p.espacio.equipo }, s),
    avance,
    secciones: p.secciones,
    version: p.version,
    puedeAdministrar,
    puedeDecidir: p.estado === "propuesta" && (puedeAdministrar || p.lectura?.pedidaPorEmail === ctx.email),
  };
}

export { equipoDe };
