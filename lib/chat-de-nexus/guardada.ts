/**
 * lib/chat-de-nexus/guardada.ts — la conversación de «Hablar con Nexus» GUARDADA (Elías, 21 nov: «que no se pierda al
 * salir de la página»). PURO y client-safe: lo usan el servidor (./conversacion-server.ts), la pantalla y las pruebas.
 *
 * No hay tabla nueva: cada vuelta ya es una corrida (`AgentRun`, `modo: chat-de-nexus`), y su `output` lleva, además de
 * lo que leyó el servidor (el turno), los mensajes que viajaron en esa vuelta (`mensajes`) y, si la persona preguntó algo
 * de la cuenta, la respuesta con sus citas (`respuesta`). La vuelta que dejó un «listo» suma después lo que pasó en la
 * pantalla: la nota que se guardó (`notaClave`), lo que dijo la revisión de esa nota (`guardado`), qué cambios se
 * aplicaron o se descartaron (`estados`) y, al apretar «Nueva conversación», `cerrada`.
 *
 * Con eso `reconstruirLaConversacion` arma lo que el cajón muestra al volver: los mensajes (cada respuesta con sus citas),
 * lo propuesto y lo aplicado. Las corridas de antes de esto no traen `mensajes`: esas no se reconstruyen.
 */
import { TOPES, type CambioPropuesto, type MensajeDeLaConversacion, type ResultadoDelTurno } from "./conversacion";
import type { RespuestaDeNexus } from "./respuesta";

/** Un mensaje como se ve: el de Nexus que respondió una pregunta lleva sus citas. */
export type MensajeGuardado = MensajeDeLaConversacion & { respuesta?: RespuestaDeNexus };

/** Lo que la persona hizo con un cambio propuesto. «aplicando» no se guarda: es solo mientras espera. */
export const ESTADOS_GUARDADOS = ["aplicado", "descartado"] as const;
export type EstadoGuardadoDelCambio = (typeof ESTADOS_GUARDADOS)[number];
export const esEstadoGuardado = (v: unknown): v is EstadoGuardadoDelCambio => typeof v === "string" && (ESTADOS_GUARDADOS as readonly string[]).includes(v);

/** Lo que respondió la revisión de la nota (los hechos y el agente de impacto), como lo guarda la vuelta. */
export interface RevisionGuardada {
  hechos: { estado: string; escritos?: number };
  impacto: { cambia: boolean; aviso: string; omitido?: string };
}

/** Lo que el servidor anota en el `output` de una vuelta, además del turno. */
export interface AnotacionesDeLaVuelta {
  mensajes?: MensajeDeLaConversacion[];
  respuesta?: RespuestaDeNexus;
  notaClave?: string;
  guardado?: RevisionGuardada;
  estados?: Record<string, EstadoGuardadoDelCambio>;
  cerrada?: true;
}

/** El `output` de una vuelta: el turno como lo leyó el servidor, con sus anotaciones. */
export type SalidaDeLaVuelta = ResultadoDelTurno & AnotacionesDeLaVuelta;

/** La conversación como vuelve al cajón. */
export interface ConversacionGuardada {
  id: string;
  mensajes: MensajeGuardado[];
  /** Las vueltas que le quedan (el tope por conversación sigue contando las corridas). */
  quedan: number;
  /** Si terminó en un «listo»: la nota (null si no se sabe si quedó guardada), lo propuesto y lo que se hizo con eso. */
  listo: {
    notaClave: string | null;
    cambios: CambioPropuesto[];
    estados: Record<string, EstadoGuardadoDelCambio>;
    guardado: RevisionGuardada | null;
  } | null;
}

const objeto = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** El `output` de una corrida, leído sin confiar en él. null si no es una vuelta que se lea. */
export function leerLaSalida(output: string | null | undefined): SalidaDeLaVuelta | null {
  if (!output) return null;
  try {
    const v = objeto(JSON.parse(output));
    if (!v || (v.tipo !== "pregunta" && v.tipo !== "consulta" && v.tipo !== "listo" && v.tipo !== "respuesta")) return null;
    return v as unknown as SalidaDeLaVuelta;
  } catch {
    return null;
  }
}

/** Los mensajes guardados de una vuelta, limpios (lo que no tiene forma de mensaje no entra). */
function mensajesDe(s: SalidaDeLaVuelta): MensajeDeLaConversacion[] | null {
  if (!Array.isArray(s.mensajes)) return null;
  const m = s.mensajes
    .map((x) => objeto(x))
    .filter((x): x is Record<string, unknown> => !!x && (x.de === "persona" || x.de === "nexus") && typeof x.texto === "string" && !!x.texto)
    .map((x): MensajeDeLaConversacion => ({ de: x.de as MensajeDeLaConversacion["de"], texto: x.texto as string, ...(x.es === "consulta" || x.es === "respuesta" ? { es: x.es as "consulta" | "respuesta" } : {}) }));
  return m.length ? m : null;
}

/** Lo que Nexus contestó en esa vuelta, como mensaje (null en un «listo»: ahí lo que sigue es «Adónde va»). */
function loQueContesto(s: SalidaDeLaVuelta): MensajeGuardado | null {
  if (s.tipo === "pregunta") return Array.isArray(s.preguntas) && s.preguntas.length ? { de: "nexus", texto: s.preguntas.join("\n") } : null;
  if (s.tipo === "consulta" && s.respuesta && typeof s.respuesta.texto === "string") return { de: "nexus", es: "respuesta", texto: s.respuesta.texto, respuesta: s.respuesta };
  return null;
}

/**
 * Arma la conversación desde sus vueltas TERMINADAS (de la más vieja a la más nueva) y cuántas corridas lleva en total
 * (con las que fallaron: el tope las cuenta). null si la última no trae sus mensajes o la persona la cerró.
 *
 * La última vuelta trae todos los mensajes hasta ese momento; a cada respuesta de antes se le devuelven sus citas desde
 * su propia vuelta. Una vuelta que no se pudo leer (`sinLeer`) no dejó nada en la pantalla: su mensaje volvió al cuadro,
 * así que no se muestra.
 */
export function reconstruirLaConversacion(id: string, vueltas: readonly SalidaDeLaVuelta[], corridas: number): ConversacionGuardada | null {
  const ultima = vueltas[vueltas.length - 1];
  if (!ultima || ultima.cerrada) return null;
  const base = mensajesDe(ultima);
  if (!base) return null;

  const citas = new Map<string, RespuestaDeNexus>();
  for (const v of vueltas) if (v.tipo === "consulta" && v.respuesta && typeof v.respuesta.texto === "string") citas.set(v.respuesta.texto, v.respuesta);
  let mensajes: MensajeGuardado[] = base.map((m) => (m.de === "nexus" && m.es === "respuesta" && citas.has(m.texto) ? { ...m, respuesta: citas.get(m.texto) } : m));

  const quedan = Math.max(0, TOPES.turnosPorConversacion - corridas);
  const contesto = loQueContesto(ultima);
  // No se pudo leer, o la pregunta no se respondió (el tope del día): en la pantalla el mensaje volvió al cuadro.
  if ((ultima.tipo === "listo" && ultima.sinLeer) || (ultima.tipo === "consulta" && !contesto)) {
    mensajes = mensajes.slice(0, -1);
    return mensajes.length ? { id, mensajes, quedan, listo: null } : null;
  }
  if (contesto) {
    // La consulta de la persona no va a la nota: queda marcada como en la pantalla.
    if (contesto.es === "respuesta") mensajes = mensajes.map((m, i) => (i === mensajes.length - 1 && m.de === "persona" ? { ...m, es: "consulta" as const } : m));
    mensajes = [...mensajes, contesto];
  }
  if (ultima.tipo !== "listo") return { id, mensajes, quedan, listo: null };

  const estados = Object.fromEntries(Object.entries(objeto(ultima.estados) ?? {}).filter(([, e]) => esEstadoGuardado(e))) as Record<string, EstadoGuardadoDelCambio>;
  const g = objeto(ultima.guardado);
  const impacto = g && objeto(g.impacto);
  return {
    id,
    mensajes,
    quedan,
    listo: {
      notaClave: typeof ultima.notaClave === "string" && ultima.notaClave ? ultima.notaClave : null,
      cambios: Array.isArray(ultima.cambios) ? ultima.cambios : [],
      estados,
      guardado: g && impacto && objeto(g.hechos) ? (g as unknown as RevisionGuardada) : null,
    },
  };
}

/** Los estados que la pantalla manda, solo los de cambios de esa vuelta y con un valor que se guarda. */
export function estadosValidos(cambios: readonly CambioPropuesto[], pedidos: Record<string, unknown>): Record<string, EstadoGuardadoDelCambio> {
  const ids = new Set(cambios.map((c) => c.id));
  return Object.fromEntries(Object.entries(pedidos).filter(([id, e]) => ids.has(id) && esEstadoGuardado(e))) as Record<string, EstadoGuardadoDelCambio>;
}

/** Lo que se ve en lugar de una respuesta que leyó las reuniones de la cuenta, para quien hoy no tiene acceso a ellas. */
export const RESPUESTA_SIN_ACCESO = "Esta respuesta leía las reuniones de la cuenta, y hoy no tienes acceso a ellas.";

/**
 * La conversación para quien HOY no tiene acceso a la cuenta (una preventa de una empresa que ya es cliente): cada
 * respuesta que pudo leer sus reuniones se cambia por un aviso, sin su texto ni sus citas. Al preguntar, el servidor ya
 * lee las reuniones solo con ese acceso; esto cierra el mismo camino al volver (el acceso pudo perderse entretanto).
 * Solo quedan las que respondieron sin las reuniones (`afuera.sinAcceso`).
 */
export function sinLasReuniones(c: ConversacionGuardada): ConversacionGuardada {
  return {
    ...c,
    mensajes: c.mensajes.map((m) =>
      m.de === "nexus" && m.es === "respuesta" && m.respuesta?.afuera?.sinAcceso !== true ? { de: "nexus", es: "respuesta", texto: RESPUESTA_SIN_ACCESO } : m,
    ),
  };
}
