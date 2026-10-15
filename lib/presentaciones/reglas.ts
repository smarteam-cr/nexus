/**
 * lib/presentaciones/reglas.ts — CUÁNDO SE LE PRESENTA CADA DOCUMENTO AL CLIENTE, Y QUIÉN LO RESPONDE. PURO y
 * client-safe.
 *
 * Pedido de Elías (2026-10-14), sobre la pregunta del diagnóstico del 2026-10-07: la pregunta es de los cuatro
 * documentos que se presentan (kickoff, diagnóstico, planificación y entrega), la responde SOLO Customer Success —el
 * encargado del proyecto o quien generó el documento—, se puede decir «Ya lo presenté», y queda registrado quién
 * respondió cada cosa.
 *
 * Cada respuesta es una fila de `PresentacionDeDocumento` (append-only): una fecha, «Todavía no sé», «Ya lo presenté»,
 * «Está listo» (solo el diagnóstico, que avisa al vendedor), «Ahora no», y la fecha que leyó Nexus en una reunión (solo
 * el diagnóstico). El estado de un documento es `plegar` sobre sus filas en orden: nada se guarda dos veces.
 *
 * Las fechas son AAAA-MM-DD, el día en Costa Rica; la cuenta de días se hace a mano, sin zonas horarias.
 */
import { DOCUMENTOS, type Documento } from "@/lib/tiempos/reglas";
import { diasEntre, esFecha, fechaEnPalabras, type ReunionDeLaPropuesta } from "@/lib/canvas/presentacion-del-diagnostico";

export type { Documento };

/* ── Los documentos ────────────────────────────────────────────────────────────────── */

/** Los cuatro documentos que se presentan, en el orden del proyecto (los mismos que pregunta «¿cuánto te tomó?»). */
export const DOCUMENTOS_QUE_SE_PRESENTAN: readonly Documento[] = DOCUMENTOS.map((d) => d.clave);

/** La pieza del riel (lib/pieces/registry.ts) de cada documento. */
export const PIEZA_DEL_DOCUMENTO: Readonly<Record<Documento, string>> = {
  kickoff: "kickoff",
  diagnostico: "diagnosis",
  planificacion: "planning",
  entrega: "delivery",
};

export function documentoDeLaPieza(slug: string | null | undefined): Documento | null {
  const d = (Object.keys(PIEZA_DEL_DOCUMENTO) as Documento[]).find((k) => PIEZA_DEL_DOCUMENTO[k] === slug);
  return d ?? null;
}

export function esDocumento(v: unknown): v is Documento {
  return typeof v === "string" && (DOCUMENTOS_QUE_SE_PRESENTAN as readonly string[]).includes(v);
}

/** «el diagnóstico», «la planificación»… y el pronombre para «¿Cuándo lo presentas?». */
const PALABRAS: Record<Documento, { el: string; lo: "lo" | "la"; nombre: string }> = {
  kickoff: { el: "el kickoff", lo: "lo", nombre: "Kickoff" },
  diagnostico: { el: "el diagnóstico", lo: "lo", nombre: "Diagnóstico" },
  planificacion: { el: "la planificación", lo: "la", nombre: "Planificación" },
  entrega: { el: "la entrega", lo: "la", nombre: "Entrega" },
};

export const elDocumento = (d: Documento) => PALABRAS[d].el;
export const loDocumento = (d: Documento) => PALABRAS[d].lo;
export const nombreDelDocumento = (d: Documento) => PALABRAS[d].nombre;

/* ── Las filas ─────────────────────────────────────────────────────────────────────── */

export const EVENTOS = ["fecha", "sin-fecha", "presentado", "listo", "propuesta", "descarte", "ahora-no"] as const;
export type EventoDePresentacion = (typeof EVENTOS)[number];

/** Por qué le toca responder a alguien: es el encargado del proyecto, generó el documento, o es la CSL. */
export type MotivoParaResponder = "encargado" | "genero" | "lider";

export const MOTIVO_EN_PALABRAS: Record<MotivoParaResponder, string> = {
  encargado: "encargado del proyecto",
  genero: "generó el documento",
  lider: "líder de Customer Success",
};

export interface FilaDePresentacion {
  evento: EventoDePresentacion | string;
  fecha: string | null;
  porEmail: string | null;
  sessionId?: string | null;
  detalle?: unknown;
  createdAt: Date | string;
}

/** Lo que guarda `detalle` según el evento. Se lee tolerante: una fila vieja o rara no rompe nada. */
export interface DetalleDeFecha {
  /** La fecha salió de la propuesta de esta reunión («Usar»). */
  deLaPropuesta?: string;
  fuente?: string;
}
export interface DetalleDePropuesta {
  cita: string;
  reunion: ReunionDeLaPropuesta;
}
export interface DetalleDeListo {
  aviso?: { para: string | null; motivo: string | null };
}

const texto = (v: unknown, max = 600): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : new Date(v).toISOString());

export function leerDetalleDePropuesta(detalle: unknown, sessionId: string | null | undefined): DetalleDePropuesta | null {
  const o = obj(detalle);
  const r = obj(o?.reunion);
  const cita = texto(o?.cita);
  const id = texto(r?.id, 200) || texto(sessionId, 200);
  if (!cita || !id || !esFecha(r?.fecha)) return null;
  return { cita, reunion: { id, titulo: texto(r?.titulo, 200) || null, fecha: r!.fecha as string } };
}

function leerDetalleDeFecha(detalle: unknown): DetalleDeFecha {
  const o = obj(detalle);
  const deLaPropuesta = texto(o?.deLaPropuesta, 200);
  const fuente = texto(o?.fuente);
  return { ...(deLaPropuesta ? { deLaPropuesta } : {}), ...(fuente ? { fuente } : {}) };
}

function leerAviso(detalle: unknown): { para: string | null; motivo: string | null } | null {
  const a = obj(obj(detalle)?.aviso);
  if (!a) return null;
  return { para: texto(a.para, 200) || null, motivo: texto(a.motivo, 400) || null };
}

/* ── El estado ─────────────────────────────────────────────────────────────────────── */

export interface Presentacion {
  /** La fecha planeada que fijó una persona. */
  fecha: string | null;
  fijadaPor: string | null;
  fijadaEn: string | null;
  /** De dónde salió la fecha fijada, si salió de una reunión. */
  fuente: string | null;
  /** «Todavía no sé». */
  sinFecha: { por: string; en: string } | null;
  /** Lo que leyó Nexus en una reunión, esperando que alguien lo use o lo descarte (solo el diagnóstico). */
  propuesta: { fecha: string; cita: string; reunion: ReunionDeLaPropuesta; en: string } | null;
  /** Fechas propuestas que alguien descartó: no se vuelven a proponer. */
  descartadas: string[];
  /** Diagnóstico: terminado y con la fecha reconfirmada (avisa al vendedor). Vale para SU fecha. */
  listo: { fecha: string; por: string; en: string } | null;
  /** El aviso al vendedor de ese «listo». */
  aviso: { para: string | null; motivo: string | null } | null;
  /** «Ya lo presenté», con el día real. */
  presentado: { fecha: string; por: string; en: string } | null;
  /** La última respuesta de una persona (no cuentan lo que leyó Nexus ni «Ahora no»). */
  ultima: { evento: EventoDePresentacion; por: string; en: string } | null;
}

export function presentacionVacia(): Presentacion {
  return {
    fecha: null,
    fijadaPor: null,
    fijadaEn: null,
    fuente: null,
    sinFecha: null,
    propuesta: null,
    descartadas: [],
    listo: null,
    aviso: null,
    presentado: null,
    ultima: null,
  };
}

function fijar(p: Presentacion, fecha: string, por: string, en: string, fuente: string | null): void {
  p.fecha = fecha;
  p.fijadaPor = por;
  p.fijadaEn = en;
  p.fuente = fuente;
  p.sinFecha = null;
  p.presentado = null;
  if (p.propuesta?.fecha === fecha) p.propuesta = null;
  if (p.listo?.fecha !== fecha) {
    p.listo = null;
    p.aviso = null;
  }
}

/** Las filas de UN documento, en orden: lo que vale hoy. Lo que no se entiende se salta. */
export function plegar(filas: readonly FilaDePresentacion[]): Presentacion {
  const p = presentacionVacia();
  const ordenadas = [...filas].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  for (const f of ordenadas) {
    const en = iso(f.createdAt);
    const por = (f.porEmail ?? "").toLowerCase();
    const fecha = esFecha(f.fecha) ? f.fecha : null;
    switch (f.evento) {
      case "propuesta": {
        const d = leerDetalleDePropuesta(f.detalle, f.sessionId);
        if (!fecha || !d || p.presentado || p.fecha === fecha || p.descartadas.includes(fecha)) break;
        p.propuesta = { fecha, cita: d.cita, reunion: d.reunion, en };
        break;
      }
      case "fecha": {
        if (!fecha) break;
        const d = leerDetalleDeFecha(f.detalle);
        fijar(p, fecha, por, en, d.fuente ?? null);
        break;
      }
      case "sin-fecha":
        p.fecha = null;
        p.fijadaPor = null;
        p.fijadaEn = null;
        p.fuente = null;
        p.sinFecha = { por, en };
        p.listo = null;
        p.aviso = null;
        p.presentado = null;
        break;
      case "descarte":
        if (!fecha) break;
        if (p.propuesta?.fecha === fecha) p.propuesta = null;
        if (!p.descartadas.includes(fecha)) p.descartadas = [...p.descartadas, fecha];
        break;
      case "listo":
        if (!fecha) break;
        if (p.fecha !== fecha) fijar(p, fecha, por, en, null);
        p.listo = { fecha, por, en };
        p.aviso = leerAviso(f.detalle);
        break;
      case "presentado":
        if (!fecha) break;
        p.presentado = { fecha, por, en };
        p.propuesta = null;
        break;
      default:
        break;
    }
    if (por && f.evento !== "ahora-no" && f.evento !== "propuesta" && (EVENTOS as readonly string[]).includes(f.evento)) {
      p.ultima = { evento: f.evento as EventoDePresentacion, por, en };
    }
  }
  return p;
}

/** Desde cuántos días antes de la fecha se le pide a la persona confirmar que el diagnóstico está terminado. */
export const DIAS_ANTES_DE_RECONFIRMAR = 2;
/** «Todavía no sé» vuelve a preguntarse pasados estos días, como el «No sé» de las preguntas sobre la cuenta. */
export const DIAS_PARA_VOLVER_SIN_FECHA = 7;
/** «Ahora no» calla la tarjeta este tiempo (la línea del documento y «Para ti» siguen). */
export const HORAS_DE_AHORA_NO = 20;
/**
 * Un documento sin respuesta se pregunta solo si se generó hace menos de esto. Medido el 2026-10-14: sin este tope, a un
 * CSE le llegaban más de 30 pendientes por kickoffs de hace meses, que ya se presentaron.
 */
export const DIAS_PARA_PREGUNTAR_SIN_RESPUESTA = 30;

export type EstadoDeLaPresentacion =
  | "sin-responder"
  | "sin-fecha"
  | "con-fecha"
  | "por-reconfirmar"
  | "listo"
  | "paso-la-fecha"
  | "presentado";

/**
 * El estado de un documento hoy. `presentadoFormal` = el diagnóstico ya se marcó «Presentado» en su estado
 * (lib/canvas/estado-del-documento.ts): ahí no hay nada que preguntar.
 */
export function estadoDeLaPresentacion(
  p: Presentacion,
  hoy: string,
  opciones: { documento: Documento; presentadoFormal?: boolean },
): EstadoDeLaPresentacion {
  if (p.presentado || opciones.presentadoFormal) return "presentado";
  if (p.fecha) {
    const faltan = diasEntre(hoy, p.fecha);
    if (faltan < 0) return "paso-la-fecha";
    if (opciones.documento === "diagnostico") {
      if (p.listo?.fecha === p.fecha) return "listo";
      if (faltan <= DIAS_ANTES_DE_RECONFIRMAR) return "por-reconfirmar";
    }
    return "con-fecha";
  }
  return p.sinFecha ? "sin-fecha" : "sin-responder";
}

/**
 * ¿Hay que preguntarle algo a Customer Success? `generadoEn` = cuándo se generó el documento por última vez (AAAA-MM-DD):
 * sin respuesta, se pregunta solo si es reciente.
 */
export function pidePregunta(p: Presentacion, estado: EstadoDeLaPresentacion, hoy: string, generadoEn: string | null): boolean {
  if (estado === "por-reconfirmar" || estado === "paso-la-fecha") return true;
  if (estado === "sin-responder") return !!generadoEn && diasEntre(generadoEn, hoy) <= DIAS_PARA_PREGUNTAR_SIN_RESPUESTA;
  if (estado === "sin-fecha" && p.sinFecha) return diasEntre(p.sinFecha.en.slice(0, 10), hoy) >= DIAS_PARA_VOLVER_SIN_FECHA;
  return false;
}

/** ¿Esta persona dijo «Ahora no» hace poco? Calla solo la tarjeta. */
export function dijoAhoraNo(filas: readonly FilaDePresentacion[], email: string, ahora: Date): boolean {
  const yo = email.toLowerCase();
  const desde = ahora.getTime() - HORAS_DE_AHORA_NO * 3_600_000;
  return filas.some((f) => f.evento === "ahora-no" && (f.porEmail ?? "").toLowerCase() === yo && new Date(f.createdAt).getTime() >= desde);
}

/* ── Quién responde ────────────────────────────────────────────────────────────────── */

/** Solo Customer Success responde. */
export const ROLES_QUE_RESPONDEN: readonly string[] = ["CSE", "CSL"];

export interface PersonaDelEquipo {
  email: string;
  rol: string;
  /** De alta en Nexus (sin `deactivatedAt`). */
  activa: boolean;
}

export interface QuienResponde {
  email: string;
  motivo: MotivoParaResponder;
}

const respondeSiEsDeCS = (p: PersonaDelEquipo | null): p is PersonaDelEquipo => !!p && p.activa && ROLES_QUE_RESPONDEN.includes(p.rol);

/**
 * A quién se le pregunta: el encargado del proyecto en HubSpot y quien generó el documento, si son de Customer Success
 * y siguen en el equipo. Si ninguno lo es, la CSL.
 */
export function quienesResponden(args: {
  encargado: PersonaDelEquipo | null;
  generador: PersonaDelEquipo | null;
  lideres: readonly PersonaDelEquipo[];
}): QuienResponde[] {
  const out: QuienResponde[] = [];
  if (respondeSiEsDeCS(args.encargado)) out.push({ email: args.encargado.email.toLowerCase(), motivo: "encargado" });
  if (respondeSiEsDeCS(args.generador) && !out.some((r) => r.email === args.generador!.email.toLowerCase())) {
    out.push({ email: args.generador.email.toLowerCase(), motivo: "genero" });
  }
  if (out.length > 0) return out;
  return args.lideres
    .filter((l) => l.activa && l.rol === "CSL")
    .map((l) => ({ email: l.email.toLowerCase(), motivo: "lider" as const }));
}

/**
 * ¿Puede responder esta persona, y por qué? A quien se le pregunta, sí; la CSL, siempre (lidera al equipo). Nadie más:
 * dirección ve la línea del documento con quién respondió, pero no responde por el CSE.
 */
export function motivoParaResponder(persona: { email: string; rol: string | null }, responden: readonly QuienResponde[]): MotivoParaResponder | null {
  const yo = persona.email.toLowerCase();
  const r = responden.find((x) => x.email === yo);
  if (r) return r.motivo;
  return persona.rol === "CSL" ? "lider" : null;
}

/* ── Las acciones ──────────────────────────────────────────────────────────────────── */

export type AccionDePresentacion =
  | { accion: "fecha"; fecha: string }
  | { accion: "sin-fecha" }
  | { accion: "presentado"; fecha: string }
  | { accion: "listo"; fecha: string }
  | { accion: "usar-propuesta" }
  | { accion: "descartar-propuesta" }
  | { accion: "ahora-no" };

/** Por qué no se puede hacer esto ahora. null = se puede. */
export function porQueNoSePuede(a: AccionDePresentacion, p: Presentacion, documento: Documento, hoy: string): string | null {
  switch (a.accion) {
    case "fecha":
      return diasEntre(hoy, a.fecha) < 0 ? "La fecha planeada no puede ser de un día que ya pasó. Si ya se presentó, usa «Ya lo presenté»." : null;
    case "presentado":
      return diasEntre(hoy, a.fecha) > 0 ? "No se puede haber presentado en un día que todavía no llegó." : null;
    case "listo":
      if (documento !== "diagnostico") return "Solo el diagnóstico se confirma como terminado.";
      return diasEntre(hoy, a.fecha) < 0 ? "La fecha de la presentación no puede ser de un día que ya pasó." : null;
    case "usar-propuesta":
    case "descartar-propuesta":
      return p.propuesta ? null : "No hay una fecha propuesta.";
    default:
      return null;
  }
}

/** La fila que deja una acción (sin quién ni el proyecto: los pone el servidor). */
export function filaDeLaAccion(
  a: AccionDePresentacion,
  p: Presentacion,
): { evento: EventoDePresentacion; fecha: string | null; detalle: DetalleDeFecha | DetalleDeListo | null } {
  switch (a.accion) {
    case "fecha":
      return { evento: "fecha", fecha: a.fecha, detalle: null };
    case "sin-fecha":
      return { evento: "sin-fecha", fecha: null, detalle: null };
    case "presentado":
      return { evento: "presentado", fecha: a.fecha, detalle: null };
    case "listo":
      return { evento: "listo", fecha: a.fecha, detalle: null };
    case "usar-propuesta": {
      const r = p.propuesta!.reunion;
      return {
        evento: "fecha",
        fecha: p.propuesta!.fecha,
        detalle: { deLaPropuesta: r.id, fuente: `Lo leyó Nexus en «${r.titulo ?? "una reunión"}» (${r.fecha}): «${p.propuesta!.cita}»` },
      };
    }
    case "descartar-propuesta":
      return { evento: "descarte", fecha: p.propuesta!.fecha, detalle: null };
    case "ahora-no":
      return { evento: "ahora-no", fecha: null, detalle: null };
  }
}

/**
 * ¿Vale guardar lo que leyó Nexus en una reunión? No, si ya es la fecha fijada, si alguien la descartó, si es la misma
 * que ya se propone, o si el documento ya se presentó.
 */
export function aceptaLaPropuesta(p: Presentacion, fecha: string): boolean {
  if (!esFecha(fecha) || p.presentado) return false;
  return p.fecha !== fecha && !p.descartadas.includes(fecha) && p.propuesta?.fecha !== fecha;
}

/* ── Lo que propuso Nexus (lo cuenta «Uso de Nexus», lib/lo-propuesto) ─────────────────── */

export interface DecisionDeLaPropuesta {
  sessionId: string | null;
  fecha: string;
  nacioEn: string;
  estado: "pendiente" | "usado" | "desestimado";
  por: string | null;
  en: string | null;
}

/** Cada fecha que leyó Nexus, y qué hizo una persona con ella: la usó, la descartó, o todavía nada. */
export function decisionesDeLasPropuestas(filas: readonly FilaDePresentacion[]): DecisionDeLaPropuesta[] {
  const ordenadas = [...filas].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const out: DecisionDeLaPropuesta[] = [];
  ordenadas.forEach((f, i) => {
    if (f.evento !== "propuesta" || !esFecha(f.fecha)) return;
    const despues = ordenadas.slice(i + 1);
    const decidida = despues.find(
      (g) =>
        g.fecha === f.fecha &&
        ((g.evento === "fecha" && !!leerDetalleDeFecha(g.detalle).deLaPropuesta) || g.evento === "descarte"),
    );
    out.push({
      sessionId: f.sessionId ?? null,
      fecha: f.fecha,
      nacioEn: iso(f.createdAt),
      estado: !decidida ? "pendiente" : decidida.evento === "descarte" ? "desestimado" : "usado",
      por: decidida?.porEmail?.toLowerCase() ?? null,
      en: decidida ? iso(decidida.createdAt) : null,
    });
  });
  return out;
}

/* ── Lo que se lee ─────────────────────────────────────────────────────────────────── */

/** La línea del documento: en qué está, en palabras. */
export function lineaDelEstado(estado: EstadoDeLaPresentacion, p: Presentacion, documento: Documento): string {
  switch (estado) {
    case "sin-responder":
      return `Todavía nadie dijo cuándo se presenta ${elDocumento(documento)}.`;
    case "sin-fecha":
      return "Todavía sin fecha de presentación.";
    case "con-fecha":
      return documento === "diagnostico"
        ? `Se presenta el ${fechaEnPalabras(p.fecha!)}. Dos días antes se pide confirmar que está terminado.`
        : `Se presenta el ${fechaEnPalabras(p.fecha!)}.`;
    case "por-reconfirmar":
      return `Se presenta el ${fechaEnPalabras(p.fecha!)}. Falta confirmar que está terminado.`;
    case "listo":
      return `Listo para presentarlo el ${fechaEnPalabras(p.fecha!)}.${
        p.aviso?.para ? ` Se le avisó a ${p.aviso.para}.` : p.aviso?.motivo ? ` ${p.aviso.motivo}` : ""
      }`;
    case "paso-la-fecha":
      return `Se iba a presentar el ${fechaEnPalabras(p.fecha!)}. Falta decir si se presentó.`;
    case "presentado":
      return p.presentado ? `Se presentó el ${fechaEnPalabras(p.presentado.fecha)}.` : "Ya se presentó.";
  }
}

/** La pregunta de la tarjeta. */
export function preguntaDelEstado(estado: EstadoDeLaPresentacion, p: Presentacion, documento: Documento): string {
  const lo = loDocumento(documento);
  if (estado === "por-reconfirmar") return `¿Está terminado ${elDocumento(documento)}? Se presenta el ${fechaEnPalabras(p.fecha!)}.`;
  if (estado === "paso-la-fecha") return `¿Ya ${lo} presentaste? Era el ${fechaEnPalabras(p.fecha!)}.`;
  if (estado === "sin-fecha") return `¿Ya sabes cuándo ${lo} presentas?`;
  return `¿Cuándo ${lo} presentas al cliente?`;
}

/** El renglón de «Para ti»: la pregunta, con la empresa. */
export function tituloParaTi(estado: EstadoDeLaPresentacion, documento: Documento, empresa: string): string {
  const doc = `${elDocumento(documento)} de ${empresa}`;
  if (estado === "por-reconfirmar") return `¿Está terminado ${doc}?`;
  if (estado === "paso-la-fecha") return `¿Ya presentaste ${doc}?`;
  if (estado === "sin-fecha") return `¿Ya sabes cuándo presentas ${doc}?`;
  return `¿Cuándo presentas ${doc}?`;
}

/* ── La exportación ────────────────────────────────────────────────────────────────── */

export interface FilaParaExportar extends FilaDePresentacion {
  documento: string;
  projectId: string | null;
  proyectoNombre: string;
  clientNombre: string | null;
  rol: string | null;
  motivo: string | null;
}

const COLUMNAS = [
  "momento",
  "documento",
  "evento",
  "fecha",
  "empresa",
  "proyecto",
  "proyecto_id",
  "quien",
  "rol",
  "motivo",
  "reunion",
  "detalle",
];

function celda(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // Una celda que empieza con = + - @ se leería como fórmula en Excel.
  const segura = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(segura) ? `"${segura.replace(/"/g, '""')}"` : segura;
}

function detalleEnTexto(f: FilaDePresentacion): string {
  if (f.evento === "propuesta") return leerDetalleDePropuesta(f.detalle, f.sessionId)?.cita ?? "";
  if (f.evento === "fecha") return leerDetalleDeFecha(f.detalle).fuente ?? "";
  if (f.evento === "listo") {
    const a = leerAviso(f.detalle);
    return a ? (a.para ? `Aviso a ${a.para}` : (a.motivo ?? "")) : "";
  }
  return "";
}

/** Todas las filas, en CSV (con BOM: Excel lo abre con las tildes bien). */
export function csvDePresentaciones(filas: readonly FilaParaExportar[]): string {
  const cuerpo = [...filas]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((f) =>
      [
        iso(f.createdAt),
        f.documento,
        f.evento,
        f.fecha,
        f.clientNombre,
        f.proyectoNombre,
        f.projectId,
        f.porEmail ?? "Nexus",
        f.rol,
        f.motivo,
        f.sessionId,
        detalleEnTexto(f),
      ]
        .map(celda)
        .join(","),
    );
  return "﻿" + [COLUMNAS.join(","), ...cuerpo].join("\r\n") + "\r\n";
}
