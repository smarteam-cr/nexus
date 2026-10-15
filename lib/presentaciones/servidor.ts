/**
 * lib/presentaciones/servidor.ts — leer y responder cuándo se le presenta cada documento al cliente. SERVIDOR.
 * Las reglas: ./reglas.ts. La tabla: `PresentacionDeDocumento` (append-only, solo se le agregan filas).
 *
 * Responde SOLO Customer Success: el encargado del proyecto en HubSpot y quien generó el documento, o la CSL si
 * ninguno es de Customer Success (`quienesResponden`). Dirección ve quién respondió y no responde por el CSE.
 */
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { modeloDisponible } from "@/lib/db/esquema";
import { avisar } from "@/lib/para-ti/avisos-server";
import { urlDeProyecto } from "@/lib/agents/run-url";
import { SIN_BUSCAR_LO_NUEVO } from "@/lib/agents/historial-corridas";
import { canvasOfAnyNested, canvasOfNested } from "@/lib/pieces/canvas-query";
import { pieceBySlug, pieceForCanvas } from "@/lib/pieces/registry";
import { CS_CLIENT_WHERE } from "@/lib/clients/kind";
import { NO_ES_CONTENEDOR_WHERE, PROYECTO_DE_PIPELINE_CS_WHERE, proyectoClasificableWhere } from "@/lib/projects/scope";
import { porQueNoSeAvisoAlVendedor, vendedorDeLaEmpresa } from "@/lib/hubspot/vendedor-de-la-empresa";
import { alPresentarDocumento } from "@/lib/tiempos/disparar";
import { esCuentaDePrueba } from "@/lib/documentacion/equipo";
import type { PreguntaParaResponder } from "@/lib/tiempos/tipos";
import { fechaEnPalabras, hoyEnCostaRica, type ReunionDeLaPropuesta } from "@/lib/canvas/presentacion-del-diagnostico";
import {
  aceptaLaPropuesta,
  dijoAhoraNo,
  documentoDeLaPieza,
  DOCUMENTOS_QUE_SE_PRESENTAN,
  estadoDeLaPresentacion,
  filaDeLaAccion,
  motivoParaResponder,
  PIEZA_DEL_DOCUMENTO,
  pidePregunta,
  plegar,
  porQueNoSePuede,
  quienesResponden,
  type AccionDePresentacion,
  type Documento,
  type EstadoDeLaPresentacion,
  type FilaDePresentacion,
  type MotivoParaResponder,
  type PersonaDelEquipo,
  type Presentacion,
} from "./reglas";

export const SQL_DE_PRESENTACIONES = "scripts/sql/2026-10-14-presentaciones-de-documentos.sql";

export function presentacionesDisponible(): boolean {
  return modeloDisponible(prisma.presentacionDeDocumento);
}

export class ErrorDePresentacion extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const SELECT_FILA = { evento: true, fecha: true, porEmail: true, sessionId: true, detalle: true, createdAt: true } as const;

/* ── Cargar ────────────────────────────────────────────────────────────────────────── */

interface DocumentoCargado {
  documento: Documento;
  canvasId: string;
  hayContenido: boolean;
  /** El diagnóstico ya se marcó «Presentado» o «Aprobado» en su estado. */
  presentadoFormal: boolean;
  generador: string | null;
  /** AAAA-MM-DD de la última vez que se generó (la última corrida terminada; sin corrida, el último cambio del canvas). */
  generadoEn: string | null;
  filas: FilaDePresentacion[];
}

interface ProyectoCargado {
  id: string;
  name: string;
  clientId: string;
  empresa: string;
  encargado: string | null;
  documentos: Map<Documento, DocumentoCargado>;
}

interface Carga {
  proyectos: Map<string, ProyectoCargado>;
  personas: Map<string, PersonaDelEquipo & { nombre: string }>;
  lideres: PersonaDelEquipo[];
}

/** Todo lo que hace falta para decir el estado y quién responde, de varios proyectos a la vez. */
async function cargar(projectIds: readonly string[]): Promise<Carga> {
  const ids = [...new Set(projectIds)];
  const vacio: Carga = { proyectos: new Map(), personas: new Map(), lideres: [] };
  if (ids.length === 0) return vacio;
  const piezas = DOCUMENTOS_QUE_SE_PRESENTAN.map((d) => PIEZA_DEL_DOCUMENTO[d]);
  const grupos = piezas.map((s) => pieceBySlug(s)?.agentGroup).filter((g): g is string => !!g);

  const [proyectos, canvases, corridas, filas] = await Promise.all([
    prisma.project.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, clientId: true, hubspotOwnerEmail: true, client: { select: { name: true } } },
    }),
    prisma.projectCanvas.findMany({
      where: canvasOfAnyNested(piezas, { projectId: { in: ids } }),
      select: {
        id: true,
        projectId: true,
        slug: true,
        name: true,
        estadoDocumento: true,
        updatedAt: true,
        canvasSections: { where: { key: { not: "cierre" }, blocks: { some: {} } }, select: { id: true }, take: 1 },
      },
    }),
    prisma.agentRun.findMany({
      where: {
        projectId: { in: ids },
        status: "DONE",
        agent: { agentGroup: { in: grupos } },
        ...SIN_BUSCAR_LO_NUEVO,
      },
      orderBy: { createdAt: "desc" },
      select: { projectId: true, triggeredByEmail: true, createdAt: true, agent: { select: { agentGroup: true } } },
    }),
    prisma.presentacionDeDocumento.findMany({
      where: { projectId: { in: ids } },
      orderBy: { createdAt: "asc" },
      select: { ...SELECT_FILA, projectId: true, documento: true },
    }),
  ]);

  // Las corridas vienen de la más nueva a la más vieja: la primera de cada documento es la última generación, y la
  // primera con persona es quien lo generó (una corrida del sistema no tiene a quién preguntarle).
  const generadores = new Map<string, string>();
  const generados = new Map<string, Date>();
  for (const r of corridas) {
    const doc = DOCUMENTOS_QUE_SE_PRESENTAN.find((d) => pieceBySlug(PIEZA_DEL_DOCUMENTO[d])?.agentGroup === r.agent?.agentGroup);
    if (!doc) continue;
    const k = `${r.projectId}:${doc}`;
    if (!generados.has(k)) generados.set(k, r.createdAt);
    if (r.triggeredByEmail && !generadores.has(k)) generadores.set(k, r.triggeredByEmail.toLowerCase());
  }

  const out = new Map<string, ProyectoCargado>();
  for (const p of proyectos) {
    out.set(p.id, {
      id: p.id,
      name: p.name,
      clientId: p.clientId,
      empresa: p.client?.name ?? p.name,
      encargado: p.hubspotOwnerEmail?.toLowerCase() ?? null,
      documentos: new Map(),
    });
  }
  for (const c of canvases) {
    const doc = documentoDeLaPieza(pieceForCanvas({ slug: c.slug, name: c.name })?.slug);
    const p = c.projectId ? out.get(c.projectId) : undefined;
    if (!doc || !p || p.documentos.has(doc)) continue;
    p.documentos.set(doc, {
      documento: doc,
      canvasId: c.id,
      hayContenido: c.canvasSections.length > 0,
      presentadoFormal: doc === "diagnostico" && (c.estadoDocumento === "presentado" || c.estadoDocumento === "aprobado"),
      generador: generadores.get(`${p.id}:${doc}`) ?? null,
      generadoEn: hoyEnCostaRica(generados.get(`${p.id}:${doc}`) ?? c.updatedAt),
      filas: [],
    });
  }
  for (const f of filas) {
    const d = f.projectId ? out.get(f.projectId)?.documentos.get(f.documento as Documento) : undefined;
    if (d) d.filas.push(f);
  }

  const emails = new Set<string>();
  for (const p of out.values()) {
    if (p.encargado) emails.add(p.encargado);
    for (const d of p.documentos.values()) {
      if (d.generador) emails.add(d.generador);
      for (const f of d.filas) if (f.porEmail) emails.add(f.porEmail.toLowerCase());
    }
  }
  const miembros = await prisma.teamMember.findMany({
    where: { OR: [{ email: { in: [...emails] } }, { roleEnum: "CSL" }] },
    select: { email: true, name: true, roleEnum: true, deactivatedAt: true },
  });
  // Una cuenta de prueba («Test CSE (vista Heiver)») no es una persona del equipo: no se le pregunta.
  const personas = new Map(
    miembros.map((m) => [
      m.email.toLowerCase(),
      { email: m.email.toLowerCase(), nombre: m.name, rol: m.roleEnum, activa: !m.deactivatedAt && !esCuentaDePrueba(m.name) },
    ]),
  );
  const lideres = [...personas.values()].filter((m) => m.rol === "CSL" && m.activa);
  return { proyectos: out, personas, lideres };
}

/* ── La vista de un documento ──────────────────────────────────────────────────────── */

export interface VistaDeLaPresentacion {
  documento: Documento;
  projectId: string;
  empresa: string;
  proyecto: string;
  hayContenido: boolean;
  presentacion: Presentacion;
  estado: EstadoDeLaPresentacion;
  hoy: string;
  /** Hay algo que preguntarle a Customer Success. */
  pide: boolean;
  /** A quién se le pregunta, con su nombre. */
  responden: { email: string; nombre: string; motivo: MotivoParaResponder }[];
  /** Si la persona que mira puede responder, y por qué. null = no responde. */
  tuMotivo: MotivoParaResponder | null;
  /** La persona que mira dijo «Ahora no» hace poco: la tarjeta no sale sola. */
  dijisteAhoraNo: boolean;
  /** Nombres de quienes respondieron algo, para la línea del documento. */
  nombres: Record<string, string>;
}

function vista(c: Carga, p: ProyectoCargado, d: DocumentoCargado, yo: { email: string; rol: string | null }, ahora: Date): VistaDeLaPresentacion {
  const hoy = hoyEnCostaRica(ahora);
  const presentacion = plegar(d.filas);
  const estado = estadoDeLaPresentacion(presentacion, hoy, { documento: d.documento, presentadoFormal: d.presentadoFormal });
  const persona = (email: string | null) => (email ? (c.personas.get(email) ?? null) : null);
  const responden = quienesResponden({ encargado: persona(p.encargado), generador: persona(d.generador), lideres: c.lideres });
  const nombre = (email: string) => c.personas.get(email)?.nombre ?? email;
  const nombres: Record<string, string> = {};
  for (const f of d.filas) if (f.porEmail) nombres[f.porEmail.toLowerCase()] = nombre(f.porEmail.toLowerCase());
  return {
    documento: d.documento,
    projectId: p.id,
    empresa: p.empresa,
    proyecto: p.name,
    hayContenido: d.hayContenido,
    presentacion,
    estado,
    hoy,
    pide: d.hayContenido && pidePregunta(presentacion, estado, hoy, d.generadoEn),
    responden: responden.map((r) => ({ ...r, nombre: nombre(r.email) })),
    tuMotivo: motivoParaResponder(yo, responden),
    dijisteAhoraNo: dijoAhoraNo(d.filas, yo.email, ahora),
    nombres,
  };
}

/** El estado de un documento, para la persona que mira. null = el proyecto no tiene ese documento. */
export async function vistaDeLaPresentacion(
  projectId: string,
  documento: Documento,
  yo: { email: string; rol: string | null },
  ahora = new Date(),
): Promise<VistaDeLaPresentacion | null> {
  const c = await cargar([projectId]);
  const p = c.proyectos.get(projectId);
  const d = p?.documentos.get(documento);
  return p && d ? vista(c, p, d, yo, ahora) : null;
}

/* ── Responder ─────────────────────────────────────────────────────────────────────── */

export interface ResultadoDelAvisoAlVendedor {
  avisado: boolean;
  /** A quién se le avisó (nombre). */
  vendedor: string | null;
  /** Si no se le pudo avisar, por qué (se le dice al CSE). */
  motivo: string | null;
}

/** El aviso al vendedor dueño de la empresa en HubSpot: «el diagnóstico está listo, revísalo antes de presentarlo». */
async function avisarAlVendedor(projectId: string, fecha: string, actorEmail: string): Promise<ResultadoDelAvisoAlVendedor> {
  const proyecto = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, clientId: true, client: { select: { name: true } } },
  });
  if (!proyecto) return { avisado: false, vendedor: null, motivo: null };
  const [vendedor, canvas] = await Promise.all([
    vendedorDeLaEmpresa(proyecto.clientId),
    prisma.projectCanvas.findFirst({ where: canvasOfNested("diagnosis", { projectId }), select: { id: true } }),
  ]);
  if (!vendedor.ok) return { avisado: false, vendedor: null, motivo: porQueNoSeAvisoAlVendedor(vendedor.motivo) };
  if (vendedor.email.toLowerCase() === actorEmail.toLowerCase()) {
    return { avisado: false, vendedor: vendedor.nombre, motivo: "Tú eres el vendedor de esta empresa en HubSpot: no te mandamos un aviso a ti." };
  }
  // El mismo aviso de la misma fecha ya le llegó: no se repite, y se dice que ya lo tiene.
  const dedupeKey = `diagnostico.listo:${projectId}:${fecha}`;
  const yaLoTiene = await prisma.aviso
    .findUnique({ where: { paraEmail_dedupeKey: { paraEmail: vendedor.email.toLowerCase(), dedupeKey } }, select: { id: true } })
    .catch(() => null);
  if (yaLoTiene) return { avisado: true, vendedor: vendedor.nombre, motivo: null };
  const n = await avisar({
    para: vendedor.email,
    tipo: "diagnostico.listo",
    titulo: `El diagnóstico de ${proyecto.client?.name ?? proyecto.name} está listo`,
    detalle: `Se presenta el ${fechaEnPalabras(fecha)}. Revísalo antes de la presentación.`,
    href: urlDeProyecto(proyecto.clientId, projectId, canvas?.id ?? null),
    actorEmail,
    dedupeKey,
  });
  return { avisado: n > 0, vendedor: vendedor.nombre, motivo: n > 0 ? null : "No se pudo escribir el aviso al vendedor." };
}

/**
 * Lo que respondió la persona: una fila nueva. Solo Customer Success (403 si no). «Está listo» avisa al vendedor
 * (solo el diagnóstico); «Ya lo presenté» pregunta cuánto tomó, si esa pregunta está activa.
 */
export async function responderPresentacion(
  projectId: string,
  documento: Documento,
  accion: AccionDePresentacion,
  yo: { email: string; rol: string | null },
  ahora = new Date(),
): Promise<{ vista: VistaDeLaPresentacion; aviso: ResultadoDelAvisoAlVendedor | null; preguntaDeTiempo: PreguntaParaResponder | null }> {
  const c = await cargar([projectId]);
  const p = c.proyectos.get(projectId);
  const d = p?.documentos.get(documento);
  if (!p || !d) throw new ErrorDePresentacion(404, "Este proyecto no tiene ese documento.");
  const antes = vista(c, p, d, yo, ahora);
  if (!antes.tuMotivo) {
    const quienes = antes.responden.map((r) => r.nombre).join(" o ");
    throw new ErrorDePresentacion(403, `Esto lo responde Customer Success${quienes ? `: ${quienes}` : ""}.`);
  }
  const no = porQueNoSePuede(accion, antes.presentacion, documento, antes.hoy);
  if (no) throw new ErrorDePresentacion(409, no);

  const fila = filaDeLaAccion(accion, antes.presentacion);
  let aviso: ResultadoDelAvisoAlVendedor | null = null;
  // El aviso va antes de la fila: así la fila guarda qué pasó con él. No se repite (dedupe por fecha).
  if (fila.evento === "listo" && fila.fecha) aviso = await avisarAlVendedor(projectId, fila.fecha, yo.email);
  const detalle = fila.evento === "listo" ? { aviso: aviso ? { para: aviso.avisado ? aviso.vendedor : null, motivo: aviso.motivo } : null } : fila.detalle;

  await prisma.presentacionDeDocumento.create({
    data: {
      projectId,
      proyectoNombre: p.name,
      clientNombre: p.empresa,
      documento,
      evento: fila.evento,
      fecha: fila.fecha,
      porEmail: yo.email.toLowerCase(),
      rol: yo.rol,
      motivo: antes.tuMotivo,
      detalle: detalle ? (detalle as Prisma.InputJsonValue) : Prisma.DbNull,
    },
  });

  const preguntaDeTiempo =
    fila.evento === "presentado" && fila.fecha
      ? await alPresentarDocumento({ email: yo.email, projectId, documento, enPalabras: fechaEnPalabras(fila.fecha), ahora })
      : null;

  const despues = await vistaDeLaPresentacion(projectId, documento, yo, ahora);
  return { vista: despues ?? antes, aviso, preguntaDeTiempo };
}

/* ── Lo que lee Nexus en una reunión (solo el diagnóstico) ─────────────────────────── */

/**
 * La fecha que leyó Nexus en una reunión (desde la lectura de cada reunión). Nunca lanza: si no se pudo guardar, la
 * reunión sigue procesándose igual.
 */
export async function proponerFechaDesdeReunion(
  projectId: string,
  propuesta: { fecha: string; cita: string; reunion: ReunionDeLaPropuesta },
): Promise<boolean> {
  try {
    if (!presentacionesDisponible()) return false;
    const [proyecto, filas] = await Promise.all([
      prisma.project.findUnique({ where: { id: projectId }, select: { name: true, client: { select: { name: true } } } }),
      prisma.presentacionDeDocumento.findMany({ where: { projectId, documento: "diagnostico" }, select: SELECT_FILA }),
    ]);
    if (!proyecto || !aceptaLaPropuesta(plegar(filas), propuesta.fecha) || !propuesta.cita.trim()) return false;
    await prisma.presentacionDeDocumento.create({
      data: {
        projectId,
        proyectoNombre: proyecto.name,
        clientNombre: proyecto.client?.name ?? null,
        documento: "diagnostico",
        evento: "propuesta",
        fecha: propuesta.fecha,
        porEmail: null,
        sessionId: propuesta.reunion.id,
        detalle: { cita: propuesta.cita.trim().slice(0, 600), reunion: propuesta.reunion } as unknown as Prisma.InputJsonValue,
      },
    });
    return true;
  } catch (e) {
    console.error(`[presentaciones] no se pudo guardar la fecha propuesta de ${projectId}: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

/** ¿Este proyecto tiene un diagnóstico generado que todavía no se presentó? (para buscar la fecha en la reunión) */
export async function diagnosticoSinPresentar(projectId: string): Promise<boolean> {
  const canvas = await prisma.projectCanvas.findFirst({
    where: canvasOfNested("diagnosis", { projectId }),
    select: { estadoDocumento: true, canvasSections: { where: { key: { not: "cierre" }, blocks: { some: {} } }, select: { id: true }, take: 1 } },
  });
  if (!canvas || canvas.canvasSections.length === 0) return false;
  if (canvas.estadoDocumento === "presentado" || canvas.estadoDocumento === "aprobado") return false;
  if (!presentacionesDisponible()) return true;
  const presentado = await prisma.presentacionDeDocumento
    .findFirst({ where: { projectId, documento: "diagnostico", evento: "presentado" }, select: { id: true } })
    .catch(() => null);
  if (!presentado) return true;
  // Se presentó, pero quizás después se puso otra fecha (una segunda presentación): lo dice el estado.
  const filas = await prisma.presentacionDeDocumento.findMany({ where: { projectId, documento: "diagnostico" }, select: SELECT_FILA });
  return !plegar(filas).presentado;
}

/* ── «Para ti»: lo que te toca responder ───────────────────────────────────────────── */

export interface PresentacionQueTeToca {
  vista: VistaDeLaPresentacion;
  clientId: string;
  canvasId: string;
  href: string;
}

/**
 * Los documentos que te toca responder: los de los proyectos donde eres el encargado o generaste el documento, y —si
 * eres la CSL— los que no tienen a nadie de Customer Success. Solo CSE y CSL.
 */
export async function presentacionesQueTeTocan(
  yo: { email: string; rol: string },
  proyectosPropios: readonly string[],
  ahora = new Date(),
): Promise<PresentacionQueTeToca[]> {
  if (!presentacionesDisponible() || !["CSE", "CSL"].includes(yo.rol)) return [];
  const email = yo.email.toLowerCase();
  const generados = await prisma.agentRun.findMany({
    where: {
      triggeredByEmail: { equals: email, mode: "insensitive" },
      status: "DONE",
      projectId: { not: null },
      agent: { agentGroup: { in: DOCUMENTOS_QUE_SE_PRESENTAN.map((d) => pieceBySlug(PIEZA_DEL_DOCUMENTO[d])?.agentGroup ?? "") } },
      createdAt: { gte: new Date(ahora.getTime() - 365 * 86_400_000) },
    },
    distinct: ["projectId"],
    select: { projectId: true },
  });
  const deLaCSL =
    yo.rol === "CSL"
      ? await prisma.project.findMany({
          where: proyectoClasificableWhere({ AND: [PROYECTO_DE_PIPELINE_CS_WHERE, NO_ES_CONTENEDOR_WHERE, { client: CS_CLIENT_WHERE }] }),
          select: { id: true },
        })
      : [];
  // Lo generado: solo de proyectos abiertos de la cartera (un proyecto cerrado no pide nada).
  const abiertos = generados.length
    ? await prisma.project.findMany({
        where: proyectoClasificableWhere({
          AND: [PROYECTO_DE_PIPELINE_CS_WHERE, NO_ES_CONTENEDOR_WHERE, { id: { in: generados.map((g) => g.projectId!) } }],
        }),
        select: { id: true },
      })
    : [];
  const ids = [...new Set([...proyectosPropios, ...abiertos.map((p) => p.id), ...deLaCSL.map((p) => p.id)])];
  const c = await cargar(ids);
  const out: PresentacionQueTeToca[] = [];
  for (const p of c.proyectos.values()) {
    for (const d of p.documentos.values()) {
      if (!d.hayContenido) continue;
      const v = vista(c, p, d, { email, rol: yo.rol }, ahora);
      // Solo a quien se le pregunta: la CSL ve acá lo que no tiene a nadie más, no todo lo de la cartera.
      if (!v.responden.some((r) => r.email === email)) continue;
      const propuestaPendiente = d.documento === "diagnostico" && !!v.presentacion.propuesta && v.estado !== "presentado";
      if (!v.pide && !propuestaPendiente) continue;
      out.push({ vista: v, clientId: p.clientId, canvasId: d.canvasId, href: urlDeProyecto(p.clientId, p.id, d.canvasId) });
    }
  }
  return out;
}

/* ── Lo que se exporta y se mira en Feedback ───────────────────────────────────────── */

export interface FilaDeLaLista {
  id: string;
  createdAt: string;
  documento: Documento;
  evento: string;
  fecha: string | null;
  projectId: string | null;
  clientId: string | null;
  proyecto: string;
  empresa: string | null;
  porEmail: string | null;
  nombre: string | null;
  rol: string | null;
  motivo: string | null;
}

/** Las últimas respuestas, para la lista de Feedback › Encuestas › Automáticas (sin las «Ahora no»). */
export async function ultimasRespuestas(limite = 60): Promise<FilaDeLaLista[]> {
  const filas = await prisma.presentacionDeDocumento.findMany({
    where: { evento: { not: "ahora-no" } },
    orderBy: { createdAt: "desc" },
    take: limite,
    select: {
      id: true,
      createdAt: true,
      documento: true,
      evento: true,
      fecha: true,
      projectId: true,
      proyectoNombre: true,
      clientNombre: true,
      porEmail: true,
      rol: true,
      motivo: true,
      project: { select: { clientId: true } },
    },
  });
  const emails = [...new Set(filas.map((f) => f.porEmail?.toLowerCase()).filter((e): e is string => !!e))];
  const miembros = emails.length ? await prisma.teamMember.findMany({ where: { email: { in: emails } }, select: { email: true, name: true } }) : [];
  const nombre = new Map(miembros.map((m) => [m.email.toLowerCase(), m.name]));
  return filas.map((f) => ({
    id: f.id,
    createdAt: f.createdAt.toISOString(),
    documento: f.documento as Documento,
    evento: f.evento,
    fecha: f.fecha,
    projectId: f.projectId,
    clientId: f.project?.clientId ?? null,
    proyecto: f.proyectoNombre,
    empresa: f.clientNombre,
    porEmail: f.porEmail,
    nombre: f.porEmail ? (nombre.get(f.porEmail.toLowerCase()) ?? f.porEmail) : null,
    rol: f.rol,
    motivo: f.motivo,
  }));
}

/** Todas las filas, para el CSV. */
export async function filasParaExportar() {
  return prisma.presentacionDeDocumento.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      ...SELECT_FILA,
      documento: true,
      projectId: true,
      proyectoNombre: true,
      clientNombre: true,
      rol: true,
      motivo: true,
    },
  });
}
