/**
 * lib/flow/piece-readiness.ts — ¿esta pieza tiene sentido en ESTE proyecto? PURO.
 *
 * La médula es un proceso con etapas OPCIONALES: no todo proyecto lleva todas las piezas,
 * y las que lleva tienen un orden en el que recién ahí valen. Hasta ahora eso no estaba
 * escrito en ningún lado, con dos consecuencias visibles:
 *
 *   · Los Requerimientos técnicos se podían generar en un proyecto sin nada de
 *     integración ni desarrollo a la medida, en silencio. El único lugar que miraba ese
 *     tag era el encadenado automático del handoff.
 *   · Nada avisaba que la Implementación no tiene de dónde agarrarse si todavía no se
 *     entendió al cliente.
 *
 * ── NUNCA BLOQUEA ────────────────────────────────────────────────────────────
 * Todo lo de acá es un AVISO. Es la misma regla que gobierna el resto del sistema —el
 * sistema propone, el CSE decide— y hay un motivo práctico: los tags se equivocan, los
 * proyectos son raros, y una pieza que se niega a existir por un tag mal puesto obliga a
 * pelear con la herramienta en el peor momento. Decir el motivo alcanza.
 */
import { labelForTag } from "@/lib/tags/catalog";
import { pieceBySlug } from "@/lib/pieces/registry";

/** Qué necesita una pieza para tener sentido. Vacío = aplica siempre. */
interface PieceNeeds {
  /** Si el proyecto no tiene NINGUNO de estos tags, la pieza no le corresponde. */
  anyTag?: string[];
  /** Piezas que conviene tener con contenido antes que ésta. */
  afterPieces?: string[];
  /** Cómo se explica el "antes" en una frase (por qué, no solo qué). */
  afterWhy?: string;
}

const NEEDS: Record<string, PieceNeeds> = {
  "tech-requirements": {
    // hasTechnicalScope(): los mismos dos tags, ahora también del lado de la UI.
    anyTag: ["custom_dev", "insider_one"],
  },
  diagnosis: {
    afterPieces: ["exploration"],
    afterWhy: "el diagnóstico se apoya en lo que se averiguó",
  },
  planning: {
    afterPieces: ["diagnosis"],
    afterWhy: "la planificación parte del diagnóstico",
  },
  implementation: {
    // Lo que pidió el negocio: la implementación ocurre cuando ya se entendió al cliente
    // y su situación. Antes de eso no hay arquitectura que escribir ni prompts que dar.
    afterPieces: ["exploration", "planning"],
    afterWhy: "primero hay que entender al cliente y su situación",
  },
};

export interface PieceReadiness {
  /** ¿Los tags del proyecto la justifican? */
  applies: boolean;
  /** ¿Están hechos los pasos que la anteceden? */
  ready: boolean;
  /** Motivo en una frase, listo para mostrar. null = todo en orden. */
  reason: string | null;
}

const OK: PieceReadiness = { applies: true, ready: true, reason: null };

/** Une rótulos con comas y una "y" al final: "Exploración y Planificación". */
function enumerar(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} y ${labels[labels.length - 1]}`;
}

/**
 * Evalúa una pieza contra el proyecto.
 * `piezasConContenido` = slugs de las piezas que ya tienen algo escrito.
 */
export function pieceReadiness(
  slug: string,
  input: { tags: string[]; piezasConContenido: string[] },
): PieceReadiness {
  const needs = NEEDS[slug];
  if (!needs) return OK;

  // 1. Tags. Es lo más fuerte: la pieza directamente no le corresponde al proyecto.
  if (needs.anyTag?.length) {
    const tiene = needs.anyTag.some((t) => input.tags.includes(t));
    if (!tiene) {
      // Con el RÓTULO que ve el usuario, no el slug: «Integración / Desarrollo a medida».
      const rotulos = enumerar(needs.anyTag.map((t) => `«${labelForTag(t)}»`));
      return {
        applies: false,
        ready: true,
        reason: `Este proyecto no tiene ${rotulos}. Podés agregarla igual, o sumar el tag en el handoff.`,
      };
    }
  }

  // 2. Pasos previos. Más suave: la pieza corresponde, pero todavía no tiene de dónde
  //    agarrarse. Se nombran solo los que faltan.
  if (needs.afterPieces?.length) {
    const hechas = new Set(input.piezasConContenido);
    const faltan = needs.afterPieces.filter((s) => !hechas.has(s));
    if (faltan.length) {
      const rotulos = enumerar(faltan.map((s) => pieceBySlug(s)?.label ?? s));
      const porque = needs.afterWhy ? `: ${needs.afterWhy}` : "";
      return {
        applies: true,
        ready: false,
        reason: `Conviene tener ${rotulos} antes${porque}.`,
      };
    }
  }

  return OK;
}

/** ¿Los tags del proyecto justifican esta pieza? (sin mirar los pasos previos). */
export function pieceAppliesByTags(slug: string, tags: string[]): boolean {
  const anyTag = NEEDS[slug]?.anyTag;
  if (!anyTag?.length) return true;
  return anyTag.some((t) => tags.includes(t));
}
