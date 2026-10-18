/**
 * lib/exploraciones/que-cubre-la-guia.ts — qué cubre la guía de una sesión: los puntos para proponer y las dimensiones
 * de la escala que pregunta. PURO.
 *
 * Validación 73 del roadmap (Elías, 2026-10-18): lo que cubre la guía tiene que estar pegado a ella, no en el panel de
 * la derecha, y cambiar al instante cuando el asistente, «Regenerar» o una pregunta propia la cambian. Por eso recibe
 * las preguntas YA ajustadas (ajustes-de-la-guia.ts › `aplicarAjustes`): las mismas que se ven.
 *
 * En la preventa, los puntos son los de «lista para proponer» (calidad.ts); en un proyecto, las tarjetas de la
 * estrategia. Un punto está «listo» si ya está; «cubre» si la guía lo pregunta; «falta» si no.
 */
import type { Letra } from "@/lib/escala/documento/tipos";
import type { EscalaDelLienzo } from "./escala-del-lienzo";
import { puntoQueSePregunta, type PuntoDeCalidad } from "./calidad";
import { ladoDeLaPregunta, temaDeLaPregunta, type PosicionParaLaGuia, type PreguntaParaMostrar } from "./guia";

export type EstadoDelPunto = "listo" | "cubre" | "falta";

export interface PuntoQueCubre {
  id: string;
  corto: string;
  titulo: string;
  estado: EstadoDelPunto;
}

export interface DimensionQueCubre {
  id: string;
  nombre: string;
  area: string;
  /** Dónde parece estar hoy, si se sabe. */
  nivel: Letra | null;
  clase: PosicionParaLaGuia["clase"] | null;
}

export interface LoQueCubreLaGuia {
  puntos: PuntoQueCubre[];
  dimensiones: DimensionQueCubre[];
  /** De lo que falta, cuánto pregunta la guía. */
  faltan: number;
  cubre: number;
}

/** Un punto que mirar: los de calidad.ts (la venta) o las tarjetas de la estrategia (un proyecto). */
export type PuntoAMirar = Pick<PuntoDeCalidad, "corto" | "titulo" | "cumplido"> & { id: string };

export function queCubreLaGuia(o: {
  preguntas: readonly Pick<PreguntaParaMostrar, "para" | "tipo" | "paso" | "apunta">[];
  puntos: readonly PuntoAMirar[];
  escala: Pick<EscalaDelLienzo, "areas">;
  posiciones: Readonly<Record<string, PosicionParaLaGuia | undefined>>;
  /** «venta»: los puntos para proponer, con sus reglas (calidad.ts). «cs»: un punto se cubre si la guía pregunta su tarjeta. */
  marco: "venta" | "cs";
}): LoQueCubreLaGuia {
  const temas = new Set(o.preguntas.map(temaDeLaPregunta).filter((t): t is string => !!t));
  const hayDimensiones = o.preguntas.some((p) => ladoDeLaPregunta(p) === "dimension");
  // Un dolor que se pregunta en impacto cubre «qué pasa si no actúa» (plan-de-la-guia.ts).
  const hayImpacto = o.preguntas.some((p) => ladoDeLaPregunta(p) === "dimension" && p.paso === "impacto");
  const loPregunta = (id: string) =>
    o.marco === "venta" ? puntoQueSePregunta(id as PuntoDeCalidad["id"], temas, hayDimensiones, hayImpacto) : temas.has(id);

  const puntos: PuntoQueCubre[] = o.puntos.map((p) => ({
    id: p.id,
    corto: p.corto,
    titulo: p.titulo,
    estado: p.cumplido ? "listo" : loPregunta(p.id) ? "cubre" : "falta",
  }));

  const dimensiones: DimensionQueCubre[] = [];
  for (const p of o.preguntas) {
    if (ladoDeLaPregunta(p) !== "dimension") continue;
    const id = temaDeLaPregunta(p);
    if (!id || dimensiones.some((d) => d.id === id)) continue;
    const area = o.escala.areas.find((a) => a.dimensiones.some((d) => d.id === id));
    const d = area?.dimensiones.find((x) => x.id === id);
    if (!area || !d) continue;
    const pos = o.posiciones[id];
    dimensiones.push({ id, nombre: d.nombre, area: area.nombre, nivel: pos?.nivel ?? null, clase: pos?.clase ?? null });
  }

  const faltantes = puntos.filter((p) => p.estado !== "listo");
  return { puntos, dimensiones, faltan: faltantes.length, cubre: faltantes.filter((p) => p.estado === "cubre").length };
}
