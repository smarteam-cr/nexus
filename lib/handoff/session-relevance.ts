/**
 * lib/handoff/session-relevance.ts
 *
 * Qué alimenta el HANDOFF (Sales→CS), en DOS capas:
 *
 *   1. RELEVANCIA de la sesión (`classifyHandoffSession`): una sesión es material de
 *      handoff si su título es de HANDOFF o KICKOFF, O si participó alguien de VENTAS
 *      en la sala. El resto (levantamientos/diagnósticos semanales, implementación,
 *      review, etc.) son ENTREGA DE SERVICIO y NO alimentan — aunque tengan
 *      "Sales/Marketing/Service" en el título o un CSE como organizador.
 *
 *   2. POLÍTICA del LINK sesión↔proyecto (`linkFeedsHandoff`): en clientes
 *      multi-proyecto, la historia de venta de una sesión la cuenta SU proyecto
 *      (link primario); a otro proyecto solo entra por confianza alta del
 *      clasificador o forzada a mano. Evita que los handoffs de dos proyectos del
 *      mismo cliente repitan las mismas sesiones vía links secundarios.
 *
 * Fuente ÚNICA de keywords y política — la usan la generación (analyze, vía su
 * classifyForHandoff inline), la revisión de sesiones (A2 · session-candidates) y
 * el readiness del handoff (lib/handoff/feeding.ts).
 */

// Las dos listas viven ahora en el vocabulario único de tipos de reunión
// (lib/sessions/session-type.ts), donde cada palabra declara EXPLÍCITAMENTE su rol en
// este filtro. Se re-exportan desde acá porque este archivo sigue siendo la casa de la
// política del handoff y varios módulos las importan por este camino.
//
// Lo que se gana: el vocabulario de tipos puede crecer sin tocar el handoff — una
// palabra nueva nace declarando que NO entra a estas listas, y hay un candado
// (lib/sessions/session-type.test.ts) que falla si alguna se cuela.
export {
  HANDOFF_EXCLUDE_TITLE_KEYWORDS,
  HANDOFF_INCLUDE_TITLE_KEYWORDS,
} from "@/lib/sessions/session-type";

import {
  HANDOFF_EXCLUDE_TITLE_KEYWORDS as EXCLUDE_KW,
  HANDOFF_INCLUDE_TITLE_KEYWORDS as INCLUDE_KW,
  normalizeTitle,
} from "@/lib/sessions/session-type";

/**
 * ¿Esta sesión alimenta el handoff? Excluir-por-título gana; luego incluir-por-título;
 * si el título es neutro, incluye sólo si hay Ventas en la sala (participants u organizer).
 */
export function classifyHandoffSession(
  title: string,
  participants: string[],
  organizerEmail: string | null,
  salesEmails: Set<string>,
): { include: boolean; reason: string } {
  const t = normalizeTitle(title || "");
  const excludeHit = EXCLUDE_KW.find((kw) => t.includes(kw));
  if (excludeHit) return { include: false, reason: `título de entrega/CS ("${excludeHit}")` };
  const includeHit = INCLUDE_KW.find((kw) => t.includes(kw));
  if (includeHit) return { include: true, reason: `título de venta ("${includeHit}")` };
  const all = organizerEmail ? [...participants, organizerEmail] : participants;
  if (all.some((p) => salesEmails.has(p.toLowerCase()))) return { include: true, reason: "Ventas en la sala" };
  return { include: false, reason: "sin Ventas y título neutro" };
}

/**
 * Piso de confianza para que un link SECUNDARIO alimente el handoff. Bajado de 0.6 a 0.4
 * (2026-07-22, modelo "todo lo incluido alimenta salvo lo excluido"): el clasificador ya
 * descarta asignaciones <0.4, así que en la práctica TODO secundario propuesto por IA
 * alimenta. La confianza pasa a ser un PISO anti-ruido, no un veto de curaduría — la
 * curaduría multi-proyecto la hace el humano con el toggle Incluir/Excluir (handoffOverride)
 * y la relevancia la sigue filtrando `appliesRule`.
 */
export const HANDOFF_MIN_SECONDARY_CONFIDENCE = 0.4;

/**
 * ¿Este LINK sesión↔proyecto alimenta el handoff del proyecto?
 * Política ÚNICA (analyze + session-candidates + readiness — NO cronograma/minutas):
 *   1. handoffOverride=false → nunca (la "X" del panel — exclusión humana).
 *   2. handoffOverride=true  → siempre (Incluir a mano / anclaje al generar).
 *   3. Sin override: links PRIMARIOS o secundarios por encima del piso de confianza
 *      (0.4), y de esos, los que la regla de relevancia (`appliesRule`) incluye.
 * `confidence ?? 0` ⇒ un secundario manual/legacy sin confidence NO alimenta salvo
 * forzado — intencional: se incluye a mano con el toggle si corresponde.
 */
export function linkFeedsHandoff(
  link: { isPrimary: boolean; confidence: number | null; handoffOverride: boolean | null },
  appliesRule: boolean,
): boolean {
  if (link.handoffOverride === false) return false;
  if (link.handoffOverride === true) return true;
  if (!link.isPrimary && (link.confidence ?? 0) < HANDOFF_MIN_SECONDARY_CONFIDENCE) return false;
  return appliesRule;
}
