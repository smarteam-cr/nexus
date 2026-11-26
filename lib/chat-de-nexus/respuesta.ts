/**
 * lib/chat-de-nexus/respuesta.ts — Nexus RESPONDE preguntas sobre la cuenta (Elías, 21 nov: «¿qué dijo Centauro de la
 * cobranza?», «¿quién decide?»). PURO: lo comparten el servidor (./conversacion-server.ts), el panel y las pruebas.
 *
 * Sin RAG ni embeddings: lee ENTERO lo de esa cuenta y nada más. Las reuniones con transcripción (por el chokepoint de
 * sesiones, invariante 1: las arma el lugar), las notas del equipo, las tarjetas y lo aceptado. Si no cabe en el tope, van
 * primero las reuniones más recientes y la respuesta dice cuántas quedaron afuera (`armarLasFuentes`).
 *
 * El código decide lo que el modelo no puede: cada cita se busca palabra por palabra en su fuente (la que no aparece no
 * sale), de quién es lo citado sale del turno de la transcripción (el cliente o Smarteam, `deQuien`), y una respuesta sin
 * ninguna cita que se sostenga se muestra como «no encontré de dónde sale». Si no está en las fuentes, dice que no lo sabe.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { citaEstaEnLasFuentes, normalizarParaCita } from "@/lib/timeline/limites";
import { verificarCita } from "@/lib/analizador-venta/analisis";
import { conTopeDeLaConversacion, MODELO_DEL_CHAT, primerObjeto, TOPES, type MensajeDeLaConversacion } from "./conversacion";

/** Cuántos caracteres de fuentes lee una respuesta (unos 75.000 tokens). Lo demás queda afuera, avisado. */
export const PRESUPUESTO_DE_LAS_FUENTES = 280_000;
/** Las preguntas por persona y por día: cada una lee mucho texto. */
export const PREGUNTAS_POR_DIA = 20;
const MAX_TOKENS_DE_LA_RESPUESTA = 2_500;
const MAX_CITAS = 6;

/** Quién dijo un turno: alguien del cliente, alguien de Smarteam, o no se sabe. */
export type DeQuienEsElTurno = "cliente" | "smarteam" | null;

export interface TurnoDeLaFuente {
  hablante: string;
  deQuien: DeQuienEsElTurno;
  texto: string;
}

/** Una fuente que lee la respuesta. */
export interface FuenteDeLaCuenta {
  /** R1, R2… (reuniones, la más nueva primero), N1… (notas del equipo), T (las tarjetas), A (lo aceptado). */
  clave: string;
  tipo: "reunion" | "nota" | "tarjetas" | "aceptado";
  titulo: string;
  /** AAAA-MM-DD, o null. */
  fecha: string | null;
  /** En una nota: quién del equipo la escribió. */
  porQuien?: string;
  /** En una reunión: los turnos, con quién habló. En lo demás: el texto entero. */
  turnos?: TurnoDeLaFuente[];
  texto?: string;
  /** Solo el equipo en la sala. */
  puertasAdentro?: boolean;
}

/** Una reunión de la cuenta como la arma el lugar (por el chokepoint), la más nueva primero. */
export interface ReunionDeLaCuenta {
  titulo: string;
  fecha: string;
  turnos: TurnoDeLaFuente[];
  puertasAdentro: boolean;
}

export interface LoQueQuedoAfuera {
  reuniones: number;
  /** Las primeras que no entraron, «12 de mayo: Kickoff». */
  ejemplos: string[];
  /** Hay reuniones todavía más viejas que ni se miraron (pasan el tope de las que se buscan). */
  yMas?: true;
  /** No se leyeron las reuniones: quien pregunta no tiene acceso a esta cuenta. */
  sinAcceso?: true;
}

export interface CitaDeLaRespuesta {
  fuente: string;
  /** «Reunión del 2026-11-10: Diagnóstico de Ventas», «Nota de Liz Flores del equipo, 2026-11-21». */
  deDonde: string;
  texto: string;
  /** De una reunión: quién lo dijo, según el turno. De una nota: «equipo». */
  deQuien: DeQuienEsElTurno | "equipo";
  hablante: string | null;
}

export interface RespuestaDeNexus {
  /** Nexus encontró la respuesta en las fuentes. */
  sabe: boolean;
  texto: string;
  citas: CitaDeLaRespuesta[];
  /** Dijo que sabe pero ninguna de sus citas aparece en las fuentes. */
  sinRespaldo: boolean;
  /** No se pudo leer la respuesta (se cortó o no se entendió): no es «no lo sé». */
  noSePudo?: true;
  afuera: LoQueQuedoAfuera;
}

const largoDeLaReunion = (r: ReunionDeLaCuenta) => r.turnos.reduce((s, t) => s + t.hablante.length + t.texto.length + 16, 0) + r.titulo.length + 40;
const largoDelTexto = (f: FuenteDeLaCuenta) => (f.texto ?? "").length + f.titulo.length + 40;

/**
 * Las fuentes en el orden y el tope de la regla: lo del equipo, las tarjetas y lo aceptado siempre (son cortas y pesan
 * más); después las reuniones, la más nueva primero, hasta el presupuesto. Una reunión que no cabe entera no entra (una
 * reunión a medias se cita mal), y desde ahí las más viejas quedan afuera, avisadas.
 */
export function armarLasFuentes(
  delEquipo: readonly FuenteDeLaCuenta[],
  reuniones: readonly ReunionDeLaCuenta[],
  presupuesto = PRESUPUESTO_DE_LAS_FUENTES,
): { fuentes: FuenteDeLaCuenta[]; afuera: LoQueQuedoAfuera } {
  const fuentes: FuenteDeLaCuenta[] = [...delEquipo];
  let usados = delEquipo.reduce((s, f) => s + largoDelTexto(f), 0);
  const conTexto = reuniones.filter((r) => r.turnos.length);
  let i = 0;
  for (; i < conTexto.length; i++) {
    const r = conTexto[i];
    const largo = largoDeLaReunion(r);
    if (usados + largo > presupuesto) break;
    usados += largo;
    fuentes.push({ clave: `R${i + 1}`, tipo: "reunion", titulo: r.titulo, fecha: r.fecha, turnos: r.turnos, puertasAdentro: r.puertasAdentro });
  }
  const quedaron = conTexto.slice(i);
  return { fuentes, afuera: { reuniones: quedaron.length, ejemplos: quedaron.slice(0, 3).map((r) => `${r.fecha}: ${r.titulo}`) } };
}

const ROTULO_DEL_HABLANTE: Record<string, string> = { cliente: "cliente", smarteam: "Smarteam" };

function fuenteComoTexto(f: FuenteDeLaCuenta): string {
  if (f.tipo === "reunion") {
    const cabeza = `### ${f.clave} · reunión del ${f.fecha} · ${f.titulo}${f.puertasAdentro ? " (solo el equipo de Smarteam)" : ""}`;
    const turnos = (f.turnos ?? []).map((t) => `${t.hablante} (${t.deQuien ? ROTULO_DEL_HABLANTE[t.deQuien] : "no se sabe"}): ${t.texto}`);
    return [cabeza, ...turnos].join("\n");
  }
  const cabeza = `### ${f.clave} · ${f.titulo}${f.fecha ? ` · ${f.fecha}` : ""}${f.porQuien ? ` · lo escribió ${f.porQuien}, del equipo` : ""}`;
  return `${cabeza}\n${(f.texto ?? "").trim()}`;
}

const REGLAS = `Eres Nexus, el asistente interno de Smarteam (una agencia de HubSpot). Alguien del equipo te pregunta algo sobre UNA cuenta. Respondes SOLO con lo que está en las fuentes de esa cuenta que vienen abajo.

- Le hablas de TÚ, en español neutro (nunca voseo), corto y directo: primero la respuesta, después el detalle si hace falta.
- Formato: se lee en un panel angosto que entiende Markdown simple. Párrafos cortos; para varias cosas, una lista con «-» o «1.»; **negrita** solo para el nombre de cada punto. Sin títulos (#), sin tablas.
- Una lista lleva como mucho 6 puntos, de una o dos líneas cada uno, los que más pesan primero. Si hay más, dilo al final («Hay 4 más: …» en una línea).
- Si te piden resumir o acortar lo que ya respondiste, hazlo sobre esa respuesta (está en «LO QUE YA HABLARON»), más corto que antes.
- Si la respuesta no está en las fuentes, lo dices: «No lo sé: no aparece en lo que tengo de esta cuenta», y "sabe": false. Nunca completes con lo que suele pasar ni con lo que sabes de otras empresas.
- Separa lo que dijo el CLIENTE de lo que dijo SMARTEAM: cada turno de una reunión trae entre paréntesis de qué lado es. Lo que dijo Smarteam no es palabra del cliente. Una nota del equipo es lo que contó esa persona del equipo.
- Lo que aceptó el cliente pesa más que todo; después, lo que confirmó el equipo; después, lo que se dijo en una reunión.
- Cada afirmación va respaldada por una cita: las palabras EXACTAS de la fuente, copiadas tal cual (sin el nombre de quien habla), con la clave de la fuente (R1, N2, T, A).

Respondes SIEMPRE con la herramienta «responder»: "sabe", "respuesta" (el texto, con su Markdown) y "citas".`;

/**
 * La respuesta sale por una herramienta obligatoria, no como JSON escrito en el texto. Con el JSON en texto, una respuesta
 * en Markdown (varios renglones, comillas del cliente) a veces no se podía leer: el 21 nov, en Cemaco · Ecuador, la misma
 * pregunta salió «No pude leer la respuesta» y al repetirla salió bien. La herramienta la arma la API, siempre legible.
 */
export const HERRAMIENTA_DE_LA_RESPUESTA = {
  name: "responder",
  description: "La respuesta a la pregunta, con las citas que la respaldan.",
  input_schema: {
    type: "object" as const,
    properties: {
      sabe: { type: "boolean", description: "false si la respuesta no está en las fuentes." },
      respuesta: { type: "string", description: "Lo que le respondes, en Markdown simple." },
      citas: {
        type: "array",
        items: {
          type: "object",
          properties: {
            fuente: { type: "string", description: "La clave de la fuente: R1, N2, T, A." },
            cita: { type: "string", description: "Las palabras EXACTAS de la fuente." },
          },
          required: ["fuente", "cita"],
        },
      },
    },
    required: ["sabe", "respuesta", "citas"],
  },
} satisfies Anthropic.Messages.Tool;

/**
 * El pedido de una respuesta. Las fuentes van en su propio bloque con caché de prompt: la segunda pregunta de la misma
 * conversación (dentro de los cinco minutos) las relee a una décima del precio.
 */
export function pedidoDeLaRespuesta(o: {
  empresa: string;
  fuentes: readonly FuenteDeLaCuenta[];
  afuera: LoQueQuedoAfuera;
  conversacion: readonly MensajeDeLaConversacion[];
  pregunta: string;
}): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const fuentes = [
    `=== LAS FUENTES DE ${o.empresa.toUpperCase()} (solo de esta cuenta) ===`,
    ...o.fuentes.map(fuenteComoTexto),
    o.afuera.reuniones || o.afuera.yMas ? "(Hay reuniones más viejas que no entraron: si la respuesta podría estar ahí, dilo.)" : "",
    o.afuera.sinAcceso ? "(Las reuniones de esta cuenta no se leyeron: quien pregunta no tiene acceso a ellas. Si la respuesta estaría ahí, dilo.)" : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  // Lo de antes, dentro del tope de lo que viaja (con la pregunta, que va entera): 25 nov, mensajes de hasta 15.000.
  const antes = conTopeDeLaConversacion(o.conversacion.slice(0, -1).slice(-6), TOPES.largoDeLaConversacion - o.pregunta.length)
    .map((m) => `${m.de === "persona" ? "PERSONA" : "NEXUS"}: ${m.texto}`)
    .join("\n");
  return {
    model: MODELO_DEL_CHAT,
    max_tokens: MAX_TOKENS_DE_LA_RESPUESTA,
    system: REGLAS,
    tools: [HERRAMIENTA_DE_LA_RESPUESTA],
    tool_choice: { type: "tool", name: HERRAMIENTA_DE_LA_RESPUESTA.name },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: fuentes, cache_control: { type: "ephemeral" } },
          { type: "text", text: [antes ? `=== LO QUE YA HABLARON ===\n${antes}` : "", `=== LA PREGUNTA ===\n${o.pregunta}`].filter(Boolean).join("\n\n") },
        ],
      },
    ],
  };
}

const cadena = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** De dónde sale una fuente, en palabras para la pantalla. */
export function deDondeEs(f: FuenteDeLaCuenta): string {
  if (f.tipo === "reunion") return `Reunión del ${f.fecha}: ${f.titulo}`;
  if (f.tipo === "nota") return `Lo dijo ${f.porQuien ?? "alguien"} del equipo${f.fecha ? `, ${f.fecha}` : ""}`;
  return f.titulo;
}

const palabrasDe = (t: string) => normalizarParaCita(t).split(/[^a-z0-9ñ]+/).filter((w) => w.length > 2);

/**
 * La cita en su fuente: si aparece, y en una reunión, de quién es el turno. null si no aparece. En una reunión, palabra
 * por palabra con el verificador del análisis de la venta (`verificarCita`: el modelo copia sin los «eh», o une dos turnos
 * partidos; buscar el pedazo exacto tiraba citas ciertas, KNOWN-ERRORS «Camosa»); se prueba en los turnos que más
 * palabras comparten con la cita. Lo que queda es el texto de la TRANSCRIPCIÓN, no el del modelo.
 */
export function ubicarLaCita(cita: string, f: FuenteDeLaCuenta): { deQuien: CitaDeLaRespuesta["deQuien"]; hablante: string | null; texto: string } | null {
  if (f.tipo === "reunion") {
    const turnos = (f.turnos ?? []).map((t, i) => ({ n: i + 1, hablante: t.hablante, texto: t.texto }));
    const buscadas = new Set(palabrasDe(cita));
    const candidatos = turnos
      .map((t) => ({ n: t.n, comunes: palabrasDe(t.texto).filter((w) => buscadas.has(w)).length }))
      .filter((x) => x.comunes > 0)
      .sort((a, b) => b.comunes - a.comunes)
      .slice(0, 3);
    for (const c of candidatos) {
      const v = verificarCita({ turno: c.n, texto: cita }, turnos);
      if (v) return { deQuien: f.turnos![v.turno - 1]?.deQuien ?? null, hablante: v.hablante, texto: v.texto };
    }
    return null;
  }
  if (!citaEstaEnLasFuentes(cita, normalizarParaCita(f.texto ?? ""))) return null;
  return { deQuien: f.tipo === "nota" ? "equipo" : null, hablante: f.tipo === "nota" ? (f.porQuien ?? null) : null, texto: cita };
}

const NO_LO_SE = "No lo sé: no aparece en lo que tengo de esta cuenta.";

/**
 * Lee la respuesta con las reglas del código. No lanza. Una respuesta cortada o que no se entiende NO es «no lo sé»: es
 * «no pude» (`noSePudo`). El voseo no se mira acá: una cita del cliente puede traerlo (el tuteo se le pide al modelo).
 */
export function leerLaRespuesta(
  respuesta: Pick<Anthropic.Messages.Message, "content"> & { stop_reason?: Anthropic.Messages.Message["stop_reason"] },
  fuentes: readonly FuenteDeLaCuenta[],
  afuera: LoQueQuedoAfuera,
): RespuestaDeNexus {
  if (respuesta.stop_reason === "max_tokens") {
    return { sabe: false, texto: "La respuesta salió más larga de lo que entra: pregúntame algo más acotado.", citas: [], sinRespaldo: false, afuera, noSePudo: true };
  }
  // Lo de la herramienta; si no vino (una respuesta de antes, o el modelo la saltó), el JSON del texto.
  const herramienta = respuesta.content.find((b) => b.type === "tool_use" && b.name === HERRAMIENTA_DE_LA_RESPUESTA.name);
  const deLaHerramienta = herramienta && herramienta.type === "tool_use" && herramienta.input && typeof herramienta.input === "object" ? (herramienta.input as Record<string, unknown>) : null;
  const texto = respuesta.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const crudo = deLaHerramienta ?? primerObjeto(texto);
  const respondio = cadena(crudo?.respuesta, 4_000);
  if (!crudo || !respondio) return { sabe: false, texto: "No pude leer la respuesta. Vuelve a preguntarme.", citas: [], sinRespaldo: false, afuera, noSePudo: true };
  if (crudo.sabe === false) return { sabe: false, texto: respondio || NO_LO_SE, citas: [], sinRespaldo: false, afuera };
  const porClave = new Map(fuentes.map((f) => [f.clave, f]));
  const citas: CitaDeLaRespuesta[] = [];
  for (const x of Array.isArray(crudo.citas) ? crudo.citas : []) {
    const c = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
    const f = porClave.get(cadena(c.fuente, 10));
    const cita = cadena(c.cita, 600);
    if (!f || !cita || citas.length >= MAX_CITAS) continue;
    const donde = ubicarLaCita(cita, f);
    if (!donde || citas.some((y) => y.fuente === f.clave && y.texto === donde.texto)) continue;
    citas.push({ fuente: f.clave, deDonde: deDondeEs(f), ...donde });
  }
  return { sabe: true, texto: respondio, citas, sinRespaldo: citas.length === 0, afuera };
}
