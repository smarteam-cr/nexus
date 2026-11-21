/**
 * lib/impacto/respuesta-del-cliente.ts — CUÁNDO SE PRESENTÓ un entregable y QUÉ RESPONDIÓ el cliente (Elías, 21 nov).
 * PURO y client-safe.
 *
 * Append-only: cada respuesta es un hito con quién y cuándo, y el estado sale de leerlos en orden (`plegarHitos`), como
 * las presentaciones de los documentos del proyecto (lib/presentaciones). Hoy lo usa La escala de la empresa
 * (`HitoDeLaEscala`); un entregable nuevo guarda sus hitos en su tabla y reusa este plegado y su esquema.
 *
 * Lo que el cliente ACEPTÓ es el contexto de más peso para lo que sigue (./escalera.ts): el agente de impacto y el handoff
 * lo leen. Pedir ajustes no es aceptar: lo que vio queda «presentado», con la nota de lo que pidió.
 */
export const TIPOS_DE_HITO = ["presentada", "acepto", "acepto-con-cambios", "pidio-ajustes"] as const;
export type TipoDeHito = (typeof TIPOS_DE_HITO)[number];
export type RespuestaDelCliente = Exclude<TipoDeHito, "presentada">;

export const ETIQUETA_DE_LA_RESPUESTA: Record<RespuestaDelCliente, string> = {
  acepto: "Aceptó",
  "acepto-con-cambios": "Aceptó con cambios",
  "pidio-ajustes": "Pidió ajustes",
};

/** Hasta cuánto se escribe en la nota de una respuesta. */
export const MAX_NOTA_DE_LA_RESPUESTA = 1500;
/** Las piezas de lo que se vio, en texto: lo que leen el agente de impacto y el handoff. */
export const MAX_LO_QUE_SE_VIO = 4000;

export interface HitoGuardado {
  tipo: TipoDeHito;
  /** AAAA-MM-DD (solo en «presentada»). */
  fecha: string | null;
  nota: string | null;
  loQueSeVio: string | null;
  /** ISO: de cuándo es la foto que se vio. */
  publicadaEn: string | null;
  porEmail: string | null;
  /** ISO. */
  en: string;
}

export interface EstadoConElCliente {
  /** El día de la última presentación (AAAA-MM-DD), o null. */
  presentadaEl: string | null;
  presentadaPor: string | null;
  /** La última respuesta DESPUÉS de esa presentación (una de antes respondía a otra versión). */
  respuesta: { tipo: RespuestaDelCliente; nota: string | null; por: string | null; en: string } | null;
  /**
   * Lo último que el cliente aceptó (con o sin cambios), aunque después se haya presentado otra versión: hasta que acepte
   * la nueva, lo aceptado sigue siendo lo de más peso. null: nunca aceptó nada.
   */
  aceptado: { en: string; nota: string | null; loQueSeVio: string | null; conCambios: boolean } | null;
}

/** El estado, leyendo los hitos en orden (los recibe en cualquier orden). */
export function plegarHitos(hitos: readonly HitoGuardado[]): EstadoConElCliente {
  const enOrden = [...hitos].sort((a, b) => Date.parse(a.en) - Date.parse(b.en));
  const estado: EstadoConElCliente = { presentadaEl: null, presentadaPor: null, respuesta: null, aceptado: null };
  // Lo que se vio es lo de la PRESENTACIÓN a la que responde, no lo publicado al anotar la respuesta (revisión del 21 nov:
  // entre presentar y responder se pudo republicar una versión que el cliente nunca vio).
  let vistoAlPresentar: string | null = null;
  for (const h of enOrden) {
    if (h.tipo === "presentada") {
      estado.presentadaEl = h.fecha;
      estado.presentadaPor = h.porEmail;
      vistoAlPresentar = h.loQueSeVio;
      // Una presentación nueva espera su respuesta: la de antes respondía a otra versión.
      estado.respuesta = null;
      continue;
    }
    // Sin presentación no hay a qué responder (el servidor no lo deja guardar; si llega, no cuenta).
    if (!estado.presentadaEl) continue;
    estado.respuesta = { tipo: h.tipo, nota: h.nota, por: h.porEmail, en: h.en };
    if (h.tipo === "acepto" || h.tipo === "acepto-con-cambios") {
      estado.aceptado = { en: h.en, nota: h.nota, loQueSeVio: vistoAlPresentar ?? h.loQueSeVio, conCambios: h.tipo === "acepto-con-cambios" };
    }
  }
  return estado;
}

/** Lo que llega del navegador al anotar un hito (su esquema Zod vive aparte: ./respuesta-del-cliente-esquema.ts). */
export type NuevoHito =
  | { tipo: "presentada"; fecha: string }
  | { tipo: "acepto"; nota?: string }
  | { tipo: "acepto-con-cambios" | "pidio-ajustes"; nota: string };

/**
 * ¿Se puede anotar? La fecha de presentación es hoy o antes (se anota lo que ya pasó, no lo que se planea) y una respuesta
 * necesita una presentación anotada. `hoy`: AAAA-MM-DD en Costa Rica. null si se puede; si no, el porqué.
 */
export function porQueNoSeAnota(nuevo: NuevoHito, estado: EstadoConElCliente, hoy: string, o: { publicada: boolean }): string | null {
  if (!o.publicada) return "Todavía no hay nada publicado: el cliente ve lo que se publica, y eso es lo que se le presenta.";
  if (nuevo.tipo === "presentada") return nuevo.fecha > hoy ? "Anota el día en que ya se presentó (hoy o antes)." : null;
  if (!estado.presentadaEl) return "Primero anota cuándo se la presentaste.";
  return null;
}

/** El día de hoy en Costa Rica (AAAA-MM-DD). */
export function hoyEnCostaRica(ahora = new Date()): string {
  return ahora.toLocaleDateString("en-CA", { timeZone: "America/Costa_Rica" });
}

/** El día (AAAA-MM-DD, en Costa Rica) de un instante ISO: «aceptó el 19» aunque se anotara a las 7 p. m. */
export function diaEnCostaRica(iso: string): string {
  return hoyEnCostaRica(new Date(iso));
}

/**
 * Lo aceptado, en un bloque para un agente. "" si nunca aceptó nada. `conNota: false` (el handoff): sin la nota, que la
 * escribe a mano el vendedor y puede traer algo interno; el handoff escribe secciones que lee el cliente, y la regla es
 * filtrar el dato, no pedirle al modelo que no lo copie. El agente de impacto (interno) sí la lee.
 */
export function bloqueDeLoAceptado(estado: EstadoConElCliente, nombre: string, o: { conNota?: boolean } = {}): string {
  const a = estado.aceptado;
  if (!a) return "";
  const dia = diaEnCostaRica(a.en);
  return [
    `Lo que el cliente ACEPTÓ de ${nombre} el ${dia}${a.conCambios ? " (con cambios)" : ""}. Es lo de más peso: lo nuevo que lo contradiga se avisa, no lo pisa.`,
    a.loQueSeVio ? a.loQueSeVio.slice(0, MAX_LO_QUE_SE_VIO) : "",
    a.nota && o.conNota !== false ? `Lo que dijo el cliente al aceptarlo (lo anotó el equipo): ${a.nota}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
