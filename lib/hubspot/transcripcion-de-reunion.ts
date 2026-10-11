/**
 * lib/hubspot/transcripcion-de-reunion.ts — el texto de una reunión grabada con HubSpot. PURO.
 *
 * Desde el 31 de agosto de 2026, una reunión grabada con el notetaker de HubSpot (o sincronizada desde
 * Zoom, Meet o Teams) guarda la grabación en la PROPIA reunión: el resumen de IA en `hs_meeting_summary`,
 * si tiene transcripción en `hs_has_meeting_transcript` y el número de la transcripción en
 * `hs_meeting_transcription_id`, que se pide aparte (grabaciones-de-reuniones.ts). Nada de eso viene por la API
 * v1 de engagements, que es la que lee Nexus: de la reunión del 28 sep de CreditForce solo llegaba la
 * invitación, con 49 minutos grabados en HubSpot (Elías, 2026-10-08).
 */

/** Una intervención de la transcripción, como la devuelve HubSpot. */
export interface IntervencionDeHubspot {
  text?: string;
  startTimeMillis?: number;
  speaker?: { name?: string; email?: string } | null;
}

/** Hasta cuánto texto de una transcripción se guarda (una reunión de una hora ronda los 50.000). */
export const MAX_TRANSCRIPCION = 60_000;

/** «m:ss» desde el inicio de la reunión. */
function minuto(ms: number | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "";
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * La transcripción como texto: «Nombre (m:ss): lo que dijo», juntando lo seguido de la misma persona.
 * Vacío si no trae texto.
 */
export function textoDeLaTranscripcion(intervenciones: readonly IntervencionDeHubspot[], max = MAX_TRANSCRIPCION): string {
  const lineas: string[] = [];
  let quien = "";
  for (const u of [...intervenciones].sort((a, b) => (a.startTimeMillis ?? 0) - (b.startTimeMillis ?? 0))) {
    const t = (u.text ?? "").replace(/\s+/g, " ").trim();
    if (!t) continue;
    const nombre = u.speaker?.name?.trim() || u.speaker?.email?.trim() || "Participante";
    if (nombre === quien && lineas.length) lineas[lineas.length - 1] += ` ${t}`;
    else {
      const m = minuto(u.startTimeMillis);
      lineas.push(`${nombre}${m ? ` (${m})` : ""}: ${t}`);
      quien = nombre;
    }
  }
  const texto = lineas.join("\n");
  return texto.length > max ? `${texto.slice(0, max)}\n[…]` : texto;
}

/** HTML de HubSpot a texto plano. */
export function sinHtml(s: string): string {
  return s
    .replace(/<\s*(br|\/p|\/div|\/li|\/h\d)\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

/**
 * El texto de una reunión para leer: primero el resumen de IA y la transcripción (lo que se habló), después
 * lo que ya traía (la descripción y las notas, que suelen ser la invitación). Cada parte con su rótulo.
 */
export function textoDeLaReunion(o: { resumen?: string | null; transcripcion?: string | null; resto?: string | null }): string {
  const partes = [
    o.resumen?.trim() && `Resumen de la grabación (IA de HubSpot):\n${sinHtml(o.resumen)}`,
    o.transcripcion?.trim() && `Transcripción de la grabación:\n${o.transcripcion.trim()}`,
    o.resto?.trim() && (o.resumen?.trim() || o.transcripcion?.trim() ? `Descripción de la reunión:\n${o.resto.trim()}` : o.resto.trim()),
  ].filter((x): x is string => !!x);
  return partes.join("\n\n");
}
