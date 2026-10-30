/**
 * lib/planificacion/por-que-vacia.ts — POR QUÉ QUEDÓ VACÍA cada sección de la Planificación (2026-10-29, feedback de Elías:
 * «en vez de entregarlas en blanco, deberían por lo menos explicar por qué»). Puro.
 *
 * El runner (lib/canvas/planificacion-generate.ts) lo llama con cada sección que quedó vacía después de generar y guarda la
 * línea en su data (`__porQueVacia`, lib/landing/por-que-vacia.ts): el equipo la ve como aviso, el cliente no la ve.
 *
 * El orden de las razones, de la más cierta a la más genérica:
 *   1. Las CURADAS (`agentGenerated: false`): la IA no las escribe al generar (la corrida está en su tope de tokens), así
 *      que la razón es siempre esa, con quién la llena.
 *   2. Las que dependen de algo que no está: «Las acciones, en detalle» sin diagnóstico; el despliegue por olas con
 *      adopción directa (vacío es lo correcto).
 *   3. La frase del agente (`__vacias`), que nombra lo que faltó.
 *   4. La genérica: lo que se leyó y no alcanzó.
 */
import { ACCIONES_EN_DETALLE_KEY } from "@/components/landing/configs/planificacion.defs";

/** Las secciones curadas: quién las llena. Sumar una curada a la Planificación es sumar su línea acá. */
export const POR_QUE_DE_LAS_CURADAS: Readonly<Record<string, string>> = {
  ficha_proyecto: "La IA no escribe la ficha del proyecto al generar: los hubs, las sesiones y quiénes participan los llena el equipo.",
  usuarios_permisos: "La IA no escribe los usuarios y permisos (nunca inventa personas): los llena el equipo, o el cliente en su enlace.",
  canales_entrada: "La IA no escribe por dónde entran los leads al generar: lo llena el equipo, o el cliente en su enlace.",
  formularios: "La IA no escribe los formularios al generar: se arman eligiendo los campos de la tabla de propiedades.",
  cotizaciones: "La IA no escribe las cotizaciones al generar: van si el alcance trae Sales Hub Pro o más, y las llena el equipo.",
  informes: "La IA no escribe los informes y paneles al generar: los llena el equipo, cada uno atado a un objetivo del diagnóstico.",
};

export interface SeccionVacia {
  key: string;
  label: string;
  /** false = curada: la IA no la escribe al generar. */
  agentGenerated: boolean;
}

export interface LoQueSeLeyo {
  /** Lo que dijo el agente de cada sección que dejó vacía (`__vacias`). */
  porQueDelAgente: Readonly<Record<string, string>>;
  /** ¿Había un diagnóstico con contenido? */
  hayDiagnostico: boolean;
  /** ¿La adopción es directa (confirmada, sugerida o asumida)? Ahí el despliegue por olas no aplica. */
  adopcionDirecta: boolean;
  /** ¿La planificación leyó alguna reunión? */
  leyoReuniones: boolean;
}

/** La línea que explica por qué quedó vacía la sección. */
export function porQueQuedoVacia(s: SeccionVacia, l: LoQueSeLeyo): string {
  if (!s.agentGenerated) {
    return POR_QUE_DE_LAS_CURADAS[s.key] ?? `La IA no escribe «${s.label}» al generar: la llena el equipo.`;
  }
  if (s.key === ACCIONES_EN_DETALLE_KEY && !l.hayDiagnostico) {
    return "Todavía no hay diagnóstico: esta sección desarrolla sus acciones. Genera el diagnóstico y vuelve a generar la planificación.";
  }
  if (s.key === "plan_despliegue" && l.adopcionDirecta) {
    return "La adopción es directa (todo el equipo a la vez), así que el despliegue por olas no aplica. Si el arranque va por pilotos, cámbialo en el proyecto y vuelve a generar.";
  }
  const delAgente = l.porQueDelAgente[s.key]?.trim();
  if (delAgente) return delAgente;
  return l.leyoReuniones
    ? `No encontré en las reuniones, el handoff ni el diagnóstico con qué llenar «${s.label}».`
    : `No encontré con qué llenar «${s.label}»: la planificación no leyó ninguna reunión. Revisa su Contexto adicional: las de puertas adentro entran solo con «Usar».`;
}
