/**
 * lib/servicios/servicio-server.ts — EL SERVICIO RECURRENTE de un proyecto: la guía del Resumen, sus rutinas y «Pasar a
 * recurrente». SERVIDOR. (Roadmap «La siguiente serie», iniciativa 4, pasos 1, 2, 3 y 5.)
 *
 * Las reglas son puras y viven aparte: el catálogo (catalogo.ts), las rutinas (rutinas.ts) y lo que propone Nexus al
 * pasar (pasar-a-recurrente.ts). Acá solo se lee y se escribe:
 *  · `Project.servicioRecurrente`, `servicioDesde` y `servicioRutinas` los escribe SOLO este archivo (y el alta de un
 *    proyecto que nace de una propuesta recurrente, app/api/projects/route.ts, por `servicioQueTraeLaPropuesta`).
 *  · Las tareas que se repiten van por el escritor único de Tareas (`crearTarea`), con su clave por semana.
 *  · El ciclo 1 de un servicio que avanza por ciclos lo abre el escritor del ciclo (`abrirCiclo`).
 *  · ⛔ Nada de esto escribe en HubSpot ni en Google Calendar: lo que hay que mover allá es una tarea para una persona, y
 *    las reuniones fijas son un enlace que la persona guarda.
 */
import "server-only";
import type { Prisma, TeamMember } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { canvasOfAny } from "@/lib/pieces/canvas-query";
import { pieceForCanvas } from "@/lib/pieces/registry";
import { buscarEtapa, resolvePipeline } from "@/lib/projects/kind";
import { getClientSessions } from "@/lib/sessions/project-sources";
import { invitadosDeLaProxima } from "@/lib/seguimiento/reunion/proxima";
import { olvidarMedicion } from "@/lib/para-ti/medir-server";
import { contextoDeTareas, equipoDe, ErrorDeTareas } from "@/lib/tareas/servidor";
import { clientesQueVesParaTareas } from "@/lib/tareas/clientes";
import { crearTarea, urlDeLaTarea } from "@/lib/tareas/mutaciones";
import { hoyEnCostaRica } from "@/lib/tareas/semana";
import { abrirCiclo, cargarEstadoDelCiclo, ErrorDelCiclo, sumarCasosDeLaPropuestaEnTx } from "./ciclos-server";
import { esTipoRecurrente, resolveBcType, SERVICIO_RECURRENTE_TYPE_ID } from "@/lib/business-cases/case-types";
import { USE_CASES_SECTION_KEY } from "@/lib/business-cases/use-cases";
import { casosDeLaPropuesta } from "./propuesta";
import { sanitizeTags } from "@/lib/tags/catalog";
import { CATALOGO_DE_SERVICIOS, ETIQUETA_DE_CADENCIA, servicioDelCatalogo, servicioDelProyecto, type Cadencia, type ServicioRecurrente } from "./catalogo";
import { esEtapaDelCiclo, type EtapaDelCiclo } from "./ciclo";
import { propuestaDePaso, type PropuestaDePaso } from "./pasar-a-recurrente";
import { puedeDecidirRecurrencia } from "./recurrencia";
import { enlaceDeLaReunion, leerRutinas, queTocaAhora, RUTINAS_VACIAS, tareasDeLaVentana, type EstadoDeLasRutinas, type QueTocaAhora } from "./rutinas";

export class ErrorDelServicio extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 503,
  ) {
    super(message);
  }
}

/** Los documentos que dicen en qué etapa va un ciclo (la misma lectura del script de migración). */
const DOCUMENTOS_DEL_CICLO = ["diagnosis", "planning"] as const;

export interface ServicioParaElCatalogo {
  clave: string;
  nombre: string;
  descripcion: string;
  conCiclo: boolean;
}

export interface GuiaDelServicioDto {
  /** null = el proyecto se hace una vez. Lo demás solo viene con servicio. */
  servicio: {
    clave: string;
    nombre: string;
    descripcion: string;
    incluye: readonly string[];
    cadencia: string;
    validado: boolean;
    conCiclo: boolean;
    reuniones: Array<{
      clave: string;
      titulo: string;
      cada: string;
      duracionMin: number;
      conQuien: string;
      paraQue: string;
      enlace: string;
      agendada: { at: string; por: string } | null;
    }>;
    tareas: Array<{ clave: string; titulo: string; cada: string }>;
  } | null;
  /** Desde cuándo corre (AAAA-MM-DD), si se sabe. */
  desde: string | null;
  /** Hasta qué semana hay tareas de la rutina creadas, y cuántas crearía «Crear las tareas» ahora. */
  tareas: { hasta: string | null; siguientes: number; ventanaHasta: string } | null;
  queToca: QueTocaAhora | null;
  /** El ciclo abierto, si el servicio avanza por ciclos. */
  ciclo: { numero: number; etapa: EtapaDelCiclo; falta: string | null } | null;
  /** El proyecto todavía no está donde el servicio lo pide en HubSpot (lo mueve una persona). */
  pendienteEnHubspot: string | null;
  puedeEditar: boolean;
  /** Para «Pasar a recurrente»: los servicios que se pueden elegir. Vacío si no se puede pasar. */
  catalogo: ServicioParaElCatalogo[];
}

const SELECT_PROYECTO = {
  id: true,
  name: true,
  clientId: true,
  status: true,
  hubspotPipelineId: true,
  hubspotPipelineStageId: true,
  hubspotPipelineStageLabel: true,
  hubspotOwnerEmail: true,
  esPrueba: true,
  createdAt: true,
  servicioRecurrente: true,
  servicioDesde: true,
  servicioRutinas: true,
  client: { select: { name: true } },
} as const;

async function leerProyecto(projectId: string) {
  try {
    return await prisma.project.findUnique({ where: { id: projectId }, select: SELECT_PROYECTO });
  } catch (e) {
    if (esquemaDesactualizado(e)) throw new ErrorDelServicio("Falta correr el SQL del servicio recurrente (scripts/sql/2026-10-18-servicio-recurrente.sql).", 503);
    throw e;
  }
}

type FilaDelProyecto = NonNullable<Awaited<ReturnType<typeof leerProyecto>>>;

const dia = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

function servicioDe(p: FilaDelProyecto): ServicioRecurrente | null {
  return servicioDelProyecto({ servicioRecurrente: p.servicioRecurrente, servicioDelPipeline: resolvePipeline(p.hubspotPipelineId)?.servicioRecurrente ?? null });
}

function cerrado(p: FilaDelProyecto): boolean {
  const def = resolvePipeline(p.hubspotPipelineId);
  return p.status === "completed" || !!(def && buscarEtapa(def, p.hubspotPipelineStageId)?.terminal);
}

/** Lo que el proyecto le dice a `propuestaDePaso`, con los documentos y el cronograma que mira la migración. */
async function proyectoParaPasar(p: FilaDelProyecto) {
  const [extra, abierto] = await Promise.all([
    prisma.project.findUnique({
      where: { id: p.id },
      select: {
        timeline: { select: { phases: { orderBy: { order: "asc" }, select: { name: true, status: true } } } },
        handoff: { select: { id: true } },
        canvases: { where: canvasOfAny(DOCUMENTOS_DEL_CICLO), select: { slug: true, name: true, canvasSections: { select: { _count: { select: { blocks: true } } } } } },
      },
    }),
    prisma.cicloDeProyecto.findFirst({ where: { projectId: p.id, estado: "abierto" }, select: { etapa: true } }),
  ]);
  const documentos = new Set<string>();
  for (const c of extra?.canvases ?? []) {
    const slug = pieceForCanvas(c)?.slug;
    if (slug && c.canvasSections.some((s) => s._count.blocks > 0)) documentos.add(slug);
  }
  return {
    nombre: p.name,
    servicioActual: servicioDe(p)?.clave ?? null,
    pipeline: resolvePipeline(p.hubspotPipelineId)?.key ?? null,
    etapa: p.hubspotPipelineStageLabel,
    cerrado: cerrado(p),
    cicloAbierto: abierto ? { etapa: abierto.etapa } : null,
    fases: (extra?.timeline?.phases ?? []).map((f) => ({ name: f.name, status: String(f.status) })),
    documentos,
    tieneHandoff: !!extra?.handoff,
  };
}

/** Los invitados de las reuniones fijas: quienes estuvieron en la última reunión con el cliente (por el chokepoint). */
async function invitadosDelCliente(clientId: string): Promise<string[]> {
  const reuniones = await getClientSessions(clientId, { take: 6 }).catch(() => []);
  const ultima = reuniones.find((r) => r.participants.length > 1);
  return ultima ? invitadosDeLaProxima(ultima.participants) : [];
}

/** La guía del servicio para el Resumen del proyecto. */
export async function cargarGuiaDelServicio(projectId: string, persona: TeamMember, ahora = new Date()): Promise<GuiaDelServicioDto> {
  const p = await leerProyecto(projectId);
  if (!p) throw new ErrorDelServicio("El proyecto no existe.", 404);
  const servicio = servicioDe(p);
  const puedeEditar = puedeDecidirRecurrencia(persona.roleEnum) && !p.esPrueba;
  if (!servicio) {
    return {
      servicio: null,
      desde: null,
      tareas: null,
      queToca: null,
      ciclo: null,
      pendienteEnHubspot: null,
      puedeEditar,
      catalogo: puedeEditar && !cerrado(p) ? CATALOGO_DE_SERVICIOS.map((s) => ({ clave: s.clave, nombre: s.nombre, descripcion: s.descripcion, conCiclo: !!s.ciclo })) : [],
    };
  }

  const hoy = hoyEnCostaRica(ahora);
  const estado = leerRutinas(p.servicioRutinas);
  const arranque = dia(p.servicioDesde) ?? dia(p.createdAt) ?? hoy;
  const [invitados, estadoCiclo] = await Promise.all([
    invitadosDelCliente(p.clientId),
    servicio.ciclo ? cargarEstadoDelCiclo(projectId).catch(() => null) : Promise.resolve(null),
  ]);
  const ventana = tareasDeLaVentana({ projectId, servicio, arranque, hoy, estado });
  const ciclo =
    estadoCiclo?.abierto && esEtapaDelCiclo(estadoCiclo.abierto.etapa)
      ? { numero: estadoCiclo.abierto.numero, etapa: estadoCiclo.abierto.etapa, falta: estadoCiclo.guia?.primeroQueFalta ?? null }
      : null;
  const pipeline = resolvePipeline(p.hubspotPipelineId);
  const pendienteEnHubspot =
    p.servicioRecurrente && pipeline?.key !== servicio.enHubspot.pipeline
      ? `Falta mover el proyecto en HubSpot a ${servicio.enHubspot.pipeline === "smartloop" ? "SmartLoop" : `«${servicio.enHubspot.etapa}»`}: lo mueve una persona y vuelve solo.`
      : null;

  return {
    servicio: {
      clave: servicio.clave,
      nombre: servicio.nombre,
      descripcion: servicio.descripcion,
      incluye: servicio.incluye,
      cadencia: servicio.cadencia,
      validado: servicio.validado,
      conCiclo: !!servicio.ciclo,
      reuniones: servicio.reuniones.map((r) => ({
        clave: r.clave,
        titulo: r.titulo,
        cada: ETIQUETA_DE_CADENCIA[r.cada],
        duracionMin: r.duracionMin,
        conQuien: r.conQuien,
        paraQue: r.paraQue,
        enlace: enlaceDeLaReunion({ reunion: r, servicio, empresa: p.client.name, hoy, invitados, correo: persona.email }),
        agendada: estado.reuniones[r.clave] ? { at: estado.reuniones[r.clave].agendadaAt, por: estado.reuniones[r.clave].por } : null,
      })),
      tareas: servicio.tareas.map((t) => ({ clave: t.clave, titulo: t.titulo, cada: ETIQUETA_DE_CADENCIA[t.cada as Cadencia] })),
    },
    desde: dia(p.servicioDesde),
    tareas: servicio.tareas.length ? { hasta: estado.tareas?.hasta ?? null, siguientes: ventana.tareas.length, ventanaHasta: ventana.hasta } : null,
    queToca: queTocaAhora({ servicio, estado, hoy, faltaDelCiclo: ciclo?.falta ?? null }),
    ciclo,
    pendienteEnHubspot,
    puedeEditar,
    catalogo: [],
  };
}

/** Lo que propone Nexus al elegir un servicio (antes de confirmar «Pasar a recurrente»). */
export async function propuestaParaPasar(projectId: string, clave: string): Promise<PropuestaDePaso & { servicio: string }> {
  const s = servicioDelCatalogo(clave);
  if (!s) throw new ErrorDelServicio("Ese servicio no está en el catálogo.", 400);
  const p = await leerProyecto(projectId);
  if (!p) throw new ErrorDelServicio("El proyecto no existe.", 404);
  return { ...propuestaDePaso(await proyectoParaPasar(p), s), servicio: s.nombre };
}

async function guardarRutinas(projectId: string, estado: EstadoDeLasRutinas) {
  await prisma.project.update({ where: { id: projectId }, data: { servicioRutinas: JSON.parse(JSON.stringify(estado)) } });
}

/**
 * «Pasar a recurrente»: el proyecto queda con su servicio y desde hoy; si el servicio avanza por ciclos, se abre el ciclo 1
 * en la etapa que confirmó la persona; si hay que moverlo en HubSpot, queda la tarea para el encargado (o para quien pasa).
 */
export async function pasarARecurrente(
  projectId: string,
  persona: TeamMember,
  d: { servicio: string; etapa?: EtapaDelCiclo | null },
  ahora = new Date(),
): Promise<{ tareaHubspot: string | null }> {
  if (!puedeDecidirRecurrencia(persona.roleEnum)) throw new ErrorDelServicio("Lo decide Customer Success.", 403);
  const s = servicioDelCatalogo(d.servicio);
  if (!s) throw new ErrorDelServicio("Ese servicio no está en el catálogo.", 400);
  const p = await leerProyecto(projectId);
  if (!p) throw new ErrorDelServicio("El proyecto no existe.", 404);
  if (p.esPrueba) throw new ErrorDelServicio("Un proyecto de prueba no pasa a recurrente.", 409);
  const propuesta = propuestaDePaso(await proyectoParaPasar(p), s, d.etapa);
  if (propuesta.bloqueo) throw new ErrorDelServicio(propuesta.bloqueo, 409);

  const quien = persona.email.toLowerCase();
  // Primero el proyecto: si algo de lo que sigue falla, el servicio ya quedó y la guía ofrece lo demás.
  const escrito = await prisma.project.updateMany({
    where: { id: projectId, OR: [{ servicioRecurrente: null }, { servicioRecurrente: { not: s.clave } }] },
    data: { servicioRecurrente: s.clave, servicioDesde: ahora, servicioRutinas: JSON.parse(JSON.stringify(RUTINAS_VACIAS)) },
  });
  if (escrito.count === 0) throw new ErrorDelServicio(`Este proyecto ya es ${s.nombre}.`, 409);

  if (s.ciclo && propuesta.etapaDelCiclo) {
    const etapa = d.etapa ?? propuesta.etapaDelCiclo.etapa;
    try {
      const abierto = await prisma.cicloDeProyecto.findFirst({ where: { projectId, estado: "abierto" }, select: { id: true } });
      if (!abierto) await abrirCiclo(projectId, { etapa }, quien);
    } catch (e) {
      if (!(e instanceof ErrorDelCiclo)) throw e;
      console.warn(`[servicio] ${projectId}: no se abrió el ciclo 1 (${e.message})`);
    }
  }

  let tareaHubspot: string | null = null;
  if (propuesta.tareaDeHubspot) {
    const { titulo, notas } = propuesta.tareaDeHubspot;
    const creada = await crearTareaPara(await contextoPara(persona), p, { titulo, notas, origenId: `servicio:${projectId}:hubspot` }, ahora);
    tareaHubspot = creada ? urlDeLaTarea(creada) : null;
  }
  olvidarMedicion(quien);
  return { tareaHubspot };
}

type ContextoParaTareas = { persona: TeamMember; ctx: Awaited<ReturnType<typeof contextoDeTareas>>; clientes: Awaited<ReturnType<typeof clientesQueVesParaTareas>> };

async function contextoPara(persona: TeamMember): Promise<ContextoParaTareas> {
  const [ctx, clientes] = await Promise.all([contextoDeTareas({ teamMember: persona }), clientesQueVesParaTareas(persona)]);
  return { persona, ctx, clientes };
}

/** Una tarea del servicio para el encargado del proyecto (si está en el equipo) o para quien la pide. */
async function crearTareaPara(
  { persona, ctx, clientes }: ContextoParaTareas,
  p: Pick<FilaDelProyecto, "id" | "clientId" | "hubspotOwnerEmail">,
  t: { titulo: string; notas?: string; origenId: string; cuando?: string },
  ahora: Date,
): Promise<string | null> {
  const encargado = p.hubspotOwnerEmail?.toLowerCase() ?? null;
  const para = encargado && equipoDe(encargado, ctx.miembros) ? encargado : persona.email.toLowerCase();
  try {
    const creada = await crearTarea(
      ctx,
      clientes,
      { titulo: t.titulo, notas: t.notas ?? null, para, cuando: t.cuando ?? "esta_semana", clientId: p.clientId, projectId: p.id, origen: "plantilla", origenId: t.origenId },
      ahora,
    );
    if (para !== persona.email.toLowerCase()) olvidarMedicion(para);
    return creada.id;
  } catch (e) {
    if (e instanceof ErrorDeTareas) throw new ErrorDelServicio(e.message, e.status === 503 ? 503 : e.status === 404 ? 404 : e.status === 403 ? 403 : 400);
    throw e;
  }
}

/** Crea las tareas que se repiten de la ventana que sigue (dos meses). Correrlo dos veces no duplica. */
export async function crearTareasDeLaRutina(projectId: string, persona: TeamMember, ahora = new Date()): Promise<{ creadas: number; hasta: string }> {
  if (!puedeDecidirRecurrencia(persona.roleEnum)) throw new ErrorDelServicio("Lo decide Customer Success.", 403);
  const p = await leerProyecto(projectId);
  if (!p) throw new ErrorDelServicio("El proyecto no existe.", 404);
  const servicio = servicioDe(p);
  if (!servicio) throw new ErrorDelServicio("Este proyecto no es de un servicio recurrente.", 409);
  const hoy = hoyEnCostaRica(ahora);
  const estado = leerRutinas(p.servicioRutinas);
  const arranque = dia(p.servicioDesde) ?? dia(p.createdAt) ?? hoy;
  const ventana = tareasDeLaVentana({ projectId, servicio, arranque, hoy, estado });
  let creadas = 0;
  const contexto = await contextoPara(persona);
  for (const t of ventana.tareas) {
    await crearTareaPara(contexto, p, { titulo: t.titulo, notas: `Rutina de ${servicio.nombre}.`, origenId: t.clave, cuando: t.lunes }, ahora);
    creadas++;
  }
  await guardarRutinas(projectId, { ...estado, tareas: { hasta: ventana.hasta, por: persona.email.toLowerCase(), en: ahora.toISOString() } });
  return { creadas, hasta: ventana.hasta };
}

/** «Ya la agendé»: la persona guardó la reunión fija en su calendario. */
export async function marcarReunionAgendada(projectId: string, persona: TeamMember, clave: string, ahora = new Date()): Promise<void> {
  if (!puedeDecidirRecurrencia(persona.roleEnum)) throw new ErrorDelServicio("Lo decide Customer Success.", 403);
  const p = await leerProyecto(projectId);
  if (!p) throw new ErrorDelServicio("El proyecto no existe.", 404);
  const servicio = servicioDe(p);
  if (!servicio?.reuniones.some((r) => r.clave === clave)) throw new ErrorDelServicio("Esa reunión no es de este servicio.", 400);
  const estado = leerRutinas(p.servicioRutinas);
  await guardarRutinas(projectId, { ...estado, reuniones: { ...estado.reuniones, [clave]: { agendadaAt: ahora.toISOString(), por: persona.email.toLowerCase() } } });
}

/**
 * El alta de un proyecto que nace de una PROPUESTA RECURRENTE ganada (iniciativa 4, paso 4; reemplaza a
 * scripts/cargar-propuesta-en-ciclo.ts): el proyecto queda con su servicio y desde hoy, y con los casos de uso que vendió
 * la propuesta en su plan. La propuesta se busca por su id (el enlace «Dar de alta el servicio») o por el trato, siempre
 * en el mismo cliente. Corre dentro de la transacción del alta. null = no hay una propuesta recurrente que traer.
 *
 * ⛔ La propuesta no se toca: se lee su versión activa. Lo que vio el cliente queda como lo firmó.
 */
export async function servicioQueTraeLaPropuestaEnTx(
  tx: Prisma.TransactionClient,
  d: { clientId: string; projectId: string; dealId: string | null; businessCaseId: string | null; por: string; ahora?: Date },
): Promise<{ servicio: string; casos: number } | null> {
  const where = d.businessCaseId
    ? { id: d.businessCaseId, clientId: d.clientId }
    : d.dealId
      ? { hubspotDealId: d.dealId, clientId: d.clientId, caseType: SERVICIO_RECURRENTE_TYPE_ID }
      : null;
  if (!where) return null;
  const bc = await tx.businessCase.findFirst({ where, orderBy: { createdAt: "desc" }, select: { id: true, name: true, caseType: true, caseSubtype: true, tags: true } });
  if (!bc || !esTipoRecurrente(resolveBcType(bc.caseType))) return null;
  const servicio = servicioDelCatalogo(bc.caseSubtype);
  if (!servicio) return null;
  await tx.project.update({
    where: { id: d.projectId },
    data: {
      servicioRecurrente: servicio.clave,
      servicioDesde: d.ahora ?? new Date(),
      servicioPropuestaId: bc.id,
      // Por el trato, la clasificación ya la propagó el alta; por el enlace de la propuesta, se propaga acá.
      ...(d.businessCaseId && bc.tags.length ? { tags: sanitizeTags(bc.tags) } : {}),
    },
  });
  const canvas = await tx.projectCanvas.findFirst({
    where: { businessCaseId: bc.id, isActive: true, version: { gt: 0 } },
    orderBy: { version: "desc" },
    select: { canvasSections: { where: { key: USE_CASES_SECTION_KEY }, select: { blocks: { orderBy: { order: "asc" }, take: 1, select: { data: true } } } } },
  });
  const casos = casosDeLaPropuesta(canvas?.canvasSections[0]?.blocks[0]?.data);
  const sumados = await sumarCasosDeLaPropuestaEnTx(tx, { clientId: d.clientId, projectId: d.projectId, propuesta: bc.name, casos, por: d.por });
  return { servicio: servicio.clave, casos: sumados };
}
