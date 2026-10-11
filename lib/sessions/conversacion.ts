/**
 * lib/sessions/conversacion.ts — la transcripción de una reunión, comprimida y numerada por turno. PURO.
 *
 * La transcripción de Gemini trae un encabezado («… - Transcripción»), marcas de tiempo sueltas («00:12:40»), líneas
 * «Nombre: lo que dijo» y un cierre («La transcripción finalizó después de …»). Para leerla con IA se deja SOLO lo
 * dicho: sin marcas de tiempo ni encabezados, con los turnos seguidos de la misma persona juntos, y cada turno con su
 * número, que es lo que cita el modelo (el texto literal lo pone el código).
 *
 * No se corta en silencio: si no entra en el tope, `recortada` lo dice y se queda con los primeros turnos enteros.
 */

export interface Turno {
  /** 1, 2, 3…: lo que cita el modelo. */
  n: number;
  hablante: string;
  texto: string;
}

export interface ConversacionComprimida {
  turnos: Turno[];
  /** No entró entera en el tope: faltan turnos del final. */
  recortada: boolean;
  /** Los caracteres de lo dicho (sin marcas de tiempo), antes de recortar. */
  caracteres: number;
}

const MARCA_DE_TIEMPO = /^\d{1,2}:\d{2}(?::\d{2})?$/;
const LINEA_DE_HABLANTE = /^([^:\n]{2,60}):\s+(.+)$/;
const RUIDO = /transcripci[oó]n|notetaker|^gemini\b|se gener[oó] por computadora|puede contener errores/i;

/** ¿Es una línea que no es conversación? (encabezado, cierre, aviso de la herramienta). */
function esRuido(linea: string): boolean {
  return RUIDO.test(linea) && !LINEA_DE_HABLANTE.exec(linea)?.[2]?.trim().length;
}

export function comprimirConversacion(transcript: string, tope: number): ConversacionComprimida {
  const turnos: { hablante: string; partes: string[] }[] = [];
  for (const cruda of transcript.split(/\r?\n/)) {
    const linea = cruda.trim();
    if (!linea || MARCA_DE_TIEMPO.test(linea)) continue;
    const m = LINEA_DE_HABLANTE.exec(linea);
    if (m && !RUIDO.test(m[1])) {
      const hablante = m[1].trim();
      const dicho = m[2].trim();
      const ultimo = turnos[turnos.length - 1];
      if (ultimo && ultimo.hablante === hablante) ultimo.partes.push(dicho);
      else turnos.push({ hablante, partes: [dicho] });
      continue;
    }
    if (esRuido(linea)) continue;
    // Una línea sin «Nombre:» sigue lo que decía el turno anterior (Gemini a veces parte un párrafo).
    const ultimo = turnos[turnos.length - 1];
    if (ultimo) ultimo.partes.push(linea);
  }

  const completos = turnos.map((t, i) => ({ n: i + 1, hablante: t.hablante, texto: t.partes.join(" ").replace(/\s+/g, " ").trim() })).filter((t) => t.texto);
  const caracteres = completos.reduce((s, t) => s + t.hablante.length + t.texto.length + 4, 0);
  const salida: Turno[] = [];
  let usados = 0;
  for (const t of completos) {
    const largo = t.hablante.length + t.texto.length + 4;
    if (usados + largo > tope) break;
    salida.push({ ...t, n: salida.length + 1 });
    usados += largo;
  }
  return { turnos: salida, recortada: salida.length < completos.length, caracteres };
}

/** Cómo le llega al modelo: «[12] Ana Pérez: …», un turno por línea. */
export function conversacionComoTexto(turnos: readonly Turno[]): string {
  return turnos.map((t) => `[${t.n}] ${t.hablante}: ${t.texto}`).join("\n");
}
