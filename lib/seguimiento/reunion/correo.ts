/**
 * lib/seguimiento/reunion/correo.ts — el correo de seguimiento de una reunión con un cliente, como se guarda. PURO.
 * Ficha G (2026-10-17).
 *
 * Es el MISMO correo que el de las exploraciones (lib/exploraciones/correo-de-seguimiento*): lo escribe el mismo agente
 * con las mismas reglas (lib/seguimiento/reunion/correo-server.ts). Acá solo vive su forma guardada, que es la misma
 * que `CorreoDeSeguimiento` de la exploración, y su lectura tolerante. Nexus no envía nada: lo manda una persona.
 */

export interface CorreoDeLaReunion {
  asunto: string;
  cuerpo: string;
  /** Los correos del cliente que estuvieron en la reunión. */
  para: string[];
  /** ISO: cuándo lo escribió el agente. */
  en: string;
  corridaId: string;
  /** Lo cambió una persona: regenerarlo lo pisa (pide confirmación). */
  editado?: boolean;
}

/** El correo guardado, o null si no hay o no se entiende (un Json a medias no se muestra). */
export function leerCorreoGuardado(v: unknown): CorreoDeLaReunion | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const x = v as Record<string, unknown>;
  if (typeof x.asunto !== "string" || typeof x.cuerpo !== "string" || typeof x.en !== "string" || typeof x.corridaId !== "string") return null;
  const para = Array.isArray(x.para) ? x.para.filter((p): p is string => typeof p === "string") : [];
  return { asunto: x.asunto, cuerpo: x.cuerpo, para, en: x.en, corridaId: x.corridaId, ...(x.editado === true ? { editado: true } : {}) };
}

/** Lo que se le dice a quien lo pidió cuando la reunión no tiene la conversación. */
export const SIN_CONVERSACION_EN_LA_REUNION =
  "Esta reunión no tiene la conversación (solo la invitación): no hay de dónde sacar lo que entendimos ni lo que se acordó. Si tienes la transcripción o recuerdas lo que pasó, agrégalo con «+ Agregar reunión» y vuelve a armarlo.";
