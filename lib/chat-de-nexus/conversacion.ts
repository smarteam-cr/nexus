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
   * Desde el 22 nov (etapa 0 del plan maestro): «cortesia», un «gracias» o un «ok» de la persona y lo que Nexus le
   * contesta (ninguno va a la nota ni es una ronda de preguntas); «guardado», lo que la persona ya guardó como nota en
   * esta conversación: sigue a la vista, pero no vuelve a la nota siguiente ni respalda sus cambios.
   */
  es?: MarcaDelMensaje;
}

/** Las marcas de un mensaje (`MensajeDeLaConversacion.es`). Las valida la ruta y las lee la conversación guardada. */
export const MARCAS_DEL_MENSAJE = ["consulta", "respuesta", "cortesia", "guardado"] as const;
export type MarcaDelMensaje = (typeof MARCAS_DEL_MENSAJE)[number];
export const esMarcaDelMensaje = (v: unknown): v is MarcaDelMensaje => typeof v === "string" && (MARCAS_DEL_MENSAJE as readonly string[]).includes(v);

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
  /** Un «gracias» o un «ok» (`esCortesia`): Nexus contesta corto, sin llamar a la IA y sin proponer guardar nada. */
  | { tipo: "cortesia"; texto: string }
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

/**
 * Cuántas veces ya preguntó Nexus por lo que se está contando (sus respuestas y lo que contesta a un «gracias» no
 * cuentan). Después de guardar, la nota nueva arranca con sus dos rondas: solo cuenta desde el último «Guardado».
 */
export function rondasDePreguntas(m: readonly MensajeDeLaConversacion[]): number {
  let desde = 0;
  m.forEach((x, i) => {
    if (x.de === "nexus" && x.es === "cortesia" && x.texto === YA_QUEDO_GUARDADO) desde = i + 1;
  });
  return m.slice(desde).filter((x) => x.de === "nexus" && !x.es).length;
}

/**
 * Lo que contó la persona y todavía no guardó: lo que va a la nota y contra lo que se verifican las citas. Sin sus
 * consultas, sus «gracias» ni lo que ya guardó (cualquier mensaje suyo con marca).
 */
export function loQueConto(m: readonly MensajeDeLaConversacion[]): string[] {
  return m.filter((x) => x.de === "persona" && !x.es).map((x) => x.texto.trim()).filter(Boolean);
}

/**
 * Un «gracias», un «ok» o un «listo» solos (Elías, 21 nov: un «gracias» proponía guardarse como nota). Solo si TODO el
 * mensaje es eso: palabras de cortesía, «Nexus», signos y emojis. «Ok, pierden 40 mil al mes» cuenta algo y no es esto.
 */
const PALABRAS_DE_CORTESIA = new Set(
  "gracias muchas mil muchisimas ok okay oki okey vale listo perfecto perfecta genial excelente super buenisimo buenisima bueno bien dale acuerdo entendido entendida entiendo claro chevere".split(" "),
);
/** Las que acompañan a una de cortesía pero solas no lo son («de», «muy», «Nexus»). */
const ACOMPANAN_A_LA_CORTESIA = new Set(["nexus", "muy", "de", "y", "te", "por", "eso", "todo", "esta", "va"]);
export function esCortesia(texto: string): boolean {
  const t = sinTildes(texto.trim().toLowerCase());
  if (!t || t.length > 60) return false;
  const palabras = t
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Join_Control}\p{Variation_Selector}]/gu, " ")
    .replace(/[¡!¿?.,;:…()"«»“”'-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  // Solo un emoji («👍»): cortesía.
  if (!palabras.length) return /\p{Extended_Pictographic}/u.test(t);
  return palabras.every((p) => PALABRAS_DE_CORTESIA.has(p) || ACOMPANAN_A_LA_CORTESIA.has(p)) && palabras.some((p) => PALABRAS_DE_CORTESIA.has(p));
}

/** Lo que Nexus le contesta a un «gracias» o un «ok». */
export const RESPUESTA_A_LA_CORTESIA = "Con gusto. Si sabes algo más del cliente, cuéntamelo, o pregúntame lo que necesites.";

/**
 * Seguir conversando después de guardar (etapa 0 del plan maestro, 22 nov): lo que la persona contó queda marcado como
 * «guardado» (a la vista, fuera de la nota siguiente) y Nexus deja dicho que lo guardó. Así lo próximo que cuente arma
 * una nota nueva con sus palabras nuevas, sin repetir la anterior.
 */
export function paraSeguirDespuesDeGuardar<M extends MensajeDeLaConversacion>(m: readonly M[]): M[] {
  const marcados = m.map((x) => (x.de === "persona" && !x.es ? { ...x, es: "guardado" as const } : x));
  const ultimo = m[m.length - 1];
  if (ultimo?.de === "nexus" && ultimo.es === "cortesia" && ultimo.texto === YA_QUEDO_GUARDADO) return marcados;
  return [...marcados, { de: "nexus", es: "cortesia", texto: YA_QUEDO_GUARDADO } as M];
}
/** Lo que Nexus deja en la conversación cuando la persona sigue después de guardar. */
export const YA_QUEDO_GUARDADO = "Guardado. ¿Algo más?";

/**
 * Lo que le pide algo a Nexus, comparado SIN tildes («resumelos» y «resúmelos» son lo mismo). Solo pedidos que no pueden
 * ser una oración sobre el cliente: «busca», «explica», «lista», «compara» o «dame» solos quedan fuera («Busca crecer en
 * Guatemala», «Explica que no tienen presupuesto», «Dame un segundo, el gerente dice…»): con un pronombre pegado
 * («explícame», «compáralos») sí son un pedido (`IMPERATIVO_CON_PRONOMBRE`). Una palabra de pregunta sola (qué, cómo,
 * cuándo) tampoco es segura, con tilde o sin ella: «Cómo te decía, tienen tres marcas», «Qué bárbaro, tienen 40 cuentas
 * por gestor», «Cuándo arrancan no está claro» cuentan algo (el dictado pone las tildes). Esas las decide el modelo.
 */
const PIDE_ALGO =
  /^(dime|digame|cuentame|resume|resumeme|recuerdame|muestrame|enumera|buscame|averigua|hazme|quiero saber|necesito saber|me gustaria saber|me (dices|dirias|explicas|resumes|puedes decir|puedes contar|puedes explicar|puedes resumir|podrias decir|podrias contar|podrias explicar|podrias resumir)|puedes (decirme|contarme|buscar|explicarme|resumir|resumirme)|podrias (decirme|contarme|buscar|explicarme|resumir|resumirme))(?=[\s,.:;!?]|$)/;
/**
 * Los pedidos que se distinguen de algo contado SOLO por la tilde: «Sabes qué dijo…» pregunta, «Sabes que el gerente
 * renunció» cuenta; «Revisa qué…» pide, «Revisa si le pagan antes de despachar» puede contar lo que hace el cliente. Se
 * comparan CON tildes.
 */
const PIDE_ALGO_CON_TILDE = /^(busca (qué|dónde|cuándo|quién)|revisa (lo que|qué)|sabes (si|qué|cuándo|quién|cómo|cuánto|dónde))(?=[\s,.:;!?]|$)/;
/**
 * Un imperativo de tú con un pronombre pegado: «resúmelos», «explícame», «compáralos», «ordénalos», «dímelo». En español
 * el pronombre solo se pega así a una orden: casi nadie lo escribe contando algo del cliente. Sin «da» ni «haz» («Dale»,
 * «Hazlo simple: quieren un solo pipeline»). Sin tildes.
 */
const IMPERATIVO_CON_PRONOMBRE =
  /^(resume|explica|compara|ordena|enumera|detalla|lista|agrupa|prioriza|simplifica|aclara|traduce|redacta|escribe|prepara|muestra|cuenta|busca|revisa|saca|di|desglosa|sintetiza|amplia|profundiza|repite)(me|nos|lo|la|los|las|le|les|melo|mela|melos|melas|noslo|noslos|selo|selos)(?=[\s,.:;!?]|$)/;
/**
 * Lo que arranca CONTANDO algo: «Es importante esto de que…» (Elías, 21 nov), «Ojo con…», «Anota que…», «Me dijeron…». Sin
 * tildes. Si además lleva una pregunta («Nos dijeron que arrancan en enero. ¿Qué sigue?»), lo decide el modelo.
 */
const ARRANQUE_DE_CONTAR =
  /^(es importante|importante|ojo|anota|apunta|guarda (esto|que)|ten en cuenta|toma en cuenta|tengan en cuenta|recuerda que|fijate que|para que sepas|te cuento|les cuento|dato|me dijeron|nos dijeron|me conto|nos conto|me comento|nos comento)(?=[\s,.:;!]|$)/;
/** Las coletillas que no vuelven pregunta lo que se cuenta: «Es importante, ¿no?», «Pierden 40 mil al mes, ¿sabes?». */
const COLETILLA = /,?\s*¿\s*(no|o no|verdad|cierto|sí|ok|eh|viste|ves|sabes|me explico|me entiendes|entiendes|no crees|no te parece)\s*\?\s*$/;
/** Lo que se dice antes de preguntar y no cuenta: «Oye, Nexus, …», «Y …», «Bueno, …». */
const SALUDO = /^((y|oye|nexus|hola|bueno|ok|okay|a ver|una pregunta|pregunta)[,:\s]+)+/;

/** Sin tildes ni diéresis (la ñ queda como n): para comparar lo que se escribe con o sin ellas. */
const sinTildes = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * ¿Lleva el signo de una pregunta de verdad? Abre con «¿» o cierra con «?», sin contar las coletillas. Una pregunta citada
 * («El cliente preguntó «¿cuánto cuesta?»») no cierra con «?»: cierra con la comilla.
 */
function conSignoDePregunta(t: string): boolean {
  const sin = t.replace(COLETILLA, "").trim();
  return /^¿/.test(sin) || /\?\s*$/.test(sin);
}

/** El comienzo de lo escrito, en minúsculas, sin comillas ni saludos («Oye, Nexus, …»). */
const inicioDe = (texto: string) => texto.trim().toLowerCase().replace(/^[\s"«“'(¡-]+/, "").replace(SALUDO, "");

/**
 * ¿Lo que escribió la persona es SEGURO una pregunta o un pedido a Nexus? Abre con «¿» o cierra con «?» (una coletilla como
 * «¿no?» o «¿sabes?» no cuenta), pide algo («dime», «quiero saber», «averigua», «sabes qué») o es una orden con su
 * pronombre pegado («resúmelos», «explícame»), con tilde o sin ella.
 */
export function pareceUnaPregunta(texto: string): boolean {
  const t = texto.trim().toLowerCase();
  if (!t) return false;
  if (conSignoDePregunta(t)) return true;
  const inicio = inicioDe(t);
  const plano = sinTildes(inicio);
  return PIDE_ALGO_CON_TILDE.test(inicio) || PIDE_ALGO.test(plano) || IMPERATIVO_CON_PRONOMBRE.test(plano);
}

/** ¿Arranca contando algo? «Es importante…», «Ojo…», «Anota que…». */
export function empiezaContando(texto: string): boolean {
  return ARRANQUE_DE_CONTAR.test(sinTildes(inicioDe(texto)));
}

/**
 * Cómo se lee lo último que escribió la persona (Elías, 21 nov):
 *   - «contar»: SEGURO algo que cuenta: contesta una pregunta de Nexus, o arranca contando («Es importante…») sin
 *     preguntar nada. Aunque el modelo diga que es una consulta, no se responde.
 *   - «pregunta»: SEGURO una pregunta o un pedido (`pareceUnaPregunta`). Se responde sin preguntarle al modelo.
 *   - «duda»: lo demás, y lo que arranca contando y termina preguntando. Lo decide el modelo, con la conversación a la
 *     vista: después de una respuesta, «y el segundo» es una pregunta de seguimiento.
 * Ningún error ensucia la cuenta: nada se guarda sin que la persona lo apruebe, y cada lado tiene su salida («Guardarlo
 * como nota» debajo de una respuesta, «¿Era una pregunta?» debajo de lo que iba a guardarse). `contar` y `preguntar`: lo
 * que eligió la persona con esos botones.
 */
export type ComoSeLee = "pregunta" | "contar" | "duda" | "cortesia";
export function comoSeLee(m: readonly MensajeDeLaConversacion[], o: { contar?: boolean; preguntar?: boolean } = {}): ComoSeLee {
  if (o.contar) return "contar";
  if (o.preguntar) return "pregunta";
  const ultimo = m[m.length - 1];
  const antes = m[m.length - 2];
  if (!ultimo || ultimo.de !== "persona") return "contar";
  // Contesta lo que Nexus le preguntó («¿De qué período?» → «¿Mensual, creo?»): eso es contar. Si en vez de contestar
  // preguntó otra cosa, la salida es «¿Era una pregunta?».
  if (antes && antes.de === "nexus" && !antes.es) return "contar";
  // Un «gracias» o un «ok» solos no se cuentan ni se responden: Nexus contesta corto (22 nov).
  if (esCortesia(ultimo.texto)) return "cortesia";
  if (empiezaContando(ultimo.texto)) return conSignoDePregunta(ultimo.texto.trim().toLowerCase()) ? "duda" : "contar";
  if (pareceUnaPregunta(ultimo.texto)) return "pregunta";
  return "duda";
}

/**
 * «¿Era una pregunta? Respóndela», debajo de lo que iba a guardarse: lo ÚLTIMO que escribió la persona se manda como
 * pregunta, y lo de antes queda como estaba. También si Nexus le había preguntado algo y, en vez de contestar, preguntó
 * otra cosa («¿Esa cifra es mensual?» → «¿Qué dijo Ana del ERP?»). null si lo último no es suyo o ya era una consulta.
 */
export function paraPreguntar<M extends MensajeDeLaConversacion>(m: readonly M[]): { base: M[]; texto: string } | null {
  const ultimo = m[m.length - 1];
  if (!ultimo || ultimo.de !== "persona" || ultimo.es || !ultimo.texto.trim()) return null;
  return { base: m.slice(0, -1), texto: ultimo.texto.trim() };
}

/**
 * «¿Era algo que querías contar? Guardarlo como nota», debajo de la ÚLTIMA respuesta (`i`): lo que se manda en su lugar. Sale el
 * par (lo que la persona escribió, marcado como consulta, y la respuesta de Nexus) y lo que escribió vuelve al final como
 * algo que cuenta. null si `i` no es una respuesta a una consulta de la persona.
 */
export function paraContarComoNota<M extends MensajeDeLaConversacion>(m: readonly M[], i: number): { base: M[]; texto: string } | null {
  // Solo la última: una del medio, movida al final, se leería como la respuesta a lo que Nexus preguntó después.
  if (i !== m.length - 1) return null;
  const respuesta = m[i];
  const consulta = m[i - 1];
  if (!respuesta || !consulta || respuesta.de !== "nexus" || respuesta.es !== "respuesta" || consulta.de !== "persona" || !consulta.texto.trim()) return null;
  return { base: m.filter((_, k) => k !== i && k !== i - 1), texto: consulta.texto.trim() };
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
- Casi siempre te CUENTAN algo, aunque empiece por «Es importante…», «Ojo con…» o «Esto de que…»: eso es contar, y va a la nota. Ante la duda, es contar.
- Cuando la persona te PIDE algo sobre la cuenta en vez de contarlo (pregunta algo, o te pide que resumas, expliques, compares o sigas con lo que ya le respondiste: «y el segundo», «más corto», «resúmelos»), no lo respondes tú: devuelves {"tipo":"consulta"}. Otra parte de Nexus la responde, con las palabras de la persona, leyendo todo lo de la cuenta. El pedido de la vuelta te dice cuándo el código ya sabe que es algo que cuenta: ahí no devuelvas «consulta».

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
{"tipo":"consulta"}
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
    x.de === "persona"
      ? x.es === "consulta"
        ? "PERSONA (preguntó)"
        : x.es === "guardado"
          ? "PERSONA (ya guardado como nota: no lo propongas de nuevo)"
          : x.es === "cortesia"
            ? "PERSONA (agradeció)"
            : "PERSONA"
      : x.es === "respuesta"
        ? "NEXUS (respondió)"
        : x.es === "cortesia"
          ? "NEXUS (contestó)"
          : "NEXUS";
  return m.map((x) => `${quien(x)}: ${x.texto}`).join("\n\n");
}

/**
 * El pedido de una vuelta. `lectura`: lo que decidió el código (`comoSeLee`; una «pregunta» segura no llega acá). Sin el
 * nombre de quien escribe, a propósito: con él, el modelo armaba preguntas sobre esa persona («¿qué dijo Elías…?»).
 * Quién y cuándo los pone el servidor en la nota.
 */
export function pedidoDelTurno(ctx: ContextoParaNexus, m: readonly MensajeDeLaConversacion[], lectura: Exclude<ComoSeLee, "pregunta" | "cortesia">): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const pregunta = puedePreguntar(m);
  const texto = [
    `Estás en ${ctx.donde}. La empresa: ${ctx.empresa}. Te escribe alguien del equipo de Smarteam.`,
    ctx.contexto.trim() ? `=== LO QUE YA SE SABE (interno) ===\n${ctx.contexto.trim()}` : "",
    `=== LOS DESTINOS ===\n${bloqueDeLosDestinos(ctx.destinos)}`,
    `=== LA CONVERSACIÓN ===\n${bloqueDeLaConversacion(m)}`,
    pregunta ? "" : "YA NO PREGUNTES: responde «listo» con lo que tengas.",
    lectura === "duda"
      ? "LO ÚLTIMO QUE ESCRIBIÓ PUEDE SER ALGO QUE CUENTA O UN PEDIDO: decídelo mirando la conversación. Si te pide algo sobre la cuenta (o sigue con lo que le respondiste), devuelve {\"tipo\":\"consulta\"}; si te cuenta algo, sigue como siempre."
      : "LO ÚLTIMO QUE ESCRIBIÓ NO ES UNA PREGUNTA: te está contando algo. No devuelvas «consulta».",
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
  /**
   * Lo último de la persona, con sus palabras, si PUEDE ser una pregunta (`comoSeLee` dio «duda»); null o sin dar si el
   * código sabe que cuenta algo. Sin ella, una «consulta» del modelo se toma como «listo, sin cambios». Con ella, lo que se
   * responde son esas palabras, nunca una reescritura del modelo.
   */
  laPregunta?: string | null;
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
    // Si el código sabe que contó algo, no se responde: queda para guardar como nota (si la persona quiere).
    return o.laPregunta ? { tipo: "consulta", pregunta: o.laPregunta.slice(0, TOPES.largoDelMensaje) } : LISTO_SIN_CAMBIOS;
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
  if (turnosDeLaConversacion >= TOPES.turnosPorConversacion) return "Esta conversación llegó a su tope. Empieza otra con «Nueva conversación».";
  return null;
}
