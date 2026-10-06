/**
 * lib/feedback/escala.ts — el feedback que se manda desde la escala. PURO (client-safe).
 *
 * Desde el 2026-10-05 la escala no tiene un sistema de comentarios propio (Elías: «quitar el sistema
 * antiguo de comentarios y que todos los nuevos comentarios o mejoras que me dejen de la escala o de
 * cualquier parte de Nexus funcionen con el nuevo módulo de feedback»). El botón de cada criterio, nivel o
 * dimensión abre el MISMO panel de Feedback del pie del menú, con lo que se está mirando ya puesto
 * (`SobreLaEscala`): se manda con los tipos de siempre (algo falla · una mejora · no se entiende), se ve en
 * «Mis reportes» y se decide en la bandeja de /feedback, como cualquier reporte.
 *
 * Lo que el reporte sabe de la escala, aparte de la pantalla y la captura:
 *   · dónde: el ancla (`2.6.F1`) y su área, en columnas (`escalaAncla`, `escalaArea`), para contar sin
 *     abrir el JSON;
 *   · el resto en `escala` (JSON, `EscalaDelReporte`): el texto que se leyó (lo congela el servidor), la
 *     versión, la edición, el perfil de la pantalla y, al llevarlo a la hoja de ruta, la fila de «Cambios
 *     pendientes» del manual.
 * Como todo el feedback, lo ven quien lo mandó y quien revisa (super admin).
 */
import type { TipoDeAncla } from "@/lib/escala/documento/anclas";
import type { Cierre, Despues } from "@/lib/escala/documento/perfil";
import type { TipoDeFeedback } from "./reglas";

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
  /** La versión de la escala que se estaba leyendo. */
  version: string;
  /** El texto del ancla en ese momento, leído con su edición: lo congela el servidor. */
  textoAnclado: string;
  /** La edición por industria con que se leía (null = la escala general). */
  edicion: string | null;
  /** El perfil elegido en la pantalla: contexto de lo que se leía, no filtra nada. */
  perfil: { cierre: Cierre | null; despues: Despues | null };
  /** La fila del manual: se llena al llevarlo a la hoja de ruta. */
  cambio: FilaDelManual | null;
}

/** Lo que la escala le pasa al panel de Feedback al abrirlo desde un criterio, un nivel o una dimensión. */
export interface SobreLaEscala {
  ancla: string;
  /** «Criterio», «Nivel» o «Dimensión». */
  que: string;
  /** «Ventas · Procesos y Rutinas · Funcional», con los nombres de la edición. */
  ruta: string;
  /** Lo que dice hoy (el servidor lo vuelve a leer: este es solo para mostrarlo). */
  texto: string;
  edicion: { slug: string; nombre: string } | null;
  perfil: { cierre: Cierre | null; despues: Despues | null };
}

/** Cuántos reportes de feedback tiene cada ancla (o cada área): todos y los sin revisar. */
export type Conteo = { total: number; abiertos: number };
export type ConteosPorClave = Record<string, Conteo>;

export const ETIQUETA_DE_ANCLA: Record<TipoDeAncla, string> = { dimension: "Dimensión", nivel: "Nivel", criterio: "Criterio" };

/** Lo avisa el panel de Feedback (en `window`) cada vez que manda un reporte: la escala refresca sus contadores. */
export const EVENTO_DE_FEEDBACK_ENVIADO = "nexus:feedback-enviado";

/** Cómo se llama la «pantalla» de un reporte de la escala: lo que se lee en la bandeja y en «Personas». */
export function pantallaDeLaEscala(area: string): string {
  return `Escala · ${area}`;
}

/** Adónde lleva: el ancla marcada en la matriz, con la edición con que se leía. */
export function rutaEnLaEscala(a: { slug: string; ancla: string; edicion: string | null }): string {
  const industria = a.edicion ? `industria=${encodeURIComponent(a.edicion)}&` : "";
  return `/escala/${a.slug}?${industria}vista=matriz&c=${encodeURIComponent(a.ancla)}`;
}

/**
 * La fila del manual que se le propone a quien lleva el reporte a la hoja de ruta (la corrige al
 * llevarlo): el identificador, con su edición, y —si es una mejora— lo que se pidió.
 */
export function filaSugerida(r: { ancla: string; edicion: string | null; tipo: TipoDeFeedback | string; cuerpo: string; cambio: FilaDelManual | null }): FilaDelManual {
  if (r.cambio) return r.cambio;
  const donde = r.edicion ? `\`${r.ancla}\` (edición ${r.edicion})` : `\`${r.ancla}\``;
  return { que: r.tipo === "mejora" ? `${donde} — ${r.cuerpo}` : `${donde} — `, caso: "", decision: "" };
}

const ANCLAS: readonly TipoDeAncla[] = ["dimension", "nivel", "criterio"];
const texto = (x: unknown): x is string => typeof x === "string";
const textoONulo = (x: unknown): string | null => (typeof x === "string" && x ? x : null);

function fila(x: unknown): FilaDelManual | null {
  if (!x || typeof x !== "object") return null;
  const f = x as Record<string, unknown>;
  if (!texto(f.que) || !f.que.trim()) return null;
  return { que: f.que, caso: texto(f.caso) ? f.caso : "", decision: texto(f.decision) ? f.decision : "" };
}

/**
 * La columna `escala` leída con cuidado: viene de la base como JSON. Sin lo mínimo (de qué es, en qué
 * versión y qué texto se leyó) no se inventa nada: null.
 */
export function leerEscalaDelReporte(json: unknown): EscalaDelReporte | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const j = json as Record<string, unknown>;
  if (!ANCLAS.includes(j.tipoDeAncla as TipoDeAncla)) return null;
  if (!texto(j.version) || !texto(j.textoAnclado) || !texto(j.dimension)) return null;
  const perfil = j.perfil && typeof j.perfil === "object" ? (j.perfil as Record<string, unknown>) : {};
  return {
    tipoDeAncla: j.tipoDeAncla as TipoDeAncla,
    dimension: j.dimension,
    version: j.version,
    textoAnclado: j.textoAnclado,
    edicion: textoONulo(j.edicion),
    perfil: { cierre: (textoONulo(perfil.cierre) as Cierre | null) ?? null, despues: (textoONulo(perfil.despues) as Despues | null) ?? null },
    cambio: fila(j.cambio),
  };
}

/** Lo que ve la bandeja de /feedback de un reporte de la escala (lo arma `escala-server.ts`). */
export interface DetalleDeEscala {
  ancla: string;
  /** «Marketing · Segmentación · Funcional», como se lee HOY (null = ya no existe). */
  ruta: string | null;
  /** Lo que se leyó al mandarlo. */
  textoAnclado: string;
  /** Lo que dice hoy (null = ya no existe); igual a `textoAnclado` si no cambió. */
  textoDeHoy: string | null;
  version: string;
  versionVigente: string | null;
  /** El nombre de la edición con que se leía. */
  edicion: string | null;
  /** «Con equipo · Recompra»: el perfil elegido en la pantalla. */
  perfil: string | null;
  /** La fila del manual, si ya está en la hoja de ruta. */
  cambio: FilaDelManual | null;
  /** La fila que se le propone a quien lo lleva a la hoja de ruta. */
  sugerida: FilaDelManual;
}
