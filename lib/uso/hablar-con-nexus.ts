/**
 * lib/uso/hablar-con-nexus.ts — el conteo de «Hablar con Nexus» en «Uso de Nexus» (etapa 0 del plan maestro, 22 nov:
 * «vueltas, guardadas, ¿Era una pregunta?, cambios aplicados y gasto»). PURO: recibe las corridas y las cuenta. Las lee
 * ./hablar-con-nexus-server.ts.
 *
 * Sale de lo que ya guardan las corridas (`AgentRun` con `filters.modo` del chat): cada «Enviar» es una vuelta, una
 * pregunta respondida es una corrida de respuesta, la nota guardada queda en `output.notaClave`, lo propuesto en
 * `output.cambios` y lo que se hizo con cada cambio en `output.estados`. «¿Era una pregunta?» y «Guardarlo como nota» se
 * marcan en `filters.boton` desde el 22 nov: las vueltas de antes no lo dicen.
 */

/** Una corrida del chat, como la lee el conteo. */
export interface CorridaDelChat {
  /** `chat-de-nexus` (una vuelta) o `chat-de-nexus-respuesta` (una pregunta respondida). */
  modo: string;
  boton: string | null;
  email: string | null;
  output: string | null;
}

export interface ConteoDeHablarConNexus {
  vueltas: number;
  preguntasRespondidas: number;
  notasGuardadas: number;
  eraUnaPregunta: number;
  guardarloComoNota: number;
  cambiosPropuestos: number;
  cambiosAplicados: number;
  cambiosDescartados: number;
  personas: number;
}

const objeto = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

function leer(output: string | null): Record<string, unknown> | null {
  if (!output) return null;
  try {
    return objeto(JSON.parse(output));
  } catch {
    return null;
  }
}

export function contarHablarConNexus(corridas: readonly CorridaDelChat[], o: { modoDelChat: string; modoDeLaRespuesta: string; botonPregunta: string; botonNota: string }): ConteoDeHablarConNexus {
  const c: ConteoDeHablarConNexus = { vueltas: 0, preguntasRespondidas: 0, notasGuardadas: 0, eraUnaPregunta: 0, guardarloComoNota: 0, cambiosPropuestos: 0, cambiosAplicados: 0, cambiosDescartados: 0, personas: 0 };
  const personas = new Set<string>();
  for (const r of corridas) {
    if (r.email) personas.add(r.email.toLowerCase());
    if (r.modo === o.modoDeLaRespuesta) {
      c.preguntasRespondidas++;
      continue;
    }
    if (r.modo !== o.modoDelChat) continue;
    c.vueltas++;
    if (r.boton === o.botonPregunta) c.eraUnaPregunta++;
    if (r.boton === o.botonNota) c.guardarloComoNota++;
    const s = leer(r.output);
    if (!s || s.tipo !== "listo") continue;
    if (typeof s.notaClave === "string" && s.notaClave) c.notasGuardadas++;
    if (Array.isArray(s.cambios)) c.cambiosPropuestos += s.cambios.length;
    for (const e of Object.values(objeto(s.estados) ?? {})) {
      if (e === "aplicado") c.cambiosAplicados++;
      else if (e === "descartado") c.cambiosDescartados++;
    }
  }
  c.personas = personas.size;
  return c;
}
