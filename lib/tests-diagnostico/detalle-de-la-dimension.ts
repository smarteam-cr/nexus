/**
 * lib/tests-diagnostico/detalle-de-la-dimension.ts — LO QUE SE DICE DE CADA DIMENSIÓN en la página de resultado del test
 * (29 oct). PURO y CLIENT-SAFE.
 *
 * Dos lugares, con dos fines que no se repiten (Elías, 29 oct):
 *   · la TARJETA DEL RADAR (al pasar el cursor o tocar una dimensión) dice QUÉ LE PASA al área por operar así
 *     (`impacto`), en palabras del cliente. Es corta: la segunda prueba de Elías la encontró cargada y con «En la escala,
 *     este nivel es», como si quien llena el test tuviera la escala en la cabeza;
 *   · «VER DETALLES» de su barra dice QUÉ HACER: lo que conviene priorizar para llegar al nivel siguiente (`siguiente`).
 *     Null en el último nivel.
 * El `impacto` y la `prioridad` son los que redactó la IA al terminar (./redaccion.ts) si pasaron sus reglas; si no, los
 * de la escala: debajo de Funcional, el costo de quedarse de la dimensión; desde Funcional, lo que logra su nivel; y la
 * primera oración del nivel de arriba. Ningún número sale de acá.
 * Además, `dimensionDeCadaRiesgo`: el subtítulo de cada tarjeta de «Lo que hoy pone en riesgo a tu área».
 * La escala es la de HOY vista por la edición del resultado: una dimensión que ya no existe se queda sin detalle.
 */
import { nombreDeNivel } from "@/lib/escala/documento/parsear";
import type { Escala, Letra } from "@/lib/escala/documento/tipos";
import { LETRAS } from "@/lib/escala/documento/tipos";
import type { ResultadoDelTest } from "./resultado";

export interface DetalleDeLaDimension {
  /** Lo que le pasa en la práctica por operar así: el de la IA, o el de la escala. */
  impacto: string | null;
  /** El nivel de arriba y qué priorizar para llegar (la de la IA o la primera oración de ese nivel). */
  siguiente: { nombre: string; prioridad: string } | null;
}

/** El tope de los textos sin IA: la descripción del nivel llega a 900 caracteres y en el PDF cortaba la hoja 3. */
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
    // Debajo de la base, el paso que se recomienda es llegar a Funcional (o al primero que exista desde ahí), como «Por
    // dónde empezar»: recomendar Inicial le proponía un estado malo (16 nov, Centauro 1.8).
    const desde = Math.max(LETRAS.indexOf(d.nivel) + 1, LETRAS.indexOf("F"));
    const siguiente = dim.niveles.find((n) => LETRAS.indexOf(n.letra) >= desde && n.letra !== d.nivel);
    const letraSiguiente: Letra | undefined = siguiente?.letra;
    // Sin IA: debajo de la base, lo que cuesta quedarse así; desde la base, lo que logra el nivel.
    const debajoDeLaBase = LETRAS.indexOf(d.nivel) < LETRAS.indexOf("F");
    const deLaEscala = debajoDeLaBase ? dim.costoDeQuedarse : (nivel?.resultado ?? nivel?.descripcion ?? "");
    // La de la IA se escribió para el nivel de al lado: si el paso salta (de Deficiente a Funcional), sale la de la escala.
    const prioridad = (letraSiguiente === LETRAS[LETRAS.indexOf(d.nivel) + 1] ? ia?.prioridad : null) || primeraOracion(siguiente?.descripcion ?? "");
    out[d.id] = {
      impacto: ia?.impacto || primeraOracion(deLaEscala) || null,
      siguiente: letraSiguiente && prioridad ? { nombre: nombreDeNivel(escala, letraSiguiente), prioridad } : null,
    };
  }
  return out;
}

/**
 * De qué dimensión es cada riesgo del resultado (el mensaje → el nombre de la dimensión): el subtítulo de cada tarjeta
 * de «Lo que hoy pone en riesgo a tu área» (Elías, 29 oct). Sale de la escala, igual que los riesgos (./resultado.ts):
 * los criterios de riesgo de los niveles que cada dimensión todavía no alcanza. Un mensaje que comparten dos dimensiones
 * se queda con la primera.
 */
export function dimensionDeCadaRiesgo(escala: Escala, r: Pick<ResultadoDelTest, "areaId" | "dimensiones" | "riesgos">): Record<string, string> {
  const area = escala.areas.find((a) => a.id === r.areaId);
  if (!area) return {};
  const out: Record<string, string> = {};
  for (const d of r.dimensiones) {
    if (!d.preguntada || !d.nivel) continue;
    const dim = area.dimensiones.find((x) => x.id === d.id);
    if (!dim) continue;
    for (const n of dim.niveles) {
      if (LETRAS.indexOf(n.letra) <= LETRAS.indexOf(d.nivel)) continue;
      for (const c of n.criterios) {
        const msg = c.riesgo ? escala.riesgos[c.id] : undefined;
        if (msg && r.riesgos.includes(msg) && !out[msg]) out[msg] = d.nombre;
      }
    }
  }
  return out;
}
