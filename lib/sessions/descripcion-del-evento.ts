/**
 * lib/sessions/descripcion-del-evento.ts — la descripción de un evento del calendario, limpia: la AGENDA de la reunión
 * (lo que se iba a tratar). PURO. Ficha G (2026-10-17).
 *
 * Google Calendar guarda la descripción en HTML y le agrega, al final o al principio, el bloque de la videollamada
 * («Únete con Google Meet», el enlace, el teléfono y el PIN) entre dos líneas `-::~:~::~:~…`. Lo que queda después de
 * sacar ese bloque y el HTML es lo que escribió quien invitó. Una descripción que solo era ese bloque es null.
 */

/** Hasta cuánto se guarda (una invitación larga no es una agenda: lo que pasa de acá se corta). */
export const MAX_DESCRIPCION_DEL_EVENTO = 4000;

/**
 * El bloque de la videollamada que agrega Google: de una línea separadora `-::~:~::~…::~:~::-` a la siguiente. Una
 * separadora sola (sin su pareja) se saca como línea suelta (`LINEA_DE_VIDEOLLAMADA`).
 */
const BLOQUE_DE_GOOGLE = /-::~:~::~[^\n]*::-[\s\S]*?-::~:~::~[^\n]*::-/g;

/** Las líneas del bloque de la videollamada, si vinieron sin sus separadores (una copia pegada a mano, otro idioma). */
const LINEA_DE_VIDEOLLAMADA =
  /^(?:\s*(?:únete con google meet|unirse con google meet|join with google meet|join by phone|únete por teléfono|unirse por teléfono|more phone numbers|más números de teléfono|learn more about meet|más información sobre meet|meeting link|pin:|join zoom meeting|unirse a la reunión zoom|meeting id|id de reunión|passcode|código de acceso)\b.*|\s*(?:https?:\/\/)?(?:meet\.google\.com|tel\.meet|[\w.-]*zoom\.us)\/\S*\s*|\s*(?:\([A-Z]{2}\)\s*)?(?:\(?\+?\d[\d\s().-]{6,}\)?\s*(?:pin[:\s].*)?)|\s*-::~:~::~.*|\s*please do not edit this section\.?\s*|\s*no edites esta sección\.?\s*)$/i;

const ENTIDADES: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'" };

/** HTML de Google Calendar a texto: saltos donde el HTML los pone, viñetas para las listas, sin etiquetas. */
export function htmlATexto(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "\n• ")
    .replace(/<\/\s*(p|div|ul|ol|h[1-6])\s*>/gi, "\n")
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, texto: string) => {
      const t = texto.replace(/<[^>]+>/g, "").trim();
      return t && t !== href ? `${t} (${href})` : href;
    })
    .replace(/<[^>]+>/g, "")
    .replace(/&(?:nbsp|amp|lt|gt|quot|apos|#39);/g, (e) => ENTIDADES[e] ?? e)
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(Number(n)));
}

/**
 * La descripción lista para guardar: sin el bloque de la videollamada, sin HTML, sin líneas en blanco de más y
 * cortada a `MAX_DESCRIPCION_DEL_EVENTO`. null si no queda nada.
 */
export function limpiarDescripcionDelEvento(crudo: string | null | undefined): string | null {
  if (!crudo || !crudo.trim()) return null;
  const sinBloque = crudo.replace(BLOQUE_DE_GOOGLE, "\n");
  const texto = htmlATexto(sinBloque)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trimEnd())
    .filter((l) => !LINEA_DE_VIDEOLLAMADA.test(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!texto || /^[•\s-]*$/.test(texto)) return null;
  return texto.length > MAX_DESCRIPCION_DEL_EVENTO ? `${texto.slice(0, MAX_DESCRIPCION_DEL_EVENTO - 1).trimEnd()}…` : texto;
}
