/**
 * lib/cs/alertas-de-la-lectura.ts — el DETECTOR DE LA LECTURA: la queja del cliente que deja una reunión, como
 * `CsAlert` (memoria de la cuenta, etapa 6). PURO: lo usa lib/cs/alertas-de-la-lectura-server.ts y lo prueban los tests.
 *
 * Un solo sistema de alertas con tres detectores (DECISIONS «Un solo sistema de alertas, con tres detectores»): las
 * reglas en código, la lectura de cada reunión y el vigía con IA. La lectura levanta SOLA solo la QUEJA verificada:
 *   · que la diga alguien del CLIENTE, comprobado: la cita está en la TRANSCRIPCIÓN, en el turno de alguien que no es
 *     del equipo (`loDijoElCliente`). Una cita de las notas de Gemini es un resumen, no palabras del cliente, y con un
 *     hablante dudoso «cliente» lo dijo el modelo: esas quejas van como evidencia al vigía (destino `vigia.queja`);
 *   · en una reunión con el cliente (nunca de puertas adentro);
 *   · con la cita literal ya verificada contra la reunión (lib/seguimiento/hechos/salida.ts).
 * El riesgo NO levanta una alerta: va como evidencia al vigía, que juzga la cuenta entera. La lectura tampoco levanta
 * un retraso (TIMELINE_OVERDUE): eso lo juzga el vigía con el cronograma.
 *
 * La alerta escribe `evidence.cita` con la MISMA forma que el vigía (lib/cs/cita-de-alerta.ts › `citaDeLaEvidencia`),
 * así pinta el color de la cuenta sin tocar la cartera. Y es una sola por cita: si el vigía ya levantó la misma queja (la
 * misma frase de la misma reunión), se actualiza esa (`mismaCitaVerificada`, lib/cs/alertas-reglas.ts).
 */
import { loDijoElCliente } from "@/lib/seguimiento/hechos/tipos";
import type { CitaDeAlerta } from "./cita-de-alerta";

/** La reunión de donde salió la queja. */
export interface ReunionDeLaQueja {
  id: string;
  titulo: string;
  /** AAAA-MM-DD, en hora de Costa Rica. */
  fecha: string;
  /** Solo estuvo el equipo. */
  puertasAdentro: boolean;
}

/** Lo que hace falta del hecho (lib/seguimiento/hechos/tipos.ts › `HechoVerificado`, con su id ya escrito). */
export interface QuejaDeLaLectura {
  hechoId: string;
  tipo: string;
  frase: string;
  cita: string;
  quien: "cliente" | "smarteam" | null;
  /** `quien` lo comprobó el turno de la transcripción (`HechoVerificado.quienComprobado`). Sin esto, no hay alerta. */
  quienComprobado?: boolean;
  gravedad?: "baja" | "media" | "alta" | null;
  huella: string;
  fuenteDeLaCita: "transcripcion" | "notas" | "texto";
}

export interface AlertaDeLaLectura {
  category: "QUEJA";
  severity: "MEDIUM" | "HIGH";
  title: string;
  reason: string;
  suggestedAction: string;
  dedupeKey: string;
  evidence: {
    detector: "lectura";
    hechoIds: string[];
    sessionIds: string[];
    cita: CitaDeAlerta & { verificada: true };
  };
}

/** El prefijo de la llave de toda alerta de la lectura: se distinguen del vigía (`<scope>:<categoría>:…`) y de las reglas (`renovacion:`). */
export const PREFIJO_DE_LA_LECTURA = "lectura:";

const TOPE_DEL_TITULO = 140;

function recortar(s: string, tope: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > tope ? `${t.slice(0, tope - 1).trimEnd()}…` : t;
}

/**
 * La alerta que corresponde a un hecho, o null si no corresponde: no es una queja, la reunión es de puertas adentro, o
 * no está comprobado que la dijo el cliente (la cita salió de las notas de Gemini o de un texto sumado a mano, o el
 * hablante es dudoso). Lo que no corresponde lo juzga el vigía (el enrutador la manda ahí como evidencia).
 */
export function alertaDesdeHecho(h: QuejaDeLaLectura, clientId: string, reunion: ReunionDeLaQueja): AlertaDeLaLectura | null {
  if (h.tipo !== "queja") return null;
  if (reunion.puertasAdentro) return null;
  if (!loDijoElCliente(h)) return null;
  const cita: AlertaDeLaLectura["evidence"]["cita"] = {
    texto: h.cita,
    fuente: "reunion",
    id: reunion.id,
    fecha: reunion.fecha,
    titulo: reunion.titulo || null,
    verificada: true,
  };
  return {
    category: "QUEJA",
    severity: h.gravedad === "alta" ? "HIGH" : "MEDIUM",
    title: recortar(`Queja del cliente: ${h.frase}`, TOPE_DEL_TITULO),
    reason: `En la reunión «${reunion.titulo}» del ${reunion.fecha}, el cliente dijo: «${recortar(h.cita, 400)}».`,
    suggestedAction: "Conversa con el cliente sobre lo que le preocupa antes de la próxima reunión y deja anotado lo que acordaron.",
    dedupeKey: `${PREFIJO_DE_LA_LECTURA}${clientId}:QUEJA:${h.huella}`,
    evidence: { detector: "lectura", hechoIds: [h.hechoId], sessionIds: [reunion.id], cita },
  };
}

/** ¿Esta alerta la levantó la lectura? (por su llave). */
export function esDeLaLectura(a: { dedupeKey: string }): boolean {
  return a.dedupeKey.startsWith(PREFIJO_DE_LA_LECTURA);
}

/**
 * Una reunión dejó de ser del cliente de la alerta (cambió de dueño): cómo queda la alerta sin ella. Se sacan la reunión
 * y el hecho de la evidencia; se cierra si su cita es de esa reunión (es la frase que la sostiene y pinta el color) o si
 * no le queda ninguna reunión. Si la sostienen otras reuniones del cliente, sigue abierta.
 */
export function retiroDeLaAlerta(evidence: unknown, sessionId: string, hechoId: string): { cerrar: boolean; evidence: Record<string, unknown> } {
  const e = evidence && typeof evidence === "object" && !Array.isArray(evidence) ? (evidence as Record<string, unknown>) : {};
  const sin = (lista: unknown, x: string): string[] => (Array.isArray(lista) ? lista.filter((y): y is string => typeof y === "string" && y !== x) : []);
  const sessionIds = sin(e.sessionIds, sessionId);
  const hechoIds = sin(e.hechoIds, hechoId);
  const cita = e.cita as { id?: unknown } | null | undefined;
  const citaDeEsaReunion = !!cita && typeof cita === "object" && cita.id === sessionId;
  return { cerrar: citaDeEsaReunion || sessionIds.length === 0, evidence: { ...e, sessionIds, hechoIds } };
}
