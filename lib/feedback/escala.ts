/**
 * lib/feedback/escala.ts — los comentarios de la escala, dentro del feedback. PURO (client-safe).
 *
 * Desde el 2026-10-05 lo que el equipo comenta sobre la escala es un reporte de Feedback más (Elías:
 * «es mejor que todo se maneje desde el módulo de feedback nuevo»): se decide en la misma bandeja, con
 * las mismas tres salidas, y quien lo escribió lo sigue en «Mis reportes». Se sigue escribiendo EN LA
 * ESCALA, sobre el criterio: eso da lo que una captura no da. Lo propio de la escala viaja con el
 * reporte:
 *   · dónde: el ancla (`2.6.F1`) y su área, en columnas (`escalaAncla`, `escalaArea`), para contar
 *     sin abrir el JSON;
 *   · el resto en `escala` (JSON, `EscalaDelReporte`): el texto que se leyó, la versión y la edición,
 *     el tipo propio de la escala, el cliente y el perfil del caso, «qué decisión cambiaría» y, al
 *     llevarlo a la hoja de ruta, la fila de «Cambios pendientes» del manual.
 *
 * ── LO QUE NO ES COMO EL RESTO DEL FEEDBACK (Elías, 2026-10-05) ──────────────
 * · Lo ve y lo responde TODO el equipo, en la escala: es una conversación sobre un documento de todos
 *   (un reporte de pantalla, en cambio, lo ven solo quien lo escribió y quien revisa).
 * · Lo decide cualquier super admin, como todo el feedback (antes, solo el responsable de la escala).
 */
import type { TipoDeAncla } from "@/lib/escala/documento/anclas";
import type { Cierre, Despues } from "@/lib/escala/documento/perfil";
import type { EstadoDeComentario, TipoDeComentario } from "@/lib/escala/comentarios/reglas";
import type { EstadoDeReporte, TipoDeFeedback } from "./reglas";

/** La fila de «Cambios pendientes» del manual de operación de la escala. */
export interface FilaDelManual {
  que: string;
  caso: string;
  decision: string;
}

/** Lo que un reporte trae de la escala (la columna `escala`, JSON). */
export interface EscalaDelReporte {
  tipoDeAncla: TipoDeAncla;
  dimension: string;
  /** La versión de la escala en que se comentó. */
  version: string;
  /** El texto del ancla cuando se comentó, leído con su edición: lo congela el servidor. */
  textoAnclado: string;
  /** La edición por industria desde la que se comentó (null = la escala general). */
  edicion: string | null;
  /** El tipo propio de la escala: no se entiende · no calza con un cliente · propuesta. */
  tipo: TipoDeComentario;
  decision: string | null;
  cliente: { id: string | null; nombre: string } | null;
  perfil: { cierre: Cierre | null; despues: Despues | null };
  /** La fila del manual: se llena al llevarlo a la hoja de ruta. */
  cambio: FilaDelManual | null;
  /** Su autor lo editó (mientras nadie había respondido). ISO. */
  editadoAt: string | null;
}

const TIPOS: readonly TipoDeComentario[] = ["no_se_entiende", "no_calza", "propuesta"];
const ANCLAS: readonly TipoDeAncla[] = ["dimension", "nivel", "criterio"];

/**
 * El tipo de feedback de cada tipo de la escala: con él cuentan la bandeja y «Personas». Que un
 * criterio no calce con un cliente real es que la escala falla en describirlo.
 */
export const TIPO_EN_EL_FEEDBACK: Record<TipoDeComentario, TipoDeFeedback> = {
  no_se_entiende: "duda",
  no_calza: "falla",
  propuesta: "mejora",
};

/** El estado que ve la escala de cada estado del feedback (y al revés, para filtrar). */
export const ESTADO_EN_LA_ESCALA: Record<EstadoDeReporte, EstadoDeComentario> = {
  sin_revisar: "abierto",
  respondido: "respondido",
  en_hoja: "cambio_pendiente",
  no_se_hara: "descartado",
};

export const ESTADO_EN_EL_FEEDBACK: Record<EstadoDeComentario, EstadoDeReporte> = {
  abierto: "sin_revisar",
  respondido: "respondido",
  cambio_pendiente: "en_hoja",
  descartado: "no_se_hara",
};

export function estadoEnLaEscala(estado: string): EstadoDeComentario {
  return ESTADO_EN_LA_ESCALA[estado as EstadoDeReporte] ?? "abierto";
}

/** Cómo se llama la «pantalla» de un comentario de la escala: lo que se lee en la bandeja y en «Personas». */
export function pantallaDeLaEscala(area: string): string {
  return `Escala · ${area}`;
}

/** Adónde lleva: el ancla abierta en la matriz, con la edición desde la que se comentó. */
export function rutaEnLaEscala(a: { slug: string; ancla: string; edicion: string | null }): string {
  const industria = a.edicion ? `industria=${encodeURIComponent(a.edicion)}&` : "";
  return `/escala/${a.slug}?${industria}vista=matriz&c=${encodeURIComponent(a.ancla)}`;
}

const texto = (x: unknown): x is string => typeof x === "string";
const textoONulo = (x: unknown): string | null => (typeof x === "string" && x ? x : null);

function fila(x: unknown): FilaDelManual | null {
  if (!x || typeof x !== "object") return null;
  const f = x as Record<string, unknown>;
  if (!texto(f.que) || !f.que.trim()) return null;
  return { que: f.que, caso: texto(f.caso) ? f.caso : "", decision: texto(f.decision) ? f.decision : "" };
}

/**
 * La columna `escala` leída con cuidado: viene de la base como JSON. Sin lo mínimo (de qué tipo es,
 * en qué versión y qué texto se leyó) no se inventa nada: null.
 */
export function leerEscalaDelReporte(json: unknown): EscalaDelReporte | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const j = json as Record<string, unknown>;
  if (!ANCLAS.includes(j.tipoDeAncla as TipoDeAncla) || !TIPOS.includes(j.tipo as TipoDeComentario)) return null;
  if (!texto(j.version) || !texto(j.textoAnclado) || !texto(j.dimension)) return null;
  const cliente = j.cliente && typeof j.cliente === "object" ? (j.cliente as Record<string, unknown>) : null;
  const perfil = j.perfil && typeof j.perfil === "object" ? (j.perfil as Record<string, unknown>) : {};
  return {
    tipoDeAncla: j.tipoDeAncla as TipoDeAncla,
    dimension: j.dimension,
    version: j.version,
    textoAnclado: j.textoAnclado,
    edicion: textoONulo(j.edicion),
    tipo: j.tipo as TipoDeComentario,
    decision: textoONulo(j.decision),
    cliente: cliente && texto(cliente.nombre) && cliente.nombre ? { id: textoONulo(cliente.id), nombre: cliente.nombre } : null,
    perfil: { cierre: (textoONulo(perfil.cierre) as Cierre | null) ?? null, despues: (textoONulo(perfil.despues) as Despues | null) ?? null },
    cambio: fila(j.cambio),
    editadoAt: textoONulo(j.editadoAt),
  };
}

/** Lo que ve la bandeja de /feedback de un reporte de la escala (lo arma `escala-server.ts`). */
export interface DetalleDeEscala {
  ancla: string;
  /** El tipo propio: «No calza con un cliente». */
  tipo: string;
  /** «Marketing · Segmentación · Funcional», como se lee HOY (null = ya no existe). */
  ruta: string | null;
  /** Lo que se leyó al comentar. */
  textoAnclado: string;
  /** Lo que dice hoy (null = ya no existe); igual a `textoAnclado` si no cambió. */
  textoDeHoy: string | null;
  version: string;
  versionVigente: string | null;
  /** El nombre de la edición desde la que se comentó. */
  edicion: string | null;
  cliente: { nombre: string; enNexus: boolean } | null;
  /** «Con equipo · Recompra». */
  perfil: string | null;
  decision: string | null;
  /** La fila del manual, si ya está en la hoja de ruta. */
  cambio: FilaDelManual | null;
  /** La fila que se le propone a quien lo lleva a la hoja de ruta (la corrige al llevarlo). */
  sugerida: FilaDelManual;
}
