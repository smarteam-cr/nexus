/**
 * lib/comunicaciones/sin-agendar.ts — EL AVISO DE LAS 48 HORAS. PURO (sin-agendar.test.ts).
 *
 * El caso que lo motivó: una minuta con fechas se le mandó al cliente por correo, la reunión que prometía nunca se
 * agendó, nadie le dio seguimiento y el cliente le escribió a Marco (iniciativa B de docs/roadmap.md).
 *
 * Un compromiso es una tarea que salió de lo que se le prometió al cliente: de un correo enviado (`origen = "correo"`)
 * o de la lectura de seguimiento de una reunión (su `origenId` lleva `:seg-`). Avisa cuando, a las 48 horas de que Nexus
 * lo leyó:
 *   · tiene fecha, o es una reunión prometida;
 *   · nadie lo tomó: sigue propuesto, o «Por asignar» sin responsable;
 *   · y si es una reunión, no está en el calendario (un evento de la cuenta en los próximos días), no está planeada en
 *     Tareas y no ocurrió (no hubo una reunión con la cuenta desde que se prometió).
 * Rechazarlo o «Ya no se hará» es una decisión: no avisa. Deja de avisar a los 21 días: ahí ya es limpieza.
 */

export const HORAS_PARA_AVISAR = 48;
export const DIAS_QUE_AVISA = 21;

/** Lo que dice que el compromiso es una reunión: la reunión se agenda; lo demás se hace. */
const UNA_REUNION =
  /\b(reuni[oó]n|reunirnos|reunimos|sesi[oó]n|llamada|videollamada|meet|kick ?off|demo|presentaci[oó]n|agendar|agendamos|agenda(r|mos)? (una|la)|nos vemos|taller|capacitaci[oó]n|workshop)\b/i;

export function esReunionPrometida(texto: string): boolean {
  return UNA_REUNION.test(texto);
}

/** ¿La tarea es un compromiso con el cliente (de un correo o de la lectura de seguimiento de una reunión)? */
export function esCompromisoConElCliente(t: { origen: string; origenId: string | null }): boolean {
  if (t.origen === "correo") return true;
  return !!t.origenId && t.origenId.startsWith("l:") && t.origenId.includes(":seg-");
}

export interface CompromisoParaAvisar {
  tareaId: string;
  numero: number;
  titulo: string;
  estado: string;
  responsableEmail: string | null;
  origen: string;
  origenId: string | null;
  /** Cuándo lo leyó Nexus (se creó la tarea). */
  creadaAt: Date;
  /** AAAA-MM-DD, o null. */
  venceEl: string | null;
  clientId: string;
}

export interface LoQueSabemosDeLaCuenta {
  /** Hay una reunión planeada en Tareas (clase «reunion», abierta y por venir). */
  reunionPlaneada: boolean;
  /** Los inicios de los eventos de la cuenta en el calendario de quien la lleva. null = no se pudo leer el calendario. */
  eventosProximos: readonly Date[] | null;
  /** Las reuniones con la cuenta que ya ocurrieron (las más nuevas alcanzan). */
  reunionesHechas: readonly Date[];
}

export type MotivoDelAviso = "reunion_sin_agendar" | "sin_tomar";

export interface AvisoDeCompromiso {
  motivo: MotivoDelAviso;
  /** Cuántas horas lleva sin tomar. */
  horas: number;
  /** El calendario no se pudo leer: se avisa solo por Tareas y se dice. */
  sinCalendario: boolean;
}

/** ¿Este compromiso pide un aviso hoy? null = no. */
export function compromisoSinAgendar(t: CompromisoParaAvisar, cuenta: LoQueSabemosDeLaCuenta, ahora: Date): AvisoDeCompromiso | null {
  if (!esCompromisoConElCliente(t)) return null;
  const sinTomar = t.estado === "propuesta" || (t.estado === "pendiente" && !t.responsableEmail);
  if (!sinTomar) return null;
  const horas = (+ahora - +t.creadaAt) / 3_600_000;
  if (horas < HORAS_PARA_AVISAR || horas > DIAS_QUE_AVISA * 24) return null;
  const reunion = esReunionPrometida(t.titulo);
  if (!t.venceEl && !reunion) return null;
  if (reunion) {
    if (cuenta.reunionPlaneada) return null;
    if (cuenta.reunionesHechas.some((d) => +d >= +t.creadaAt && +d <= +ahora)) return null;
    if (cuenta.eventosProximos?.some((d) => +d >= +ahora)) return null;
    return { motivo: "reunion_sin_agendar", horas: Math.floor(horas), sinCalendario: cuenta.eventosProximos === null };
  }
  return { motivo: "sin_tomar", horas: Math.floor(horas), sinCalendario: false };
}

/** El título del pendiente: lo que dice en «Para ti». */
export function tituloDelAviso(a: AvisoDeCompromiso, t: Pick<CompromisoParaAvisar, "titulo" | "origen">, empresa: string): string {
  const de = t.origen === "correo" ? "por correo" : "en una reunión";
  if (a.motivo === "reunion_sin_agendar") return `${empresa}: se prometió una reunión ${de} y no está agendada`;
  return `${empresa}: un compromiso ${de} lleva ${Math.floor(a.horas / 24)} días sin que nadie lo tome`;
}
