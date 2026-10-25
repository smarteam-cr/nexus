/**
 * lib/sessions/audio-de-reunion.ts — LA REUNIÓN PRESENCIAL: el audio grabado con un teléfono, transcrito (T5,
 * 2026-10-25; docs/reuniones-pieza-angular-plan.md, el caso de Grupo Avis). PURO y client-safe.
 *
 * El camino: el navegador sube el archivo DIRECTO a Google Cloud Storage (una subida reanudable que abre el servidor:
 * nginx corta en 1 MB y un audio de una hora pesa decenas), el servidor le pide a Speech-to-Text de Google que lo
 * transcriba en lote, y el job `reuniones-audio` mira la operación hasta que termina. El texto entra a la reunión como
 * una transcripción agregada a mano (marca `aMano`, origen «audio») y se lee como cualquier otra. El archivo se borra del
 * bucket cuando la transcripción quedó guardada.
 *
 * Detrás de `REUNIONES_AUDIO=1` (apagada: Elías la prende después de habilitar la API en Google Cloud) y del bucket
 * `GOOGLE_SPEECH_BUCKET`. Sin las dos, la pantalla no ofrece subir audio.
 */

export type Entorno = Readonly<Record<string, string | undefined>>;

/** Lo que se acepta subir: lo que graba un teléfono y lo que Speech-to-Text decodifica solo. */
export const EXTENSIONES_DE_AUDIO = [".m4a", ".mp3", ".wav", ".flac", ".ogg", ".opus", ".webm", ".aac", ".amr"] as const;
export const ACEPTA_AUDIO = [...EXTENSIONES_DE_AUDIO, "audio/*"].join(",");
/** 500 MB: varias horas en .m4a o .mp3; una hora en .wav sin comprimir. */
export const MAX_BYTES_AUDIO = 500 * 1024 * 1024;
/** El costo de referencia de Speech-to-Text en lote, en dólares por minuto (por confirmar con el precio vigente). */
export const USD_POR_MINUTO_DE_AUDIO = 0.016;

/** ¿Está prendida la transcripción de audio? La bandera Y el bucket (y las credenciales de Google). */
export function audioPrendido(env: Entorno): boolean {
  return env.REUNIONES_AUDIO === "1" && !!env.GOOGLE_SPEECH_BUCKET?.trim() && !!env.GOOGLE_SERVICE_ACCOUNT_KEY;
}

/** Por qué no se ofrece subir audio en este servidor, o null. Para Integraciones y el job. */
export function motivoAudioApagado(env: Entorno): string | null {
  const faltan = [
    env.REUNIONES_AUDIO === "1" ? null : "REUNIONES_AUDIO=1",
    env.GOOGLE_SPEECH_BUCKET?.trim() ? null : "GOOGLE_SPEECH_BUCKET",
    env.GOOGLE_SERVICE_ACCOUNT_KEY ? null : "GOOGLE_SERVICE_ACCOUNT_KEY",
  ].filter((v): v is string => v !== null);
  return faltan.length ? `Apagado: falta ${faltan.join(" y ")} en el .env del servidor.` : null;
}

/** La extensión del archivo, en minúsculas («.m4a»), o "". */
export function extensionDe(nombre: string): string {
  const m = /\.[a-z0-9]{2,5}$/i.exec(nombre.trim());
  return m ? m[0].toLowerCase() : "";
}

/** Por qué no se puede subir este archivo, o null. */
export function problemaDelAudio(a: { archivo: string; bytes: number; tipo?: string | null }): string | null {
  const ext = extensionDe(a.archivo);
  const esAudio = (EXTENSIONES_DE_AUDIO as readonly string[]).includes(ext) || (a.tipo ?? "").startsWith("audio/");
  if (!esAudio) return "Ese archivo no es de audio. Sube la grabación (.m4a, .mp3, .wav…). Si tienes el texto, pégalo en «Agregar lo que pasó».";
  if (a.bytes <= 0) return "El archivo está vacío.";
  if (a.bytes > MAX_BYTES_AUDIO) return `Es demasiado grande: el tope es de ${Math.round(MAX_BYTES_AUDIO / 1024 / 1024)} MB.`;
  return null;
}

/** El nombre del objeto en el bucket: por reunión, sin el nombre que puso la persona (puede traer datos). */
export function objetoDelAudio(sessionId: string, archivo: string, ahora: Date): string {
  const limpio = sessionId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 120);
  return `reuniones/${limpio}/${ahora.getTime()}${extensionDe(archivo) || ".audio"}`;
}

/** El texto que quedó de la transcripción: los pedazos que devuelve Speech-to-Text, uno por renglón. */
export function textoDeLaTranscripcion(pedazos: readonly (string | null | undefined)[]): string {
  return pedazos
    .map((p) => (p ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export type EstadoDelAudio = "SUBIENDO" | "TRANSCRIBIENDO" | "LISTO" | "ERROR";

/** El estado, dicho para la persona. */
export function estadoDelAudioParaLaPersona(e: { estado: EstadoDelAudio; error: string | null; minutos: number | null }): string {
  switch (e.estado) {
    case "SUBIENDO":
      return "Subiendo el audio…";
    case "TRANSCRIBIENDO":
      return "Google está transcribiendo el audio. Una hora de grabación tarda unos minutos; puedes cerrar esta página.";
    case "LISTO":
      return `Listo: el audio quedó como la transcripción de la reunión${e.minutos ? ` (${Math.round(e.minutos)} min)` : ""}.`;
    case "ERROR":
      return `No se pudo transcribir${e.error ? `: ${e.error.slice(0, 200)}` : ""}. Puedes volver a subirlo.`;
  }
}

/** Cuánto se espera una transcripción antes de darla por perdida (Speech-to-Text en lote rara vez pasa de una hora). */
export const HORAS_MAXIMAS_TRANSCRIBIENDO = 12;
