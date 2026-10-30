/**
 * lib/planificacion/plantilla-sugerida.ts — QUÉ PLANTILLA DE PLANIFICACIÓN SUGIERE NEXUS (2026-10-29, pregunta 44 del
 * roadmap; Elías: «que esté la lista, pero que también se pueda sugerir»). Puro.
 *
 * El selector («Elige cómo armar la planificación», components/canvas/ElegirPlantilla.tsx) sigue mostrando las dos; Nexus
 * marca una como sugerida, con su razón en una línea, y la deja elegida. La persona elige: la sugerencia nunca escribe.
 *
 * La regla, en orden (la primera que aplica gana):
 *   1. Adopción POR PILOTOS (confirmada o sugerida por tamaño) → completa: trae el despliegue por olas y las rutinas.
 *   2. Desarrollo a medida o integraciones vendidas → completa: trae la arquitectura de la solución.
 *   3. Tres hubs o más, o dos con un equipo de más de `EQUIPO_CHICO` → completa: trae procesos y conversaciones.
 *   4. El Brief de implementación ya traído de la hoja → esencial: lo justo para configurar el portal, con la hoja al lado.
 *      (Le gana a «dos hubs»: decisión mía, pendiente de Elías.)
 *   5. Un hub o menos, con un equipo chico o sin datos → esencial: implementación chica.
 *   6. Lo demás (dos hubs sin datos del equipo, o con uno chico) → completa, que se puede recortar ocultando.
 */
import { HUBSPOT_HUB_SLUGS, normalizeTag } from "@/lib/tags/catalog";

export const PLANTILLA_COMPLETA = "planificacion";
export const PLANTILLA_ESENCIAL = "planificacion-esencial";
/** Hasta cuántos usuarios de HubSpot es un equipo chico. */
export const EQUIPO_CHICO = 10;

export interface HechosParaLaPlantilla {
  /** Las etiquetas del proyecto (lo vendido). */
  etiquetas: readonly string[];
  /** Los asientos de HubSpot comprados (Partner), o null si no se sabe. */
  asientos: number | null;
  /** La modalidad de adopción: la confirmada o la sugerida por tamaño; null sin datos. */
  adopcion: "directa" | "por_pilotos" | null;
  /** ¿Ya se trajo el Brief de la hoja? */
  tieneBrief: boolean;
}

export interface PlantillaSugerida {
  plantilla: typeof PLANTILLA_COMPLETA | typeof PLANTILLA_ESENCIAL;
  /** La razón, en una línea, para el selector. */
  razon: string;
}

const HUBS = new Set<string>(HUBSPOT_HUB_SLUGS);

/** El total de asientos de la copia de Partner (`{ core: { limit }, sales: … }`), o null. */
export function totalDeAsientos(seats: unknown): number | null {
  if (!seats || typeof seats !== "object") return null;
  let total = 0;
  for (const v of Object.values(seats as Record<string, { limit?: unknown } | null>)) {
    const n = typeof v?.limit === "number" ? v.limit : 0;
    total += n > 0 ? n : 0;
  }
  return total || null;
}

export function plantillaSugeridaDeLaPlanificacion(h: HechosParaLaPlantilla): PlantillaSugerida {
  const etiquetas = new Set(h.etiquetas.map((t) => normalizeTag(t) ?? t));
  const hubs = [...etiquetas].filter((t) => HUBS.has(t)).length;
  const equipo = h.asientos != null && h.asientos > 0 ? h.asientos : null;
  const deEquipo = equipo != null ? ` y un equipo de ${equipo} ${equipo === 1 ? "usuario" : "usuarios"}` : "";
  const deHubs = hubs === 0 ? "sin hubs marcados" : `${hubs} ${hubs === 1 ? "hub" : "hubs"}`;
  const proyecto = `Proyecto ${hubs === 0 ? deHubs : `con ${deHubs}`}${deEquipo}`;

  if (h.adopcion === "por_pilotos") {
    return { plantilla: PLANTILLA_COMPLETA, razon: "La adopción va por pilotos: la completa trae el despliegue por olas y las rutinas de cada equipo." };
  }
  if (etiquetas.has("custom_dev")) {
    return { plantilla: PLANTILLA_COMPLETA, razon: "Se vendió desarrollo a medida o integraciones: la completa trae la arquitectura de la solución." };
  }
  if (hubs >= 3 || (hubs >= 2 && equipo != null && equipo > EQUIPO_CHICO)) {
    return { plantilla: PLANTILLA_COMPLETA, razon: `${proyecto}: la completa trae cómo van a funcionar los procesos y las conversaciones.` };
  }
  if (h.tieneBrief) {
    return { plantilla: PLANTILLA_ESENCIAL, razon: "Ya está el Brief de la hoja: la esencial deja lo justo para configurar el portal, y el Brief queda al lado para el equipo." };
  }
  if (hubs <= 1 && (equipo == null || equipo <= EQUIPO_CHICO)) {
    return {
      plantilla: PLANTILLA_ESENCIAL,
      razon: hubs === 0 && equipo == null
        ? "Implementación chica (no se sabe de más hubs ni de un equipo grande): la esencial deja lo justo para configurar el portal."
        : `Implementación chica: ${deHubs}${deEquipo}. La esencial deja lo justo para configurar el portal.`,
    };
  }
  return { plantilla: PLANTILLA_COMPLETA, razon: `${proyecto}: la completa trae todo, y lo que sobre se oculta.` };
}
