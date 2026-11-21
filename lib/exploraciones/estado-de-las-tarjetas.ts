/**
 * lib/exploraciones/estado-de-las-tarjetas.ts — qué tan sabida está cada tarjeta del marco, para que el color del panel
 * diga la verdad. PURO (lo usan el panel de la derecha y «lista para proponer»).
 *
 * Feedback de Ventas del 22 oct: el panel se ve «todo en verde» y no refleja lo que pasa. Medido ese día (solo lectura):
 * en Cicadex, «Tiempos» estaba en verde con «No determinado por el momento, primero haremos un diagnóstico completo» y
 * «Sin fecha límite explícita…», y «Quién decide» con dos personas que influyen y ninguna que apruebe; «Para proponer»
 * contaba el «Para cuándo» como listo. Verde era «tiene texto». Y una tarjeta verde escondía lo nuevo que traía una
 * sesión (el ícono de sugerida solo aparecía en una vacía).
 *
 * Ahora cada tarjeta está:
 *   · `completa` — dice algo que sirve: la meta con cifra, alguien que aprueba, un texto que no dice «no se sabe».
 *   · `aMedias` — tiene texto pero no alcanza: una meta sin cifra, quién decide sin quien aprueba, o todo lo que dice es
 *     que no se sabe. Va en ámbar, con el motivo.
 *   · `sugerida` — vacía, con algo que propuso el agente.
 *   · `falta` — vacía.
 * `nuevo`: lo que propuso el agente para una tarjeta que ya tiene algo (una sesión trajo más): un punto en el panel.
 *
 * 2026-11-20 (Ventas, vender por resultados): Negocio y Embudo quedan completas «con lo mínimo» —las cifras que alcanzan
 * para calcular la pérdida: dos de volumen, ticket y clientes; los leads y la conversión—; lo demás suma pero no frena.
 * «Qué pasa si no actúa» queda completa solo con una CIFRA (o con la pérdida validada con el cliente); sin ella, a medias
 * con «falta la cifra». Con la pérdida calculada y la tarjeta vacía, está sugerida (la propone Nexus).
 */
import { esDeCifras, metaEnCifras, type ClaveDeCasilla, type Cifras, type Meta, type Persona } from "./casillas";
import { numeroDe, tasaDe, traeCifra } from "./perdida";

export type EstadoDeLaTarjeta = "completa" | "aMedias" | "sugerida" | "falta";

/**
 * ¿El texto dice que no se sabe? «No determinado por el momento», «Sin fecha límite explícita», «por definir», «no lo
 * confirmaron», «no hay presupuesto definido»… Lo que pasa cuando se confirma lo que el agente leyó de una reunión en la
 * que el tema no salió.
 */
const NO_SE_SABE =
  /\b(no (est[aá]n? |fue |ha sido |se ha |se |lo )?(determinad|definid|confirmad|declarad|mencionad|especificad|precisad|establecid|sab)|no (hay|tienen|tiene|existe) (un |una |ning[uú]n |ninguna )?(fecha|plazo|presupuesto|rango|monto|l[ií]mite|cifra)|sin (una |un )?(fecha|plazo|presupuesto|rango|monto|l[ií]mite|cifra)s?\b|por (definir|confirmar|determinar)|a[uú]n no (lo |la )?(sab|defin|confirm|determin)|pendiente de (definir|confirmar)|se desconoce|desconocid[oa]|no indic[oó]|no dijo)/i;

/**
 * Lo concreto que salva a un texto aunque diga que algo no está definido (revisión del 23 oct): un monto o un número
 * («USD 15k aprobados, no dijo si incluye licencias»), una comparación («lo comparan con lo que pagan hoy en Zoho»), una
 * condición («sin límite si se demuestra ROI») o una fecha o un plazo con nombre («antes de diciembre», «en el Q1»).
 */
const ALGO_CONCRETO =
  /\d|\$|₡|€|\busd\b|\bmil\b|\bmill[oó]n(es)?\b|\bcompar|\bcontra\b|\bsi se\b|\bsiempre que\b|\bdepende\b|\bsujeto a\b|\baprobad|\bantes de\b|\bq[1-4]\b|\btrimestre\b|\bsemestre\b|\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/i;

/** «… en la reunión del 8 oct 2026»: de cuándo es lo dicho, no un dato del tema. Se saca antes de buscar lo concreto. */
const DE_LA_REUNION = /\b(en|durante|desde) (la|una|esa) (reuni[oó]n|sesi[oó]n|llamada)\b[^,.;]*/gi;

export function diceQueNoSeSabe(texto: string): boolean {
  if (!NO_SE_SABE.test(texto)) return false;
  return !ALGO_CONCRETO.test(texto.replace(DE_LA_REUNION, " "));
}

/** Los textos de una tarjeta, cualquiera sea su forma (texto, lista, metas, retos, personas). */
function textosDe(valor: unknown): string[] {
  if (typeof valor === "string") return valor.trim() ? [valor] : [];
  if (!Array.isArray(valor)) return [];
  return valor
    .map((x) => (typeof x === "string" ? x : typeof x === "object" && x ? String((x as Record<string, unknown>).que ?? (x as Record<string, unknown>).texto ?? (x as Record<string, unknown>).nombre ?? "") : ""))
    .filter((t) => t.trim());
}

/** ¿Tiene algo que sirva? Un texto, y no solo frases que dicen que no se sabe. */
export function conAlgoQueSirve(valor: unknown): boolean {
  const textos = textosDe(valor);
  return textos.length > 0 && textos.some((t) => !diceQueNoSeSabe(t));
}

export interface EstadoDeUnaTarjeta {
  estado: EstadoDeLaTarjeta;
  /** Por qué está a medias, en pocas palabras (para el título del botón). */
  motivo?: string;
  /** Tiene algo y el agente propuso más: una sesión trajo algo nuevo para revisar. */
  nuevo: boolean;
}

/** La pérdida de la exploración, para «Qué pasa si no actúa»: validada con el cliente, calculada y por validar, o nada. */
export type PerdidaParaLaTarjeta = "validada" | "porValidar" | null;

/** Lo mínimo de Negocio para la cuenta: dos de volumen, ticket y clientes con su número. null si alcanza; si no, lo que falta. */
export function faltaEnElNegocio(v: Cifras | undefined): string | null {
  const con = (["volumen", "ticket", "clientes"] as const).filter((k) => numeroDe(v?.[k]) !== null);
  if (con.length >= 2) return null;
  if (con.includes("ticket")) return "falta el volumen o la cantidad de ventas";
  if (con.length === 1) return "falta el ticket promedio";
  return "faltan el ticket promedio y el volumen";
}

/** Lo mínimo del Embudo para la cuenta: los leads que llegan y la tasa de conversión. null si alcanza. */
export function faltaEnElEmbudo(v: Cifras | undefined): string | null {
  const leads = numeroDe(v?.leads) !== null;
  const conversion = tasaDe(v?.conversion) !== null;
  if (leads && conversion) return null;
  if (leads) return "falta la tasa de conversión";
  if (conversion) return "faltan los leads que llegan";
  return "faltan los leads y la tasa de conversión";
}

export function estadoDeLaTarjeta(clave: ClaveDeCasilla, valor: unknown, propuestas: number, perdida: PerdidaParaLaTarjeta = null): EstadoDeUnaTarjeta {
  const nuevo = propuestas > 0;
  if (esDeCifras(clave)) {
    const v = valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Cifras) : undefined;
    const llenos = Object.values(v ?? {}).filter((t) => typeof t === "string" && t.trim());
    if (!llenos.length) return { estado: propuestas > 0 ? "sugerida" : "falta", nuevo: false };
    const falta = clave === "negocio" ? faltaEnElNegocio(v) : faltaEnElEmbudo(v);
    return falta ? { estado: "aMedias", motivo: falta, nuevo } : { estado: "completa", nuevo };
  }
  const textos = textosDe(valor);
  if (clave === "consecuencias" && perdida === "validada") return { estado: "completa", nuevo };
  if (!textos.length) return { estado: propuestas > 0 || (clave === "consecuencias" && perdida === "porValidar") ? "sugerida" : "falta", nuevo: false };
  if (clave === "metas" && Array.isArray(valor) && !(valor as Meta[]).some(metaEnCifras)) {
    return { estado: "aMedias", motivo: "ninguna meta tiene cifra", nuevo };
  }
  if (clave === "autoridad" && Array.isArray(valor) && !(valor as Persona[]).some((p) => p?.rol === "firma")) {
    return { estado: "aMedias", motivo: "nadie aprueba todavía", nuevo };
  }
  if (!textos.some((t) => !diceQueNoSeSabe(t))) return { estado: "aMedias", motivo: "lo que dice es que no se sabe", nuevo };
  if (clave === "consecuencias" && !consecuenciaConCifra(valor)) {
    return { estado: "aMedias", motivo: "falta la cifra", nuevo: nuevo || perdida === "porValidar" };
  }
  return { estado: "completa", nuevo };
}

/** ¿Alguna consecuencia trae su cifra? («Pierden unos 10 negocios al mes»). Lo que dice que no se sabe no cuenta. */
export function consecuenciaConCifra(valor: unknown): boolean {
  return textosDe(valor).some((t) => traeCifra(t) && !diceQueNoSeSabe(t));
}
