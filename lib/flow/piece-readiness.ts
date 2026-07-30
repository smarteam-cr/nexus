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
import { pipelineByKey, resolvePipeline, type ProjectPipelineKey } from "@/lib/projects/kind";

/** Qué necesita una pieza para tener sentido. Vacío = aplica siempre. */
interface PieceNeeds {
  /** Si el proyecto no tiene NINGUNO de estos tags, la pieza no le corresponde. */
  anyTag?: string[];
  /**
   * Pipelines a los que la pieza les corresponde SIEMPRE, tengan el tag o no.
   *
   * Se evalúa en **OR** con `anyTag`, nunca en AND: son dos caminos distintos hacia la misma
   * pieza. Un proyecto de Customer Success llega al requerimiento técnico por su tag
   * («Desarrollo a medida»); uno del pipeline Development llega por ser lo que es, y
   * exigirle además el tag lo dejaría con un aviso de "no aplica" sobre su pieza central.
   */
  anyPipeline?: ProjectPipelineKey[];
  /** Piezas que conviene tener con contenido antes que ésta. */
  afterPieces?: string[];
  /** Cómo se explica el "antes" en una frase (por qué, no solo qué). */
  afterWhy?: string;
}

const NEEDS: Record<string, PieceNeeds> = {
  "tech-requirements": {
    // hasTechnicalScope(): los mismos dos tags, ahora también del lado de la UI.
    anyTag: ["custom_dev", "insider_one"],
    // Y el pipeline entero de Desarrollo, sin necesidad de tag.
    anyPipeline: ["development"],
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
  /** Motivo COMPLETO en una frase (toasts, respuestas del server). null = en orden. */
  reason: string | null;
  /**
   * El mismo motivo COMPRIMIDO para espacios chicos (la fila del desplegable). Existe
   * porque la frase completa no cabe en una fila y truncarla la volvía ilegible — un
   * aviso cortado a la mitad es peor que ninguno. El completo va en el tooltip.
   */
  shortReason: string | null;
}

const OK: PieceReadiness = { applies: true, ready: true, reason: null, shortReason: null };

/** Une rótulos con comas y una "y" al final: "Exploración y Planificación". */
function enumerar(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} y ${labels[labels.length - 1]}`;
}

/** Lo que hay que saber del proyecto para responder si una pieza le corresponde. */
export interface PieceReadinessInput {
  tags: string[];
  piezasConContenido: string[];
  /**
   * `Project.hubspotPipelineId`. Requerido —no opcional— a propósito: con un default, un
   * llamador que se lo olvide recibe el aviso equivocado sobre la pieza central de un
   * desarrollo, y eso se ve como un dato, no como un bug.
   */
  hubspotPipelineId: string | null;
}

/**
 * Evalúa una pieza contra el proyecto.
 * `piezasConContenido` = slugs de las piezas que ya tienen algo escrito.
 */
export function pieceReadiness(slug: string, input: PieceReadinessInput): PieceReadiness {
  const needs = NEEDS[slug];
  if (!needs) return OK;

  // 1. ¿Le corresponde? Es lo más fuerte: la pieza directamente no va en este proyecto.
  //    Dos caminos independientes: el tag o el pipeline. Alcanza con uno.
  if (needs.anyTag?.length || needs.anyPipeline?.length) {
    const porTag = needs.anyTag?.some((t) => input.tags.includes(t)) ?? false;
    const key = resolvePipeline(input.hubspotPipelineId)?.key;
    const porPipeline = !!key && (needs.anyPipeline?.includes(key) ?? false);
    if (!porTag && !porPipeline) {
      // Con el RÓTULO que ve el usuario, no el slug: «Integración / Desarrollo a medida».
      const rotulos = enumerar((needs.anyTag ?? []).map((t) => `«${labelForTag(t)}»`));
      // El motivo nombra los DOS caminos, o miente por omisión: alguien podría estar
      // buscando por qué no aparece y el pipeline es la mitad de la respuesta.
      const porPipes = (needs.anyPipeline ?? [])
        .map((k) => `«${pipelineByKey(k).label}»`)
        .join(" ni ");
      const frase = [
        rotulos ? `Este proyecto no tiene ${rotulos}` : null,
        porPipes ? `no es del pipeline ${porPipes}` : null,
      ]
        .filter(Boolean)
        .join(", y ");
      return {
        applies: false,
        ready: true,
        reason: `${frase}. Podés agregarla igual, o sumar el tag en el handoff.`,
        shortReason: needs.anyTag?.length ? `Sin tag ${labelForTag(needs.anyTag[0])}` : "No aplica",
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
        shortReason: `Antes: ${rotulos}`,
      };
    }
  }

  return OK;
}

/**
 * ¿Este proyecto lleva esta pieza? (sin mirar los pasos previos).
 *
 * Se llamaba `pieceAppliesByTags`, y el nombre pasó a mentir en cuanto el pipeline se volvió
 * un camino válido. Un nombre que miente sobre lo que mira es peor que uno largo.
 */
export function piezaAplica(
  slug: string,
  input: { tags: string[]; hubspotPipelineId: string | null },
): boolean {
  const needs = NEEDS[slug];
  if (!needs?.anyTag?.length && !needs?.anyPipeline?.length) return true;
  if (needs.anyTag?.some((t) => input.tags.includes(t))) return true;
  const key = resolvePipeline(input.hubspotPipelineId)?.key;
  return !!key && (needs.anyPipeline?.includes(key) ?? false);
}
