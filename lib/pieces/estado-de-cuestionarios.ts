/**
 * lib/pieces/estado-de-cuestionarios.ts — LA FILA DE LOS CUESTIONARIOS EN EL RIEL. PURO y CLIENT-SAFE.
 *
 * Desde el 2026-10-11 los cuestionarios que contesta el cliente (el táctico, el de la escala y el de
 * estrategia) son un artefacto propio, entre el Kickoff y la Exploración (DECISIONS «Cuestionarios es
 * un artefacto propio…»). No viven en un canvas (`hasCanvas: false` en el registro), así que su fila no
 * sale de la lista de canvases: sale de acá, con lo que dice la base de cada cuestionario.
 *
 * Tres respuestas, y la fila las dice siempre escritas (nunca solo el color del punto):
 *  · «sin enviar»          — ninguno publicado (puede haber borradores);
 *  · «enviado»             — publicados, y nadie respondió todavía;
 *  · «respondido N de M»   — M = los publicados; respondido = cerrado por el CSE o con TODAS sus
 *                            pestañas enviadas por la persona.
 *
 * Es RECOMENDADO, no requerido: nada de acá frena una etapa. Lo que sí hace es alimentar el «Qué sigue»
 * del proyecto («Manda los cuestionarios al cliente»), que se va solo al publicar uno o con «Ahora no».
 */

/** El slug de la pieza (lib/pieces/registry.ts). */
export const PIEZA_CUESTIONARIOS = "questionnaires";

/**
 * El «Ahora no» de la sugerencia vive en el canvas del Kickoff: una entry reservada del Json
 * `ProjectCanvas.sections` (el mismo contrato que `__doc`: el doble guion bajo dice «no soy una sección»).
 */
export const CLAVE_DESCARTE_CUESTIONARIOS = "__cuestionarios";

/** Lo mínimo de cada cuestionario para la fila. */
export interface CuestionarioParaElRiel {
  publicadoAt: Date | string | null;
  cerradoAt: Date | string | null;
  pestanas: Array<{ enviadaAt: Date | string | null }>;
}

export interface EstadoDeCuestionarios {
  /** Cuántos hay (borradores incluidos). */
  total: number;
  publicados: number;
  respondidos: number;
  /** El texto corto de la fila: «sin enviar», «enviado», «respondido 1 de 2». */
  corto: string;
  /** La frase completa, para el `title`. */
  largo: string;
  /** El punto verde: ya hay al menos uno en manos del cliente. */
  enviado: boolean;
  /** Alguien dijo «Ahora no» a la sugerencia de mandarlos. */
  sugerenciaDescartada: boolean;
  /**
   * Quien mira puede escribir los cuestionarios (el gate de `guardProjectHandoffAccess`). Lo pone el listado de
   * canvases; sin él (o en false) no se ofrece «Ahora no»: el PATCH respondería 403.
   */
  puedeEditar?: boolean;
}

function respondido(c: CuestionarioParaElRiel): boolean {
  if (c.cerradoAt) return true;
  return c.pestanas.length > 0 && c.pestanas.every((p) => !!p.enviadaAt);
}

export function estadoDeCuestionarios(
  lista: readonly CuestionarioParaElRiel[],
  sugerenciaDescartada = false,
): EstadoDeCuestionarios {
  const publicados = lista.filter((c) => !!c.publicadoAt);
  const respondidos = publicados.filter(respondido).length;
  const base = { total: lista.length, publicados: publicados.length, respondidos, sugerenciaDescartada };
  if (publicados.length === 0) {
    return {
      ...base,
      corto: "sin enviar",
      largo:
        lista.length === 0
          ? "Todavía no armaste ningún cuestionario para el cliente."
          : `${lista.length === 1 ? "Hay un cuestionario armado" : `Hay ${lista.length} cuestionarios armados`} y ninguno publicado: el cliente todavía no ve nada.`,
      enviado: false,
    };
  }
  if (respondidos === 0) {
    return {
      ...base,
      corto: "enviado",
      largo: `${publicados.length === 1 ? "Un cuestionario publicado" : `${publicados.length} cuestionarios publicados`}: nadie respondió todavía.`,
      enviado: true,
    };
  }
  return {
    ...base,
    corto: `respondido ${respondidos} de ${publicados.length}`,
    largo: `${respondidos} de ${publicados.length} cuestionarios publicados ya ${respondidos === 1 ? "está respondido" : "están respondidos"}.`,
    enviado: true,
  };
}

/** ¿Alguien dijo «Ahora no»? Lee la entry reservada del canvas del Kickoff. Tolerante a basura. */
export function sugerenciaDescartadaEn(sections: unknown): boolean {
  if (!Array.isArray(sections)) return false;
  const e = sections.find(
    (x): x is { key: string; descartadaAt?: unknown } =>
      !!x && typeof x === "object" && (x as { key?: unknown }).key === CLAVE_DESCARTE_CUESTIONARIOS,
  );
  return !!e && typeof e.descartadaAt === "string" && e.descartadaAt.length > 0;
}

/**
 * El Json de secciones con el «Ahora no» puesto o sacado. Toca SOLO su entry: el resto (las secciones
 * del kickoff y el `__doc`) queda tal cual.
 */
export function conSugerenciaDescartada(
  sections: unknown,
  descartada: boolean,
  por: string | null,
  ahora: string,
): Array<Record<string, unknown>> {
  const resto = (Array.isArray(sections) ? sections : []).filter(
    (x): x is Record<string, unknown> =>
      !!x && typeof x === "object" && (x as { key?: unknown }).key !== CLAVE_DESCARTE_CUESTIONARIOS,
  );
  if (!descartada) return resto;
  // `label` igual que `withBriefUpdated` con el `__doc`: toda entry del Json lleva key y label.
  return [...resto, { key: CLAVE_DESCARTE_CUESTIONARIOS, label: CLAVE_DESCARTE_CUESTIONARIOS, descartadaAt: ahora, descartadaPor: por }];
}
