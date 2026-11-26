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
 *
 * ⛔ Al cambiar lo que el chat sabe hacer (contar, preguntar, pedir, un tope), se actualiza la página «El chat Nexus: qué
 * le puedes pedir» (lib/documentacion/semillas/chat-nexus.ts) y se vuelve a correr scripts/seed-pagina-chat-nexus.ts. Sus
 * frases de ejemplo de un pedido las prueba lib/documentacion/semillas/paginas.test.ts contra `esPedidoDeLaCuenta`.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { escaleraParaElAgente } from "@/lib/impacto/escalera";
import { citaEstaEnLasFuentes, normalizarParaCita } from "@/lib/timeline/limites";
import { voseoEnProsa } from "@/lib/ui/voseo-formas";
import type { RespuestaDeNexus } from "./respuesta";
import type { ListaEnLaConversacion } from "./lista";
import type { EscalaEnLaConversacion } from "./escala-en-la-conversacion";

/** Sonnet 4.6, el modelo por defecto de Nexus: entender qué quiso decir y a qué tarjeta va pide más que Haiku. */
export const MODELO_DEL_CHAT = "claude-sonnet-4-6";
const MAX_TOKENS_DEL_TURNO = 2_500;

/** Los topes de una conversación. El servidor los hace cumplir; el panel los usa para avisar antes. */
export const TOPES = {
  /**
   * Las vueltas de Claude en una conversación (cada «Enviar» es una). 12 desde el 24 nov (Elías: «12 vueltas»): la
   * conversación junta contar, preguntar y pedir lo de la cuenta. Eran 6.
   */
  turnosPorConversacion: 12,
  /** Las vueltas de Claude por persona y por día (en Costa Rica), sumando todas sus conversaciones. */
  turnosPorDia: 60,
  /** Cuántas veces puede preguntar antes de tener que decir adónde va. */
  rondasDePreguntas: 2,
  /** Cuántas preguntas en una misma vuelta. */
  preguntasPorRonda: 2,
  /**
   * El largo de lo que escribe o dicta la persona en un mensaje (Elías, 25 nov: de 4.000 a 15.000; Marco se topó con el
   * tope de un pedido a La escala). Lo que viaja de la conversación al modelo tiene su propio tope (`largoDeLaConversacion`).
   */
  largoDelMensaje: 15_000,
  /**
   * El largo de la nota que se guarda al contar (`notaDeLaConversacion`): el de una nota de la preventa (la validación de
   * `op: "nota"`, lib/exploraciones/esquemas.ts; una prueba la prueba con este número). Si lo contado pasa de ahí, la nota guarda
   * mensajes enteros (siempre la respuesta de «Responder con Nexus», después los más nuevos: `piezasDeLaNota`), y la persona lo ve antes de
   * «Guardar». Lo que se propone con lo contado se revisa contra lo que queda en la nota (`loQueQuedaEnLaNota`).
   */
  largoDeLaNota: 4_000,
  /**
   * Cuántas letras de la conversación viajan al modelo, como mucho (25 nov, con mensajes de 15.000: 28 mensajes podían ser
   * 420.000 letras y dejar sin lugar a la página y a las reuniones). El último va siempre entero; se recortan primero los
   * más viejos (`conTopeDeLaConversacion`).
   */
  largoDeLaConversacion: 60_000,
  /** Cuántos mensajes viajan (la persona y Nexus): dos por vuelta, con las 12 vueltas (eran 14 con 6). */
  mensajes: 28,
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
   * Desde el 24 nov (una sola conversación): «pedido», la persona le pidió algo de la cuenta (una tarea, el siguiente paso,
   * la guía, un documento: no va a la nota); «lista», lo que le contestó la parte de Nexus que trabaja la cuenta, con la
   * lista de cambios si la hubo (no es una ronda de preguntas).
   * Desde el 25 nov (un solo contexto): «cambio», la persona pidió un cambio a la página de La escala (no va a la nota);
   * «escala», lo que Nexus le propuso a esa página (no es una ronda de preguntas).
   */
  es?: MarcaDelMensaje;
  /**
   * La vuelta que dejó este mensaje de Nexus, cuando es una lista de la cuenta («lista») o una propuesta a La escala
   * («escala»): con ella se reconoce lo suyo al volver (./lista.ts › `emparejarListas`; ./guardada.ts). La pone el
   * servidor; la pantalla la devuelve tal cual.
   */
  vuelta?: string;
}

/** Las marcas de un mensaje (`MensajeDeLaConversacion.es`). Las valida la ruta y las lee la conversación guardada. */
export const MARCAS_DEL_MENSAJE = ["consulta", "respuesta", "cortesia", "guardado", "pedido", "lista", "cambio", "escala"] as const;
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
  /**
   * Hay una página de La escala que se le puede pedir cambiar (25 nov, un solo contexto: el Resumen armado, en la preventa).
   * Con esto, lo dudoso también puede ser un cambio a la página (`{"tipo":"cambio"}`).
   */
  conLaEscala?: boolean;
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
  | { tipo: "listo"; cambios: CambioPropuesto[]; hechos: HechoPropuesto[]; descartados: number; sinLeer?: true }
  /**
   * La persona le pidió algo de la cuenta (24 nov, una sola conversación): lo prepara la parte de Nexus que trabaja la
   * cuenta (lib/nexus-chat), con esta conversación como historia. Es un paso del servidor, como «consulta»: a la pantalla
   * llega la «lista».
   */
  | { tipo: "pedido"; pedido: string }
  /** Lo que contestó la parte de Nexus que trabaja la cuenta, con su lista de cambios (vacía si solo contestó). */
  | { tipo: "lista"; lista: ListaEnLaConversacion }
  /**
   * La persona pidió un cambio a la página de La escala (25 nov, un solo contexto). Un paso del servidor, como «pedido»: a
   * la pantalla llega la «escala».
   */
  | { tipo: "cambio"; pedido: string }
  /** Lo que Nexus propuso a la página de La escala: cada cambio con el antes y el después (./escala-en-la-conversacion.ts). */
  | { tipo: "escala"; escala: EscalaEnLaConversacion };

/** Lo que el modelo no pudo leer: «listo, sin cambios», marcado como no leído (la nota se guarda igual). */
export const NO_SE_PUDO_LEER: ResultadoDelTurno = { tipo: "listo", cambios: [], hechos: [], descartados: 0, sinLeer: true };
/** Leído, sin nada que proponer. */
export const LISTO_SIN_CAMBIOS: ResultadoDelTurno = { tipo: "listo", cambios: [], hechos: [], descartados: 0 };

// ── La conversación ─────────────────────────────────────────────────────────────

/** Los mensajes, limpios y dentro del tope; el último es de la persona. null si no hay nada que mandar. */
export function mensajesValidos(m: readonly MensajeDeLaConversacion[]): MensajeDeLaConversacion[] | null {
  const limpios = m
    .map((x) => ({
      de: x.de,
      texto: primerasSinPartir(x.texto.trim(), TOPES.largoDelMensaje),
      ...(x.es ? { es: x.es } : {}),
      ...(x.de === "nexus" && (x.es === "lista" || x.es === "escala") && typeof x.vuelta === "string" && x.vuelta ? { vuelta: x.vuelta.slice(0, 60) } : {}),
    }))
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
const SALUDO = /^((y|oye|nexus|hola|bueno|ok|okay|a ver|una pregunta|pregunta|por favor)[,:\s]+)+/;

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
 * Lo que va antes de la orden en un pedido amable: «¿Me puedes…», «Por favor…», «Quiero que…», «Ayúdame a…». Sin tildes.
 */
const ANTES_DEL_PEDIDO = /^(¿\s*)?(por favor[,\s]+)?((me|nos)\s+)?(puedes|podrias|podes|pudieras|quiero que|necesito que|te pido que|ayudame a)?\s*/;
/**
 * Las órdenes de un pedido de la cuenta, en imperativo, infinitivo, subjuntivo («quiero que crees») o presente amable
 * («¿me agregas…?»). Sin tildes. «Anota» y «apunta» no: arrancan contando («Anota que…»).
 */
const ORDEN_DEL_PEDIDO =
  /^((me|nos|le)\s+)?(crea|creame|crear|crearle|crees|creas|agrega|agregame|agregale|agregar|agregarle|agregues|agregas|anade|anademe|anadele|anadir|anadas|pon|ponme|ponle|poner|ponerle|pongas|pones|programa|programame|programar|programes|programas|agenda|agendame|agendar|agendes|agendas|mueve|muevela|mover|muevas|mueves|pasa|pasala|pasar|pases|pasas|cierra|cierrala|cerrar|cierres|cierras|marca|marcala|marcar|marques|marcas|cambia|cambiale|cambiala|cambiar|cambiarle|cambies|cambias|fija|fijale|fijar|fijes|fijas|define|definir|definas|defines|actualiza|actualizale|actualizar|actualices|actualizas|quita|quitale|quitar|quitarle|quites|quitas|saca|sacale|sacar|saques|sacas|borra|borrale|borrar|borres|borras|elimina|eliminar|elimines|eliminas|genera|generame|generar|generarme|generes|generas|arma|armame|armar|armes|armas|prepara|preparame|preparar|prepares|preparas)(?=[\s,.:;!?]|$)/;
/**
 * Sobre QUÉ de la cuenta: una tarea (o la T-12), el siguiente paso, la guía de la próxima sesión o un documento, CON su
 * artículo o su número («una tarea», «el siguiente paso», «dos preguntas a la guía»). Sin el artículo no es seguro: «Crea
 * tareas a mano en HubSpot» cuenta cómo trabaja el cliente (en español la orden y el presente se escriben igual). Sin tildes.
 */
const OBJETO_DEL_PEDIDO =
  /(^|\s)((un|una|el|la|los|las|esa|esta|esas|estas|otra|otras|otro|mi|su|sus|mis|\d+|dos|tres|cuatro|cinco)\s+(nuevas?\s+|nuevos?\s+)?(tareas?|recordatorios?|siguientes? pasos?|proximos? pasos?|preguntas? (a|de|en|para) la guia|repreguntas?|kickoff|handoff|diagnostico)|t-?\d+|(a|de|en|para) la guia)(?=[\s,.:;!?]|$)/;
/** «Recuérdame llamar a Ana el viernes» es una tarea; «Recuérdame qué dijo Ana» es una pregunta. Sin tildes. */
const RECUERDAME_HACER =
  /^recuerdame (que )?(llamar|llamarle|escribir|escribirle|mandar|mandarle|enviar|enviarle|revisar|agendar|preparar|pedir|pedirle|confirmar|hacer|dar|darle|seguir|contactar|buscar|preguntar|preguntarle)(?=[\s,.:;!?]|$)/;
/** Cuántas palabras después de la orden se mira el objeto («Crea para el lunes una tarea…»). */
const PALABRAS_HASTA_EL_OBJETO = 12;
/**
 * Al contestar una pregunta de Nexus, el objeto tiene que venir pegado a la orden («Crea una tarea…»): lo que contesta
 * casi siempre cuenta, y una orden lejos de su objeto es más bien parte del relato.
 */
const PALABRAS_HASTA_EL_OBJETO_AL_CONTESTAR = 3;

/**
 * ¿Lo que escribió la persona es SEGURO un pedido de la cuenta? (24 nov, una sola conversación) Una orden («crea»,
 * «agrega», «cambia», «mueve», «genera»…, también dicha con amabilidad: «¿Me puedes crear…?», «Quiero que agregues…») sobre
 * una tarea, el siguiente paso, la guía o un documento, con su artículo; o «Recuérdame llamar…». Lo dudoso lo decide el
 * modelo con la conversación a la vista (`comoSeLee` › «duda»).
 */
export function esPedidoDeLaCuenta(texto: string, o: { estricto?: boolean } = {}): boolean {
  const inicio = sinTildes(inicioDe(texto));
  if (!inicio) return false;
  if (RECUERDAME_HACER.test(inicio)) return true;
  const sinAmabilidad = inicio.replace(ANTES_DEL_PEDIDO, "");
  const orden = ORDEN_DEL_PEDIDO.exec(sinAmabilidad);
  if (!orden) return false;
  // «Pasa que…», «Cambia que…», «Marca que…»: cuenta lo que pasa, no pide. Y «Programa de referidos», «Agenda del
  // gerente», «Marca de la casa»: es el sustantivo, no la orden (revisión del 24 nov).
  if (/^\s*(que|de|del)(?=[\s,.:;!?]|$)/.test(sinAmabilidad.slice(orden[0].length))) return false;
  const tope = o.estricto ? PALABRAS_HASTA_EL_OBJETO_AL_CONTESTAR : PALABRAS_HASTA_EL_OBJETO;
  const despues = sinAmabilidad.slice(orden[0].length).replace(/[¿?¡!]/g, " ").trim().split(/\s+/).slice(0, tope).join(" ");
  return OBJETO_DEL_PEDIDO.test(` ${despues}`);
}

/**
 * Las órdenes de cambiar un texto (25 nov, un solo contexto): «cambia», «acóplalo», «acórtalo», «ponle», «quita», «agrega»,
 * «reescribe», «enfócalo»…, en imperativo (con su pronombre pegado o sin él), infinitivo («¿Puedes cambiarlo?»), subjuntivo
 * («Quiero que lo cambies») o presente amable («¿Me lo acortas?»). Sin tildes. «resumen» (el sustantivo) no es «resume».
 */
const ORDEN_DE_CAMBIO =
  /^((me|nos|le|lo|la|los|las|se)\s+)*(?!(mejor|resume)(?=[\s,.:;!?]|$))(cambi|reemplaz|reescrib|redact|acort|alarg|ajust|enfoc|acopl|mejor|correg|corrig|simplific|resum|actualiz|agreg|anad|quit|sac|borr|elimin|pon|pong|enfatiz|destac|suaviz|concret|precis)(a|e|ar|er|ir|as|es|ue|ues)?(lo|la|los|las|le|les|me|melo|mela|melos|melas|selo|sela)?(?=[\s,.:;!?]|$)/;
/**
 * Las partes de la página de La escala, como las nombra la persona (sin tildes): con una orden delante, es un cambio a la
 * página aunque el chat se haya abierto desde «Nexus» de arriba (25 nov). «Diagnóstico» solo, no: «genera el diagnóstico»
 * es un documento de la cuenta (lo prepara la mano de la cuenta).
 */
const PARTE_DE_LA_PAGINA =
  /(^|\s)(el (titular|titulo)|la bajada|el subtitulo|el problema principal|la tesis|(el|un|otro|los|un nuevo) puntos? clave|los puntos clave|lo mas critico|el recorrido|del recorrido|un paso del recorrido|el resumen|la escala|la pagina|la pagina del diagnostico|el diagnostico de rendimiento|equipos y hallazgos|el reto principal|lo que lo causa|quien es quien|lo que ya funciona|lo que falta validar|la cifra( grande)?|las cifras|las etiquetas|una etiqueta|el (primer|segundo) parrafo|el parrafo|el texto (de arriba|debajo del titulo|debajo del titular))(?=[\s,.:;!?]|$)/;

/** ¿Empieza con una orden de cambiar un texto (después de «¿Me puedes…», «Por favor…», «Quiero que…»)? Sin tildes. */
export function empiezaConUnCambio(texto: string): boolean {
  const inicio = sinTildes(inicioDe(texto)).replace(ANTES_DEL_PEDIDO, "");
  return ORDEN_DE_CAMBIO.test(inicio);
}

/**
 * ¿Lo que escribió la persona es SEGURO un cambio a la página de La escala, sin el chip de una sección? (25 nov) Una orden
 * de cambiar un texto Y una parte de la página que se nombra («Cambia el titular…», «Agrega un punto clave sobre…»). Lo
 * dudoso («Quiero que el texto se enfoque más en…») lo decide el modelo.
 */
export function pideUnCambioALaPagina(texto: string, o: { estricto?: boolean } = {}): boolean {
  const inicio = sinTildes(inicioDe(texto)).replace(ANTES_DEL_PEDIDO, "");
  const orden = ORDEN_DE_CAMBIO.exec(inicio);
  if (!orden) return false;
  // «Pasa que…», «Cambia que…»: cuenta lo que pasa; «Ponen el resumen en…»: no es la orden.
  const despues = inicio.slice(orden[0].length);
  if (/^\s*(que|de|del)(?=[\s,.:;!?]|$)/.test(despues)) return false;
  const tope = o.estricto ? PALABRAS_HASTA_EL_OBJETO_AL_CONTESTAR + 2 : PALABRAS_HASTA_EL_OBJETO;
  const cerca = ` ${despues.replace(/[¿?¡!]/g, " ").trim().split(/\s+/).slice(0, tope).join(" ")}`;
  const pagina = PARTE_DE_LA_PAGINA.exec(cerca);
  if (!pagina) return false;
  // Gana lo que se nombra primero (segunda revisión del 25 nov): «Agrega una tarea para revisar el resumen» es una tarea;
  // «Agrega un punto clave sobre las tareas» es la página.
  const cuenta = NOMBRA_LA_CUENTA.exec(cerca);
  return !cuenta || pagina.index < cuenta.index;
}

/**
 * Lo de la cuenta que se nombra en un pedido (sin tildes): una tarea, un recordatorio, el siguiente paso, la guía o una nota.
 * Con esto delante, una orden no es un cambio a la página aunque después la nombre (segunda revisión del 25 nov).
 */
const NOMBRA_LA_CUENTA =
  /(^|\s)((un|una|el|la|los|las|esa|esta|otra|otro|mi|su|como|en|a|de|para)\s+)?(tareas?|recordatorios?|siguientes? pasos?|proximos? pasos?|guia|repreguntas?|notas?)(?=[\s,.:;!?]|$)/;

/** ¿Nombra algo de la cuenta (una tarea, la guía, el siguiente paso, una nota)? Entonces no es un cambio seguro a la página. */
export const nombraLaCuenta = (texto: string): boolean => NOMBRA_LA_CUENTA.test(` ${sinTildes(inicioDe(texto))}`);

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
/*
 * Desde el 24 nov (una sola conversación) también «pedido»: SEGURO un pedido de la cuenta (`esPedidoDeLaCuenta`: «Crea una
 * tarea…», «Cambia el siguiente paso…», «Agrega a la guía…»), o la persona eligió `pedir`. Lo prepara la parte de Nexus que
 * trabaja la cuenta, sin la llamada que clasifica. Después de una lista de Nexus, lo que sigue («para Ana», «y otra el
 * viernes», «¿y la de Juan?») puede seguir con el pedido: lo decide el modelo, salvo lo que arranca contando o es otro
 * pedido seguro.
 */
/*
 * Desde el 25 nov (un solo contexto) también «cambio»: un cambio a la página de La escala. `escala`:
 *   - «chip»: el chat se abrió desde «✨ Mejorar con IA» de La escala (el chip de una sección o de la página). Lo que no es
 *     un pedido de la cuenta, un «gracias» ni una pregunta es un cambio a esa parte; una pregunta que empieza con una orden
 *     («¿Me lo acortas?», «¿Puedes cambiar la cifra?») también. «¿Qué información tienes sobre el problema principal?» se
 *     responde (Elías, 25 nov: antes contestaba «Nexus no propone cambios»).
 *   - «pagina»: sin chip, pero hay una página de La escala que cambiar (el Resumen armado). Un cambio SEGURO
 *     (`pideUnCambioALaPagina`: «Cambia el titular…») va a la página; lo dudoso lo decide el modelo, que puede devolver
 *     `{"tipo":"cambio"}`.
 */
export type ComoSeLee = "pregunta" | "contar" | "duda" | "cortesia" | "pedido" | "cambio";
export function comoSeLee(
  m: readonly MensajeDeLaConversacion[],
  o: { contar?: boolean; preguntar?: boolean; pedir?: boolean; escala?: "chip" | "pagina" | null } = {},
): ComoSeLee {
  if (o.contar) return "contar";
  if (o.preguntar) return "pregunta";
  if (o.pedir) return "pedido";
  const ultimo = m[m.length - 1];
  const antes = m[m.length - 2];
  if (!ultimo || ultimo.de !== "persona") return "contar";
  // Un pedido seguro gana aunque Nexus le haya preguntado algo de lo que contaba: «Crea una tarea para revisarlo» no
  // contesta «¿De qué período?» (revisión del 24 nov: iba a la nota y no había botón para decir «hazlo»).
  const contesta = !!antes && antes.de === "nexus" && !antes.es;
  // Una orden sobre una parte de la página que se nombra gana sobre un pedido de la cuenta (revisión del 25 nov: «Agrega un
  // punto clave sobre las tareas manuales» o «Cambia el diagnóstico de rendimiento» se iban a la cuenta).
  if (o.escala && pideUnCambioALaPagina(ultimo.texto, { estricto: contesta && o.escala === "pagina" })) return "cambio";
  if (esPedidoDeLaCuenta(ultimo.texto, { estricto: contesta })) return "pedido";
  if (o.escala === "chip") {
    // Con el chip de La escala: lo que se escribe es un cambio a esa parte, salvo un «gracias» o una pregunta de verdad.
    if (esCortesia(ultimo.texto)) return "cortesia";
    // Lo que nombra la cuenta («Ponlo en la guía», «Agrégalo como tarea») no es seguro un cambio: lo decide el modelo.
    if (nombraLaCuenta(ultimo.texto)) return "duda";
    if (empiezaConUnCambio(ultimo.texto)) return "cambio";
    // Lo que arranca contando («Ojo: usan SAP», «Nos dijeron…», lo que sugiere «nada que guardar») no es seguro un cambio:
    // lo decide el modelo, que puede contarlo (cuarta revisión del 25 nov).
    if (empiezaContando(ultimo.texto)) return "duda";
    return pareceUnaPregunta(ultimo.texto) ? "pregunta" : "cambio";
  }
  // Sigue con lo que Nexus le propuso a la página (revisión del 25 nov: «Simplifícalo» se leía como una pregunta y gastaba
  // una de las preguntas del día): una orden es un cambio; lo demás lo decide el modelo, que puede decir «cambio».
  if (o.escala === "pagina" && antes?.de === "nexus" && antes.es === "escala") {
    if (esCortesia(ultimo.texto)) return "cortesia";
    if (empiezaConUnCambio(ultimo.texto) && !nombraLaCuenta(ultimo.texto)) return "cambio";
    return "duda";
  }
  // Contesta lo que Nexus le preguntó («¿De qué período?» → «¿Mensual, creo?»): eso es contar. Si en vez de contestar
  // preguntó otra cosa, la salida es «¿Era una pregunta?».
  if (antes && antes.de === "nexus" && !antes.es) return "contar";
  // Un «gracias» o un «ok» solos no se cuentan ni se responden: Nexus contesta corto (22 nov).
  if (esCortesia(ultimo.texto)) return "cortesia";
  const conSigno = conSignoDePregunta(ultimo.texto.trim().toLowerCase());
  if (empiezaContando(ultimo.texto)) return conSigno ? "duda" : "contar";
  // Sigue con lo que Nexus le propuso para la cuenta (o con lo que le preguntó sobre eso): lo decide el modelo.
  if (antes && antes.de === "nexus" && antes.es === "lista") return "duda";
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
 * Lo que va después del encabezado de «Responder con Nexus» en La escala («Sobre Ventas · Datos (cómo registran hoy los
 * contactos): …»): lo que escribió la persona. null si no lleva ese encabezado. La forma es la de
 * lib/exploraciones/forma-de-la-respuesta.ts (acá sin importarla: el chat no lee la preventa); una prueba compara las dos.
 * La pregunta puede traer paréntesis («(HubSpot o Salesforce)»): el encabezado termina en el ÚLTIMO «): » de su largo.
 */
export function sinElEncabezadoDeLaRespuesta(texto: string): string | null {
  const t = texto.trimStart();
  if (!/^sobre /i.test(t)) return null;
  const cabeza = t.slice(0, 520);
  const conPregunta = cabeza.lastIndexOf("): ");
  const sinPregunta = cabeza.slice(0, 180).indexOf(": ");
  const fin = conPregunta > 0 ? conPregunta + 3 : sinPregunta > 0 && !cabeza.slice(0, sinPregunta).includes("(") ? sinPregunta + 2 : -1;
  // «Sobre <equipo> · <parte>»: sin el « · » antes de la pregunta, es alguien que escribe «Sobre la cobranza: ¿…?».
  return fin > 0 && /^sobre [^()]+ · /i.test(t.slice(0, fin)) ? t.slice(fin) : null;
}

/**
 * Las frases con que se arranca a preguntar y no cuentan nada («Tengo una duda.», «Hola Nexus, buenas tardes.», «Una
 * última pregunta:»). Sin tildes.
 */
const FRASE_DE_ARRANQUE =
  /^((y|oye|mira|nexus|hola|bueno|ok|okay|a ver|una pregunta|pregunta|por favor|muy bien|entonces|perfecto|gracias|listo|disculpa|perdon)[\s,]*)*(tengo (una|otra) (duda|pregunta|consulta)( rapida)?|(una|otra) (ultima )?(duda|pregunta|consulta)( rapida| mas)?|pregunta rapida|buen[oa]?s? (dia|dias|tardes|noches)|hola( equipo)?|muy bien( entonces)?|ok( entonces)?|bueno( entonces)?|otra cosa|una cosa|por cierto|ahora bien|(muchas )?gracias( por (la|el|tu|esa|esta|lo) [a-z]+)?|(te )?quiero preguntar(te)?( algo)?|quisiera preguntar(te)?( algo)?|te pregunto( algo)?|dejame preguntarte( algo)?)?( nexus)?$/;

/**
 * Lo que presenta el tema de una pregunta y no cuenta nada por sí solo («Sobre la cobranza, ¿qué dijeron?», «En la reunión
 * del martes, ¿qué dijo Ana?»). Solo el arranque y como mucho dos palabras más: «En esa reunión firmaron el contrato» o
 * «Sobre la integración ya tienen API» sí cuentan (cuarta revisión del 25 nov). «Sobre todo…» no es un tema. Sin tildes.
 */
const PRESENTA_EL_TEMA =
  /^(sobre(?! todo\b)|acerca de|respecto (a|al|de|del)|con respecto (a|al)|en cuanto (a|al)|en relacion (a|al|con)|hablando de|volviendo (a|al)|en (la|esa|esta) (reunion|llamada|sesion)|en el (kickoff|diagnostico))(?=\s|$)/;

/**
 * Pedidos sin signo que `pareceUnaPregunta` no ve a propósito (allá «Lista de precios…» podría contar algo; acá solo
 * deciden si se ofrece guardar): «Dame los retos», «Quisiera conocer…», «Haz un resumen». Sin tildes. Seguido de «que»
 * cuenta algo («Explica que no tienen presupuesto»): `pideSinSigno`.
 */
const PIDE_SIN_SIGNO =
  /^(dame(los|las|lo|la)?|me interesa(ria)? saber|quisiera (saber|conocer|entender)|quiero (conocer|entender)|necesito (conocer|entender)|investiga|haz(me)? un (resumen|listado|analisis|repaso)|hazme|lista (los|las|todos|todas|lo)|explica(me)?)(?=[\s,.:;!?]|$)/;

/** Sin tildes, en minúsculas, sin el saludo de adelante («Oye, …», «Por favor …»). */
const planoSinSaludo = (x: string) => sinTildes(x.trim().toLowerCase()).replace(/\s+/g, " ").replace(SALUDO, "");

function pideSinSigno(x: string): boolean {
  const plano = planoSinSaludo(x);
  const orden = PIDE_SIN_SIGNO.exec(plano);
  return !!orden && !/^\s*que(?=\s|$)/.test(plano.slice(orden[0].length));
}

/** ¿El pedazo solo presenta el tema («Sobre la cobranza», «En la reunión del martes»)? El arranque y hasta dos palabras. */
function soloPresentaElTema(x: string): boolean {
  const plano = planoSinSaludo(x);
  const arranque = PRESENTA_EL_TEMA.exec(plano);
  return !!arranque && plano.slice(arranque[0].length).trim().split(" ").filter(Boolean).length <= 2;
}

/**
 * Los pedazos de un texto sin sus preguntas: sin cada «¿…?» (también sin cerrar, hasta el final) ni lo que termina en «?»
 * desde el último corte; los cortes son la puntuación, los dos puntos y los renglones. El «？» de ancho completo cuenta.
 */
function sinLasPreguntas(t: string): string[] {
  const conSignos = t.replace(/？/g, "?");
  const sinAbiertas = conSignos.replace(/¿[^?]*\?/g, "\n").replace(/¿[^?]*$/, "\n");
  const sinCerradas = sinAbiertas.replace(/[^\n.,;:!¡¿?]*\?/g, "\n");
  return sinCerradas
    .split(/[\n.,;:!¡¿?]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * De los pedazos sin las preguntas, los que pueden contar algo: dos palabras o más («Usan Salesforce, ¿lo anoto?»; una
 * basta en la respuesta a La escala: «¿Cuál era? Salesforce»), que no sean un saludo, una frase de arranque, el tema de la
 * pregunta, un pedido ni un «gracias».
 */
function loQueCuentaSinLasPreguntas(t: string, minimo = 2): string[] {
  return sinLasPreguntas(t).filter((x) => {
    const plano = sinTildes(x.toLowerCase()).replace(/\s+/g, " ");
    const palabras = plano.split(" ").filter((p) => /[a-z0-9]/.test(p)).length;
    if (palabras < minimo || FRASE_DE_ARRANQUE.test(plano) || pideSinSigno(x) || soloPresentaElTema(x)) return false;
    return !pareceUnaPregunta(x) && !esCortesia(x) && !esPedidoDeLaCuenta(x);
  });
}

/**
 * Lo que la persona contó, también en pedazos, para revisar la cita de un hecho de «Guardarlo como nota»: sin el
 * encabezado de La escala y sin sus signos («¿Unos 40?» → «Unos 40»), y cada pedazo entre preguntas o puntos («Usan SAP,
 * ¿lo anoto?» → «Usan SAP»). Una cita corta vale solo ENTERA (`laDijoLaPersona`): así «Unos 40» cuenta (cuarta revisión).
 */
export function loQueContoEnPedazos(m: readonly MensajeDeLaConversacion[]): string[] {
  // Lo que queda en la nota: si se cortó, lo de antes del corte no respalda lo que se guarda.
  const textos = loQueQuedaEnLaNota(m);
  const pedazos = textos.flatMap((t) => {
    const r = sinElEncabezadoDeLaRespuesta(t) ?? t;
    return [r, r.replace(/[¿?？]/g, " ").replace(/\s+/g, " ").trim(), ...r.split(/[¿?？\n]+|[.;:!,](?=\s)/).map((x) => x.trim())];
  });
  return [...new Set([...textos, ...pedazos].filter(Boolean))];
}

/** Una pregunta que pregunta («¿Qué opciones hay?», «¿Cuántos son?»): con un qué, cuál, cómo, quién, dónde, cuándo o cuánto. */
const PREGUNTA_CON_INTERROGATIVO =
  /^[\s"«“'(]*¿?\s*(qué|cuál|cuáles|cómo|quién|quiénes|dónde|cuándo|cuánto|cuánta|cuántos|cuántas|por qué|cual|cuales|quien|quienes|donde|cuanto|cuanta|cuantos|cuantas)(?=[\s,.:;!?]|$)/i;

/**
 * ¿Lo que escribió la persona PUEDE ser algo que cuenta, a primera vista? Elías, 25 nov (TEC · AE): alguien preguntó
 * «cuales son los retos principales del AE?», Nexus respondió y «Guardarlo como nota» dejó la PREGUNTA en «Lo que sabes del
 * cliente», como si el equipo lo supiera (desde ese día «Ubicar» lee esas notas y una nota puede fijar un nivel). Lo SEGURO
 * se mira acá: una pregunta sola (con su signo, «dime…», «quiero saber…»), un pedido de la cuenta o un «gracias» nunca son
 * una nota; una pregunta con algo contado antes («Nos dijeron que arrancan en enero. ¿Qué sigue?») sí puede serlo. Lo que
 * no es seguro («Oye, cuales son los retos del AE», sin signo) lo decide lo que Nexus entienda al contarlo: si no encuentra
 * nada del cliente, no hay nada que guardar (`NADA_QUE_GUARDAR`, ./conversacion-server.ts). Una revisión del 25 nov
 * encontró que mirar cómo empieza la frase falla para los dos lados («Quien decide es el gerente» cuenta algo).
 */
export function esAlgoQueSeCuenta(texto: string): boolean {
  const respuesta = sinElEncabezadoDeLaRespuesta(texto);
  const t = (respuesta ?? texto).trim();
  if (!t || esCortesia(t) || esPedidoDeLaCuenta(t)) return false;
  if (respuesta !== null) {
    // La respuesta a una pregunta de La escala es su respuesta aunque dude («¿En un Excel, creo?»): el signo no la corta.
    // La corta que pida algo («dime los retos») o que solo pregunte («¿Qué opciones hay?»).
    if (pareceUnaPregunta(t.replace(/[¿?？]/g, " ")) || pideSinSigno(t)) return false;
    return loQueCuentaSinLasPreguntas(t, 1).length > 0 || !PREGUNTA_CON_INTERROGATIVO.test(t);
  }
  // Sin un signo, sin un pedido y sin una pregunta sin signo: cuenta algo («La cobranza la hacen a mano»).
  if (!/[¿?？]/.test(t) && !pareceUnaPregunta(t) && !pideSinSigno(t)) return true;
  // Si no, lo que queda sin las preguntas («Tienen 40 vendedores, ¿eso cambia el plan?», «¿Sabes qué? Tienen 40
  // vendedores»). Lo que pasa esta guarda y no cuenta nada lo frena lo que entienda Nexus al contarlo.
  return loQueCuentaSinLasPreguntas(t).length > 0;
}

/** Lo que dice el servidor si le llega una pregunta para guardar como nota (la pantalla ya no ofrece el botón). */
export const UNA_PREGUNTA_NO_ES_UNA_NOTA =
  "Eso es una pregunta (o un pedido): no se guarda como nota. Si sabes algo del cliente, cuéntaselo a Nexus con tus palabras y lo guardas tú.";

/** Lo que dice si, al contarlo, Nexus no encontró nada del cliente (ni un hecho ni un cambio): no hay nada que guardar. */
export const NADA_QUE_GUARDAR = "No encontré nada del cliente para guardar en eso. Si es algo que sabes del cliente, escríbelo empezando con «Ojo:» y lo guardo como nota.";

/**
 * «¿Era algo que querías contar? Guardarlo como nota», debajo de la ÚLTIMA respuesta (`i`): lo que se manda en su lugar. Sale el
 * par (lo que la persona escribió, marcado como consulta, y la respuesta de Nexus) y lo que escribió vuelve al final como
 * algo que cuenta. null si `i` no es una respuesta a una consulta de la persona, o si lo que escribió no es algo que se
 * cuenta (`esAlgoQueSeCuenta`, 25 nov): una pregunta de verdad no tiene este botón. Lo que se manda es SIEMPRE lo que
 * escribió la persona, nunca el texto de Nexus.
 */
export function paraContarComoNota<M extends MensajeDeLaConversacion>(m: readonly M[], i: number): { base: M[]; texto: string } | null {
  // Solo la última: una del medio, movida al final, se leería como la respuesta a lo que Nexus preguntó después.
  if (i !== m.length - 1) return null;
  const respuesta = m[i];
  const consulta = m[i - 1];
  // También debajo de lo que contestó la mano de la cuenta (24 nov): «Pasa que…» leído como pedido se cuenta con un clic.
  if (!respuesta || !consulta || respuesta.de !== "nexus" || (respuesta.es !== "respuesta" && respuesta.es !== "lista") || consulta.de !== "persona" || !consulta.texto.trim()) return null;
  if (!esAlgoQueSeCuenta(consulta.texto)) return null;
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
export function notaDeLaConversacion(m: readonly MensajeDeLaConversacion[], tope = TOPES.largoDeLaNota): string {
  return piezasDeLaNota(loQueConto(m), tope)
    .map((p) => (p.cortada ? `…${p.texto}` : p.texto))
    .join("\n");
}

/**
 * Lo que contó la persona TAL COMO QUEDA EN LA NOTA, para revisar las citas de lo que se propone con eso (25 nov): si la
 * nota se cortó, lo de antes del corte no la respalda. Mensaje por mensaje (una respuesta corta, «Unos 40», vale entera:
 * `laDijoLaPersona`), y del que quedó en el borde, su pedazo.
 */
export function loQueQuedaEnLaNota(m: readonly MensajeDeLaConversacion[]): string[] {
  return piezasDeLaNota(loQueConto(m), TOPES.largoDeLaNota).map((p) => p.texto);
}

/**
 * Los mensajes que entran en una nota de `tope` letras (con un renglón entre cada uno). Si no entra todo: la respuesta de
 * «Responder con Nexus» («Sobre Ventas · Datos (…): …») va siempre entera, porque su renglón marca la pregunta como
 * respondida y le dice a «Ubicar» de qué área es (segunda revisión de los topes); después, enteros los más nuevos, y del
 * que queda en el borde, su final (`cortada`: la nota le pone «…» adelante). Los de antes no van.
 */
function piezasDeLaNota(conto: readonly string[], tope: number): Array<{ texto: string; cortada?: true }> {
  if (conto.join("\n").length <= tope) return conto.map((texto) => ({ texto }));
  const entran = new Map<number, { texto: string; cortada?: true }>();
  let queda = tope;
  const tomar = (i: number, texto: string, cortada?: true) => {
    entran.set(i, cortada ? { texto, cortada } : { texto });
    queda -= texto.length + (cortada ? 1 : 0) + (entran.size > 1 ? 1 : 0);
  };
  conto.forEach((t, i) => {
    if (sinElEncabezadoDeLaRespuesta(t) !== null && t.length + (entran.size ? 1 : 0) <= queda) tomar(i, t);
  });
  for (let i = conto.length - 1; i >= 0 && queda > 0; i--) {
    if (entran.has(i)) continue;
    const t = conto[i];
    if (t.length + (entran.size ? 1 : 0) <= queda) {
      tomar(i, t);
      continue;
    }
    // El del borde: su final, con «…» y, si hay otros, el renglón que lo separa.
    const cabe = queda - 1 - (entran.size ? 1 : 0);
    if (cabe >= 20) tomar(i, ultimasSinPartir(t, cabe).trimStart(), true);
    break;
  }
  return [...entran.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => p);
}

/** Los primeros `n` caracteres sin partir un emoji (un par de UTF-16 a medias no se guarda en la base). */
export function primerasSinPartir(t: string, n: number): string {
  if (t.length <= n) return t;
  const c = t.charCodeAt(n - 1);
  return t.slice(0, c >= 0xd800 && c <= 0xdbff ? n - 1 : n);
}

/** Los últimos `n` caracteres sin partir un emoji. */
export function ultimasSinPartir(t: string, n: number): string {
  if (t.length <= n) return t;
  const desde = t.length - n;
  const c = t.charCodeAt(desde);
  return t.slice(c >= 0xdc00 && c <= 0xdfff ? desde + 1 : desde);
}

/**
 * Lo que viaja de una conversación a un modelo, dentro de `tope` letras (25 nov). El último mensaje va siempre entero; si no
 * cabe todo, se recortan primero los más viejos: el que queda en el borde termina en «…» (si le quedan 200 letras o más) y
 * los de antes no van. Sirve para mensajes y para los turnos de la mano de la cuenta.
 */
export function conTopeDeLaConversacion<T extends { texto: string }>(m: readonly T[], tope: number = TOPES.largoDeLaConversacion): T[] {
  const total = m.reduce((s, x) => s + x.texto.length, 0);
  if (total <= tope || m.length < 2) return [...m];
  const ultimo = m[m.length - 1];
  let queda = tope - ultimo.texto.length;
  const antes: T[] = [];
  for (let i = m.length - 2; i >= 0 && queda > 0; i--) {
    const x = m[i];
    if (x.texto.length <= queda) {
      antes.unshift(x);
      queda -= x.texto.length;
      continue;
    }
    if (queda >= 200) antes.unshift({ ...x, texto: `${primerasSinPartir(x.texto, queda - 1).trimEnd()}…` });
    break;
  }
  return [...antes, ultimo];
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
- Cuando la persona te pide HACER algo en la cuenta (crear, cambiar o mover una tarea; fijar el siguiente paso; agregar, cambiar o quitar preguntas de la guía de la próxima sesión; generar un documento), o sigue con una lista que Nexus le propuso para la cuenta (contesta lo que Nexus le preguntó sobre ella, le suma o le cambia algo: «para Ana», «y otra para el viernes», «sin la segunda»), devuelves {"tipo":"pedido"}. Otra parte de Nexus lo prepara. Lo mismo que en «consulta»: si el pedido de la vuelta dice que es algo que cuenta, no devuelvas «pedido».

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

RESPONDE SOLO UN OBJETO JSON, sin texto alrededor, con una de estas cuatro formas:
{"tipo":"pregunta","preguntas":["…"]}
{"tipo":"consulta"}
{"tipo":"pedido"}
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
            : x.es === "pedido"
              ? "PERSONA (pidió algo de la cuenta)"
              : x.es === "cambio"
                ? "PERSONA (pidió un cambio a la página de La escala)"
                : "PERSONA"
      : x.es === "respuesta"
        ? "NEXUS (respondió)"
        : x.es === "cortesia"
          ? "NEXUS (contestó)"
          : x.es === "lista"
            ? "NEXUS (sobre la cuenta)"
            : x.es === "escala"
              ? "NEXUS (propuso cambios a La escala)"
              : "NEXUS";
  return conTopeDeLaConversacion(m)
    .map((x) => `${quien(x)}: ${x.texto}`)
    .join("\n\n");
}

/**
 * El pedido de una vuelta. `lectura`: lo que decidió el código (`comoSeLee`; una «pregunta» segura no llega acá). Sin el
 * nombre de quien escribe, a propósito: con él, el modelo armaba preguntas sobre esa persona («¿qué dijo Elías…?»).
 * Quién y cuándo los pone el servidor en la nota.
 */
export function pedidoDelTurno(
  ctx: ContextoParaNexus,
  m: readonly MensajeDeLaConversacion[],
  lectura: Exclude<ComoSeLee, "pregunta" | "cortesia" | "pedido" | "cambio">,
  /** La persona apretó «Guardarlo como nota» (25 nov): si en lo escrito no hay nada del cliente, que no saque un hecho. */
  o: { desdeElBoton?: boolean } = {},
): Anthropic.Messages.MessageCreateParamsNonStreaming {
  // Desde «Guardarlo como nota» no pregunta (tercera revisión del 25 nov): si preguntara, lo que la persona conteste se
  // juntaría con lo de antes en la nota, y una pregunta suya terminaría guardada. Termina en «listo» o en «nada que guardar».
  const pregunta = !o.desdeElBoton && puedePreguntar(m);
  const texto = [
    `Estás en ${ctx.donde}. La empresa: ${ctx.empresa}. Te escribe alguien del equipo de Smarteam.`,
    ctx.contexto.trim() ? `=== LO QUE YA SE SABE (interno) ===\n${ctx.contexto.trim()}` : "",
    `=== LOS DESTINOS ===\n${bloqueDeLosDestinos(ctx.destinos)}`,
    `=== LA CONVERSACIÓN ===\n${bloqueDeLaConversacion(m)}`,
    pregunta ? "" : "YA NO PREGUNTES: responde «listo» con lo que tengas.",
    lectura === "duda"
      ? `LO ÚLTIMO QUE ESCRIBIÓ PUEDE SER ALGO QUE CUENTA, UNA PREGUNTA O UN PEDIDO: decídelo mirando la conversación. Si te pregunta algo sobre la cuenta (o sigue con lo que le respondiste), devuelve {"tipo":"consulta"}; si te pide hacer algo en la cuenta (una tarea, el siguiente paso, la guía; o sigue con la lista que Nexus le propuso), devuelve {"tipo":"pedido"};${
          ctx.conLaEscala
            ? ' si te pide cambiar algo de la página de La escala que ve el cliente (el título, el texto de arriba, el problema principal, los puntos clave, el recorrido, un equipo, una cifra; o sigue con los cambios que Nexus le propuso a esa página), devuelve {"tipo":"cambio"};'
            : ""
        } si te cuenta algo, sigue como siempre.`
      : `LO ÚLTIMO QUE ESCRIBIÓ NO ES UNA PREGUNTA NI UN PEDIDO: te está contando algo. No devuelvas «consulta», «pedido» ni «cambio».${
          o.desdeElBoton
            ? " Si en lo que escribió no hay nada del cliente (pregunta algo, pide algo o saluda), responde «listo» sin cambios y sin hechos: no inventes un hecho de una pregunta."
            : ""
        }`,
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
   * Lo último de la persona, con sus palabras, si PUEDE ser una pregunta o un pedido (`comoSeLee` dio «duda»); null o sin
   * dar si el código sabe que cuenta algo. Sin ella, una «consulta» del modelo se toma como «listo, sin cambios». Con ella, lo que se
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
  if (crudo.tipo === "pedido") {
    // Igual que una consulta: solo si lo último PUEDE ser un pedido, y con las palabras de la persona.
    return o.laPregunta ? { tipo: "pedido", pedido: o.laPregunta.slice(0, TOPES.largoDelMensaje) } : LISTO_SIN_CAMBIOS;
  }
  if (crudo.tipo === "cambio") {
    // Un cambio a la página de La escala (25 nov): igual, solo si lo último PUEDE serlo, con las palabras de la persona.
    return o.laPregunta ? { tipo: "cambio", pedido: o.laPregunta.slice(0, TOPES.largoDelMensaje) } : LISTO_SIN_CAMBIOS;
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
