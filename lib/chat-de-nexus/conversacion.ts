/**
 * lib/chat-de-nexus/conversacion.ts — «HABLAR CON NEXUS» (Elías, 21 nov): una persona del equipo le cuenta algo a Nexus,
 * Nexus pregunta lo que falta (una o dos preguntas, no más) y dice adónde va cada cosa. PURO y client-safe: lo comparten
 * el servidor (./conversacion-server.ts), el panel (components/chat-de-nexus/PanelDeNexus.tsx) y las pruebas.
 *
 * Sirve a cualquier lugar de Nexus, no solo a la preventa: el lugar (la «superficie») pone su contexto y sus destinos
 * (`ContextoParaNexus`), y valida lo propuesto con sus propias reglas (`OpcionesDeLaLectura.valorValido`). La primera
 * superficie es la preventa (lib/exploraciones/nexus-en-la-preventa*.ts); después, la ficha del cliente y cada documento.
 *
 * El código decide lo que el modelo no puede: cuántas rondas de preguntas (`TOPES.rondasDePreguntas`), cuántas preguntas
 * por ronda, que cada cambio vaya a un destino que existe con un valor que la superficie acepta, y que su cita esté en lo
 * que dijo la persona. Lo que no pasa, se descarta y se cuenta. La nota NO la escribe el modelo: son las palabras de la
 * persona, tal cual (`notaDeLaConversacion`), así «lo dijo <persona>» es verdad.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { escaleraParaElAgente } from "@/lib/impacto/escalera";
import { citaEstaEnLasFuentes, normalizarParaCita } from "@/lib/timeline/limites";
import { voseoEnProsa } from "@/lib/ui/voseo-formas";
import type { RespuestaDeNexus } from "./respuesta";

/** Sonnet 4.6, el modelo por defecto de Nexus: entender qué quiso decir y a qué tarjeta va pide más que Haiku. */
export const MODELO_DEL_CHAT = "claude-sonnet-4-6";
const MAX_TOKENS_DEL_TURNO = 2_500;

/** Los topes de una conversación. El servidor los hace cumplir; el panel los usa para avisar antes. */
export const TOPES = {
  /** Las vueltas de Claude en una conversación (cada «Enviar» es una). */
  turnosPorConversacion: 6,
  /** Las vueltas de Claude por persona y por día (en Costa Rica), sumando todas sus conversaciones. */
  turnosPorDia: 60,
  /** Cuántas veces puede preguntar antes de tener que decir adónde va. */
  rondasDePreguntas: 2,
  /** Cuántas preguntas en una misma vuelta. */
  preguntasPorRonda: 2,
  /** El largo de lo que escribe o dicta la persona en un mensaje. */
  largoDelMensaje: 4_000,
  /** Cuántos mensajes viajan (la persona y Nexus). */
  mensajes: 14,
  /** Cuántos cambios propone como mucho. */
  cambios: 8,
  /** Cuántos hechos deja como mucho. */
  hechos: 12,
} as const;

export type DeQuien = "persona" | "nexus";
export interface MensajeDeLaConversacion {
  de: DeQuien;
  texto: string;
  /**
   * Qué fue: de la persona, «consulta» si preguntó algo de la cuenta (no va a la nota); de Nexus, «respuesta» si le
   * respondió (no cuenta como una ronda de preguntas). Sin marca: algo que cuenta la persona, o una pregunta de Nexus.
   */
  es?: "consulta" | "respuesta";
}

/** Un lugar al que puede ir lo que contó la persona (en la preventa, una tarjeta de la arquitectura de la venta). */
export interface DestinoDisponible {
  clave: string;
  /** Cómo se llama en la pantalla: «Negocio», «Quién decide». */
  rotulo: string;
  /** Para qué sirve, en una línea. */
  ayuda: string;
  /** La forma JSON del valor, en palabras para el modelo. */
  forma: string;
  /** Lo que hay hoy, en renglones (vacío = nada). */
  hoy: string[];
  /** Se SUMA a lo que hay (una lista, unas cifras) o lo REEMPLAZA (un texto). */
  suma: boolean;
}

/** Lo que la superficie le da a Nexus para conversar: de quién es, qué se sabe y adónde puede ir cada cosa. */
export interface ContextoParaNexus {
  /** «la preventa de Centauro». */
  donde: string;
  empresa: string;
  /** Lo que ya se sabe, en un bloque (lo del equipo, lo que aceptó el cliente). Interno. */
  contexto: string;
  destinos: DestinoDisponible[];
}

/** Un cambio que Nexus propone y la persona aplica con un clic. */
export interface CambioPropuesto {
  /** Estable: el destino y el valor. */
  id: string;
  destino: string;
  valor: unknown;
  /** Por qué, en una frase. */
  porque: string;
  /** Lo que dijo la persona que lo respalda. */
  cita: string;
}

/** Un hecho como lo devuelve el modelo, sin verificar: lo verifica el escritor de hechos contra la nota guardada. */
export interface HechoPropuesto {
  tipo: string;
  frase: string;
  cita: string;
  tema?: string;
  gravedad?: string;
}

export type ResultadoDelTurno =
  | { tipo: "pregunta"; preguntas: string[] }
  /** La persona preguntó algo de la cuenta: lo responde la acción «leer el contexto de la cuenta» (./respuesta.ts). */
  | { tipo: "consulta"; pregunta: string }
  | { tipo: "respuesta"; respuesta: RespuestaDeNexus }
  /** `sinLeer`: la IA no respondió o no se entendió. La nota se guarda igual, y la pantalla lo dice. */
  | { tipo: "listo"; cambios: CambioPropuesto[]; hechos: HechoPropuesto[]; descartados: number; sinLeer?: true };

/** Lo que el modelo no pudo leer: «listo, sin cambios», marcado como no leído (la nota se guarda igual). */
export const NO_SE_PUDO_LEER: ResultadoDelTurno = { tipo: "listo", cambios: [], hechos: [], descartados: 0, sinLeer: true };
/** Leído, sin nada que proponer. */
export const LISTO_SIN_CAMBIOS: ResultadoDelTurno = { tipo: "listo", cambios: [], hechos: [], descartados: 0 };

// ── La conversación ─────────────────────────────────────────────────────────────

/** Los mensajes, limpios y dentro del tope; el último es de la persona. null si no hay nada que mandar. */
export function mensajesValidos(m: readonly MensajeDeLaConversacion[]): MensajeDeLaConversacion[] | null {
  const limpios = m
    .map((x) => ({ de: x.de, texto: x.texto.trim().slice(0, TOPES.largoDelMensaje), ...(x.es ? { es: x.es } : {}) }))
    .filter((x) => (x.de === "persona" || x.de === "nexus") && x.texto)
    .slice(-TOPES.mensajes);
  if (!limpios.length || limpios[limpios.length - 1].de !== "persona") return null;
  return limpios;
}

/** Cuántas veces ya preguntó Nexus en esta conversación (sus respuestas a una consulta no cuentan). */
export function rondasDePreguntas(m: readonly MensajeDeLaConversacion[]): number {
  return m.filter((x) => x.de === "nexus" && x.es !== "respuesta").length;
}

/** Lo que contó la persona, sin sus consultas: lo que va a la nota y contra lo que se verifican las citas. */
export function loQueConto(m: readonly MensajeDeLaConversacion[]): string[] {
  return m.filter((x) => x.de === "persona" && x.es !== "consulta").map((x) => x.texto.trim()).filter(Boolean);
}

/** ¿Puede preguntar en esta vuelta? Solo si le quedan rondas. */
export function puedePreguntar(m: readonly MensajeDeLaConversacion[]): boolean {
  return rondasDePreguntas(m) < TOPES.rondasDePreguntas;
}

/**
 * La nota que se guarda: lo que dijo la persona, con sus palabras, renglón por renglón (lo que escribió primero y lo que
 * respondió). Nunca un resumen del modelo: la nota lleva «lo dijo <persona>» y tiene que ser cierto.
 */
export function notaDeLaConversacion(m: readonly MensajeDeLaConversacion[], tope = TOPES.largoDelMensaje): string {
  return loQueConto(m).join("\n").slice(0, tope);
}

// ── El pedido ───────────────────────────────────────────────────────────────────

const REGLAS = `Eres Nexus, el asistente interno de Smarteam (una agencia de HubSpot). Una persona del equipo te cuenta algo que sabe del cliente: lo que le dijeron por WhatsApp, en una llamada o en el pasillo. Tu trabajo: entenderlo bien y decir ADÓNDE va cada cosa. No inventas nada.

CÓMO CONVERSAS
- Le hablas de TÚ, en español neutro (nunca voseo), con frases cortas.
- Si lo que contó es claro, no preguntas: respondes «listo» con los cambios.
- Si falta algo que cambia adónde va o qué valor tiene (de qué período es una cifra, quién lo dijo, si es un hecho o una idea, a qué equipo del cliente toca), haces UNA o DOS preguntas cortas, en una sola vuelta. Nada de interrogatorios ni de preguntas por cortesía.
- Cuando el pedido dice «YA NO PREGUNTES», respondes «listo» con lo que tengas.
- Si la persona te PREGUNTA algo sobre la cuenta («¿qué dijo de la cobranza?», «¿quién decide?») en vez de contarte algo nuevo, no lo respondes tú: devuelves {"tipo":"consulta","pregunta":"<la pregunta completa, que se entienda sola>"}. Otra parte de Nexus la responde leyendo todo lo de la cuenta.

ADÓNDE VA CADA COSA
- Solo a los destinos de la lista, con la forma que dice cada uno. Si nada calza, no propones cambios: la nota se guarda igual en «Lo que sabes del cliente».
- Un destino que «suma» recibe UN ítem nuevo (o, en cifras, solo los campos que se dijeron). Uno que «reemplaza» recibe el texto entero como quedaría.
- No repitas lo que ya está en «hoy».
- Cada cambio lleva su «cita»: las palabras EXACTAS de la persona que lo respaldan, copiadas de sus mensajes. Sin cita, no hay cambio. Una cifra va con su período y su moneda si los dijo; si no los dijo, pregunta o no la pongas.
- Escribe los valores en tercera persona («Pierden unos US$ 40.000 al mes en cartera vencida»), sin voseo.

LOS HECHOS
Además, deja los hechos de lo que contó, como los de una reunión: cada uno una frase en tercera persona, con su cita exacta de la persona, y su tipo: cuenta (algo de la empresa), persona (alguien del cliente y su papel), acuerdo (algo que se acordó con el cliente; con «tema»: pipeline, propiedades, integracion, automatizacion, conversaciones, proceso_despues o alcance), resultado (lo que el cliente quiere lograr, con su número si lo dijo), proceso_hoy (cómo trabaja hoy), queja o riesgo (con «gravedad»: baja, media o alta). Sin montos en la frase. Ninguno si no hay.

LO QUE PESA MÁS
${escaleraParaElAgente()}

RESPONDE SOLO UN OBJETO JSON, sin texto alrededor, con una de estas tres formas:
{"tipo":"pregunta","preguntas":["…"]}
{"tipo":"consulta","pregunta":"…"}
{"tipo":"listo","cambios":[{"destino":"<clave>","valor":<según su forma>,"porque":"<una frase>","cita":"<palabras exactas>"}],"hechos":[{"tipo":"cuenta","frase":"…","cita":"…"}]}`;

function bloqueDeLosDestinos(destinos: readonly DestinoDisponible[]): string {
  return destinos
    .map((d) => {
      const hoy = d.hoy.length ? d.hoy.map((l) => `    · ${l}`).join("\n") : "    (vacío)";
      return `- ${d.clave} — «${d.rotulo}»: ${d.ayuda}\n  ${d.suma ? "suma" : "reemplaza"}; forma: ${d.forma}\n  hoy:\n${hoy}`;
    })
    .join("\n");
}

function bloqueDeLaConversacion(m: readonly MensajeDeLaConversacion[]): string {
  const quien = (x: MensajeDeLaConversacion) =>
    x.de === "persona" ? (x.es === "consulta" ? "PERSONA (preguntó)" : "PERSONA") : x.es === "respuesta" ? "NEXUS (respondió)" : "NEXUS";
  return m.map((x) => `${quien(x)}: ${x.texto}`).join("\n\n");
}

/** El pedido de una vuelta. `quien`: el nombre de la persona que cuenta. */
export function pedidoDelTurno(ctx: ContextoParaNexus, m: readonly MensajeDeLaConversacion[], quien: string): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const pregunta = puedePreguntar(m);
  const texto = [
    `Estás en ${ctx.donde}. La empresa: ${ctx.empresa}. Te cuenta ${quien}, del equipo de Smarteam.`,
    ctx.contexto.trim() ? `=== LO QUE YA SE SABE (interno) ===\n${ctx.contexto.trim()}` : "",
    `=== LOS DESTINOS ===\n${bloqueDeLosDestinos(ctx.destinos)}`,
    `=== LA CONVERSACIÓN ===\n${bloqueDeLaConversacion(m)}`,
    pregunta ? "" : "YA NO PREGUNTES: responde «listo» con lo que tengas.",
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    model: MODELO_DEL_CHAT,
    max_tokens: MAX_TOKENS_DEL_TURNO,
    system: REGLAS,
    messages: [{ role: "user", content: texto }],
  };
}

// ── La respuesta ────────────────────────────────────────────────────────────────

export interface OpcionesDeLaLectura {
  /** Los destinos que existen en esta superficie. */
  destinos: ReadonlySet<string>;
  /** El valor ya validado con las reglas de la superficie, o null si no tiene la forma del destino. */
  valorValido: (destino: string, valor: unknown) => unknown;
  /** Lo que dijo la persona en esta conversación (contra eso se verifica cada cita). */
  loQueDijo: readonly string[];
  /** Si todavía puede preguntar: si no, una pregunta se toma como «listo, sin cambios». */
  puedePreguntar: boolean;
}

const objeto = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const cadena = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** El primer objeto JSON del texto (el modelo a veces lo envuelve en ```). null si no hay uno que se lea. */
export function primerObjeto(texto: string): Record<string, unknown> | null {
  const sinCerco = texto.replace(/```(?:json)?/gi, "");
  const desde = sinCerco.indexOf("{");
  if (desde < 0) return null;
  let profundidad = 0;
  let enCadena = false;
  for (let i = desde; i < sinCerco.length; i++) {
    const c = sinCerco[i];
    if (enCadena) {
      if (c === "\\") i++;
      else if (c === '"') enCadena = false;
      continue;
    }
    if (c === '"') enCadena = true;
    else if (c === "{") profundidad++;
    else if (c === "}" && --profundidad === 0) {
      try {
        const v = JSON.parse(sinCerco.slice(desde, i + 1));
        return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * ¿La cita la dijo la persona? Palabra por palabra en lo que escribió, con la regla de siempre (`citaEstaEnLasFuentes`,
 * de 12 caracteres para arriba). Una respuesta corta («200 al mes», «sí, el gerente») vale entera: es un mensaje suyo.
 */
export function laDijoLaPersona(cita: string, loQueDijo: readonly string[]): boolean {
  const c = normalizarParaCita(cita).replace(/[.…]+$/, "").trim();
  if (!c) return false;
  const todo = normalizarParaCita(loQueDijo.join(" "));
  if (citaEstaEnLasFuentes(cita, todo)) return true;
  // Corta, solo ENTERA: «en» de «sí, en enero» no prueba nada.
  const sinCierre = (t: string) => t.replace(/[.…!?¡¿]+$/, "").replace(/^[¡¿]+/, "").trim();
  return loQueDijo.some((m) => {
    const n = sinCierre(normalizarParaCita(m));
    return n.length < 40 && n === sinCierre(c);
  });
}

/** El id de un cambio: el destino y el valor (el mismo cambio dicho dos veces es uno). */
export function idDelCambio(destino: string, valor: unknown): string {
  const t = `${destino}|${JSON.stringify(valor)}`;
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (Math.imul(31, h) + t.charCodeAt(i)) | 0;
  return `${destino}:${(h >>> 0).toString(36)}`;
}

/** Lee la respuesta del modelo con las reglas del código. No lanza: lo que no se entiende es «listo, sin cambios». */
export function leerElTurno(respuesta: Pick<Anthropic.Messages.Message, "content">, o: OpcionesDeLaLectura): ResultadoDelTurno {
  const texto = respuesta.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const crudo = primerObjeto(texto);
  if (!crudo) return NO_SE_PUDO_LEER;

  if (crudo.tipo === "consulta") {
    const pregunta = cadena(crudo.pregunta, 600);
    return pregunta ? { tipo: "consulta", pregunta } : NO_SE_PUDO_LEER;
  }

  if (crudo.tipo === "pregunta") {
    const preguntas = (Array.isArray(crudo.preguntas) ? crudo.preguntas : [])
      .map((p) => cadena(p, 300))
      .filter((p) => p && !voseoEnProsa(p).length)
      .slice(0, TOPES.preguntasPorRonda);
    if (o.puedePreguntar && preguntas.length) return { tipo: "pregunta", preguntas };
    // Sin preguntas válidas (o sin rondas): no hay qué preguntar ni cambios que proponer.
    return LISTO_SIN_CAMBIOS;
  }

  let descartados = 0;
  const cambios: CambioPropuesto[] = [];
  const vistos = new Set<string>();
  for (const x of Array.isArray(crudo.cambios) ? crudo.cambios : []) {
    const c = objeto(x);
    const destino = cadena(c.destino, 60);
    const cita = cadena(c.cita, 600);
    const porque = cadena(c.porque, 300);
    const valor = o.destinos.has(destino) ? o.valorValido(destino, c.valor) : null;
    if (valor === null || valor === undefined || !cita || !laDijoLaPersona(cita, o.loQueDijo) || voseoEnProsa(`${porque} ${JSON.stringify(valor)}`).length) {
      descartados++;
      continue;
    }
    const id = idDelCambio(destino, valor);
    if (vistos.has(id) || cambios.length >= TOPES.cambios) {
      descartados++;
      continue;
    }
    vistos.add(id);
    cambios.push({ id, destino, valor, porque, cita });
  }

  const hechos: HechoPropuesto[] = (Array.isArray(crudo.hechos) ? crudo.hechos : [])
    .map((x) => {
      const h = objeto(x);
      const tema = cadena(h.tema, 40);
      const gravedad = cadena(h.gravedad, 20);
      return { tipo: cadena(h.tipo, 40), frase: cadena(h.frase, 600), cita: cadena(h.cita, 600), ...(tema ? { tema } : {}), ...(gravedad ? { gravedad } : {}) };
    })
    .filter((h) => h.tipo && h.frase && h.cita)
    .slice(0, TOPES.hechos);

  return { tipo: "listo", cambios, hechos, descartados };
}

// ── Los topes ───────────────────────────────────────────────────────────────────

/** Por qué no se puede seguir, en palabras para la persona; null si se puede. */
export function porQueNoSigue(turnosDeLaConversacion: number, turnosDeHoy: number): string | null {
  if (turnosDeHoy >= TOPES.turnosPorDia) return `Hoy ya conversaste ${TOPES.turnosPorDia} veces con Nexus, el tope del día. Mañana sigues; mientras tanto, «Agregar algo que sabes» guarda tu nota sin IA.`;
  if (turnosDeLaConversacion >= TOPES.turnosPorConversacion) return "Esta conversación llegó a su tope. Empieza otra con «Empezar otra conversación».";
  return null;
}
