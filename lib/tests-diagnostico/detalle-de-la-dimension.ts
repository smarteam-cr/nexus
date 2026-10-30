/**
 * lib/tests-diagnostico/detalle-de-la-dimension.ts — LO QUE SE DICE DE CADA DIMENSIÓN en la página de resultado del test
 * (29 oct). PURO y CLIENT-SAFE.
 *
 * Dos lugares, con dos fines que no se repiten (Elías, 29 oct):
 *   · la TARJETA DEL RADAR (al pasar el cursor o tocar una dimensión) dice CÓMO ESTÁ: qué mide (`queMide`), un resumen
 *     corto (`lectura`) y «En la escala, este nivel es:» con hasta cuatro criterios de su nivel (`esteNivel`);
 *   · «VER DETALLES» de su barra dice QUÉ HACER: lo que conviene priorizar para llegar al nivel siguiente (`siguiente`).
 *     Null en el último nivel.
 * La `lectura` y la `prioridad` son las que redactó la IA al terminar (./redaccion.ts) si pasaron sus reglas; si no, las
 * de la escala: la descripción del nivel y la primera oración de la del nivel de arriba. Ningún número sale de acá.
 * La escala es la de HOY vista por la edición del resultado: una dimensión que ya no existe se queda sin detalle.
 */
import { nombreDeNivel } from "@/lib/escala/documento/parsear";
import type { Escala, Letra } from "@/lib/escala/documento/tipos";
import { LETRAS } from "@/lib/escala/documento/tipos";
import type { ResultadoDelTest } from "./resultado";

/** Cuántos criterios lleva «En la escala, este nivel es:». */
export const MAX_CRITERIOS_DEL_NIVEL = 4;

export interface DetalleDeLaDimension {
  queMide: string | null;
  /** Cómo está hoy: la de la IA o la descripción de su nivel en la escala. */
  lectura: string | null;
  /** Su nivel y hasta cuatro de sus criterios. */
  esteNivel: { nombre: string; criterios: string[] } | null;
  /** El nivel de arriba y qué priorizar para llegar (la de la IA o la descripción de ese nivel). */
  siguiente: { nombre: string; prioridad: string } | null;
}

/** El tope de «qué priorizar» sin IA: la descripción del nivel llega a 900 caracteres y en el PDF cortaba la hoja 3. */
export const TOPE_DE_LA_PRIORIDAD = 220;

/** La primera oración de un texto, y a lo sumo `TOPE_DE_LA_PRIORIDAD` caracteres (cortando en una palabra). */
export function primeraOracion(texto: string): string {
  const t = texto.replace(/\s+/g, " ").trim();
  const fin = t.search(/[.!?](\s|$)/);
  const oracion = fin >= 0 ? t.slice(0, fin + 1) : t;
  if (oracion.length <= TOPE_DE_LA_PRIORIDAD) return oracion;
  const corte = oracion.slice(0, TOPE_DE_LA_PRIORIDAD - 1);
  return `${corte.slice(0, Math.max(corte.lastIndexOf(" "), 1)).replace(/[,;:—-]+$/, "")}…`;
}

/** El detalle de cada dimensión preguntada y ubicada del resultado, por su id. */
export function detallesDelResultado(
  escala: Escala,
  r: Pick<ResultadoDelTest, "areaId" | "dimensiones"> & { redaccion?: ResultadoDelTest["redaccion"] },
): Record<string, DetalleDeLaDimension> {
  const area = escala.areas.find((a) => a.id === r.areaId);
  if (!area) return {};
  const out: Record<string, DetalleDeLaDimension> = {};
  for (const d of r.dimensiones) {
    if (!d.preguntada || !d.nivel) continue;
    const dim = area.dimensiones.find((x) => x.id === d.id);
    if (!dim) continue;
    const ia = r.redaccion?.dimensiones?.[d.id];
    const nivel = dim.niveles.find((n) => n.letra === d.nivel);
    const letraSiguiente: Letra | undefined = LETRAS[LETRAS.indexOf(d.nivel) + 1];
    const siguiente = letraSiguiente ? dim.niveles.find((n) => n.letra === letraSiguiente) : undefined;
    const criterios = (nivel?.criterios ?? []).map((c) => c.texto.trim()).filter(Boolean).slice(0, MAX_CRITERIOS_DEL_NIVEL);
    const prioridad = ia?.prioridad || primeraOracion(siguiente?.descripcion ?? "");
    out[d.id] = {
      queMide: dim.descripcion?.trim() || null,
      lectura: ia?.lectura || nivel?.descripcion.trim() || null,
      esteNivel: criterios.length ? { nombre: nombreDeNivel(escala, d.nivel), criterios } : null,
      siguiente: letraSiguiente && prioridad ? { nombre: nombreDeNivel(escala, letraSiguiente), prioridad } : null,
    };
  }
  return out;
}
