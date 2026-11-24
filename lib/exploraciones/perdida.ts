/**
 * lib/exploraciones/perdida.ts — CUÁNTO PIERDE EL CLIENTE por no llegar a su meta, con la cuenta a la vista (2026-11-20,
 * pedido de Ventas a Elías). PURO y client-safe.
 *
 * Vender por resultados es llegar a la propuesta con la meta del cliente y lo que le cuesta no llegar, en cifras. Con
 * Negocio (cómo gana dinero) y Embudo (cómo convierte) Nexus hace la cuenta y la PROPONE en «Qué pasa si no actúa»; quien
 * lleva la preventa la valida con el cliente («Validar con el cliente: pierden ~US$ X al mes», en la agenda de la
 * próxima sesión) y entonces queda guardada, con la cuenta que la explica (`contenido.perdida`).
 *
 * La brecha SIEMPRE sale de una meta del cliente (de cuánto a cuánto): Nexus no supone una mejora que nadie dijo (la regla
 * de «sin pista del cliente no hay nivel»). Cuatro formas, la primera meta que alcance:
 *   · conversión — la meta es una tasa («del 4 % al 7 %»): leads al mes × (tasa meta − tasa hoy) × ticket;
 *   · negocios — la meta es una cantidad de ventas («de 10 a 15 cierres al mes»): (meta − hoy) × ticket;
 *   · leads — la meta es una cantidad de leads: (meta − hoy) × conversión × ticket;
 *   · clientes (24 nov) — la meta BAJA cuántos clientes se van («de 10 a 4 al mes»): (hoy − meta) × ticket.
 * La cuenta guarda el equipo de su meta (`Meta.equipo`): en la escala va a la fila de ese equipo.
 * El ticket es el de Negocio o, si falta, el volumen entre las ventas del mismo período (dicho en la cuenta).
 *
 * ⛔ Nada de esto llega a la propuesta, al correo de seguimiento ni al handoff (Elías, 20 nov: «nada llega a la propuesta;
 * esa parte se rediseña después»). La excepción es la PÁGINA DEL RESULTADO (Elías: «el resumen debe tomar … la pérdida
 * validada y su cálculo»): la validada, solo por ./perdida-de-la-escala.ts, como el costo de la fila de Ventas.
 * En la propuesta, la sección de «costo de mala calidad» nace cuando se rediseñe. Por eso la pérdida no es una casilla: vive aparte (`contenido.perdida`) y
 * `para-la-propuesta.ts` no la lee (lo vigila negocio-y-embudo.test.ts).
 */
import type { Cifras, Meta } from "./casillas";

// ── Leer un número de un texto ────────────────────────────────────────────────

/**
 * El primer número de un texto, con su multiplicador: «US$ 2.500» → 2500, «1,5 millones» → 1500000, «120 mil» → 120000,
 * «US$1.5M» → 1500000, «2,500» → 2500, «4,5» → 4.5. Un separador seguido de exactamente tres cifras es de miles; si no,
 * es decimal. Con punto y coma a la vez, el último es el decimal. null si no hay número.
 */
export function numeroDe(texto: string | undefined | null): number | null {
  if (!texto) return null;
  const m = /(\d+(?:[.,]\d+)*)\s*(millones|mill[oó]n|mm\b|m\b|mil\b|k\b)?/i.exec(texto);
  if (!m) return null;
  let d = m[1];
  const puntos = (d.match(/\./g) ?? []).length;
  const comas = (d.match(/,/g) ?? []).length;
  if (puntos && comas) {
    const decimal = d.lastIndexOf(".") > d.lastIndexOf(",") ? "." : ",";
    const miles = decimal === "." ? "," : ".";
    d = d.split(miles).join("").replace(decimal, ".");
  } else if (puntos + comas > 0) {
    const sep = puntos ? "." : ",";
    const partes = d.split(sep);
    const deMiles = partes.length > 2 || partes[partes.length - 1].length === 3;
    d = deMiles ? partes.join("") : partes.join(".");
  }
  let n = Number(d);
  if (!Number.isFinite(n)) return null;
  const mult = (m[2] ?? "").toLowerCase();
  if (mult === "mil" || mult === "k") n *= 1_000;
  else if (mult) n *= 1_000_000;
  return n;
}

/** ¿El texto trae una cifra? Un número escrito con dígitos (o «mil», «millón»). */
export function traeCifra(texto: string | undefined | null): boolean {
  return !!texto && (/\d/.test(texto) || /\b(mil|mill[oó]n|millones)\b/i.test(texto));
}

/** Una tasa: «8 %» → 0.08, «8 por ciento» → 0.08, «4 de cada 10» → 0.4. null si el texto no dice una tasa. */
export function tasaDe(texto: string | undefined | null): number | null {
  if (!texto) return null;
  const pct = /(\d+(?:[.,]\d+)?)\s*(%|por\s*ciento)/i.exec(texto);
  if (pct) {
    const n = Number(pct[1].replace(",", "."));
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n / 100 : null;
  }
  const deCada = /(\d+(?:[.,]\d+)?)\s*de\s*cada\s*(\d+)/i.exec(texto);
  if (deCada) {
    const a = Number(deCada[1].replace(",", "."));
    const b = Number(deCada[2]);
    return b > 0 && a >= 0 && a <= b ? a / b : null;
  }
  return null;
}

/** Cuántas veces cabe el período del texto en un mes: «al año» → 1/12, «a la semana» → 52/12. null si no dice período. */
export function porMesDe(texto: string | undefined | null): number | null {
  if (!texto) return null;
  const t = texto.toLowerCase();
  if (/\b(al|por|cada|x|en el|en un)\s*a[nñ]o\b|\banual(es|mente)?\b|\/\s*a[nñ]o/.test(t)) return 1 / 12;
  if (/\b(al|por|cada|x)\s*semestre\b|\bsemestral(es)?\b/.test(t)) return 1 / 6;
  if (/\b(al|por|cada|x)\s*trimestre\b|\btrimestral(es)?\b/.test(t)) return 1 / 3;
  if (/\b(a la|por|cada|x)\s*semana\b|\bsemanal(es|mente)?\b/.test(t)) return 52 / 12;
  if (/\b(al|por|cada|x)\s*d[ií]a\b|\bdiari[oa]s?\b/.test(t)) return 30;
  if (/\b(al|por|cada|x|en el|en un)\s*mes\b|\bmensual(es|mente)?\b|\/\s*mes/.test(t)) return 1;
  return null;
}

/**
 * El período de la PRIMERA cifra del texto: «200 al mes (unos 2.400 al año)» es al mes. Se mira lo que sigue al número
 * hasta el próximo número; si ahí no dice y el texto tiene un solo número, lo que diga el texto entero.
 */
export function porMesDelPrimero(texto: string | undefined | null): number | null {
  if (!texto) return null;
  const m = /\d+(?:[.,]\d+)*\s*(?:millones|mill[oó]n|mm\b|m\b|mil\b|k\b)?/i.exec(texto);
  if (!m) return porMesDe(texto);
  const despues = texto.slice(m.index + m[0].length).split(/\d/)[0];
  const delPrimero = porMesDe(despues);
  if (delPrimero !== null) return delPrimero;
  return (texto.match(/\d+(?:[.,]\d+)*/g) ?? []).length <= 1 ? porMesDe(texto) : null;
}

/** La moneda que dice el texto, como se escribe adelante del número. null si no dice. */
export function monedaDe(texto: string | undefined | null): string | null {
  if (!texto) return null;
  if (/us\s?\$|\busd\b|d[oó]lar/i.test(texto)) return "US$";
  if (/₡|\bcolones\b|\bcrc\b/i.test(texto)) return "₡";
  if (/€|\beuros?\b|\beur\b/i.test(texto)) return "€";
  if (/\bquetzal(es)?\b|\bgtq\b|\bQ\s?\d/.test(texto)) return "Q";
  if (/\$/.test(texto)) return "$";
  return null;
}

// ── Escribir un número ────────────────────────────────────────────────────────

/** 15000 → «15.000»; 4.5 → «4,5». Con punto de miles y coma decimal. */
export function formatearNumero(n: number, decimales = 0): string {
  const fijo = Math.abs(n).toFixed(decimales);
  const [ent, dec] = fijo.split(".");
  const conMiles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${n < 0 ? "−" : ""}${conMiles}${dec && Number(dec) !== 0 ? `,${dec.replace(/0+$/, "")}` : ""}`;
}

/** Un monto redondeado a tres cifras significativas, con su moneda: «US$ 15.000». */
export function formatearMonto(n: number, moneda: string | null): string {
  return `${moneda ? `${moneda} ` : ""}${formatearNumero(redondearMonto(n))}`;
}

/** Tres cifras significativas desde mil (15.432 → 15.400); debajo, al entero. */
export function redondearMonto(n: number): number {
  const magnitud = n >= 1000 ? Math.pow(10, Math.floor(Math.log10(n)) - 2) : 1;
  return Math.round(n / magnitud) * magnitud;
}

const pct = (t: number) => `${formatearNumero(t * 100, 1)} %`;
/** Lo que se muestra en la cuenta, con un decimal: el monto se calcula con ESTOS valores, así la cuenta cuadra. */
const r1 = (n: number) => Math.round(n * 10) / 10;
const r3 = (t: number) => Math.round(t * 1000) / 1000;

// ── La cuenta ─────────────────────────────────────────────────────────────────

/** `clientes` (24 nov): la meta baja cuántos clientes se van al mes; lo que se pierde es esa brecha × el ticket. */
export type BaseDeLaPerdida = "conversion" | "negocios" | "leads" | "clientes";

export interface CalculoDeLaPerdida {
  /** Lo que pierden en un mes. */
  montoAlMes: number;
  moneda: string | null;
  base: BaseDeLaPerdida;
  /** La cuenta, a la vista: «200 leads al mes × (7 % − 4 %) de conversión × US$ 2.500 de ticket = US$ 15.000 al mes». */
  cuenta: string;
  /** La frase para «Qué pasa si no actúa»: «Pierden ~US$ 15.000 al mes por no llegar a «…»». */
  texto: string;
  /** De qué meta sale la brecha (su «que»). */
  meta: string;
  /** Las cifras de las que sale: si cambian, la cuenta es otra. */
  huella: string;
  /** El equipo de la meta de la que sale (24 nov, `Meta.equipo`): a la fila de ese equipo va en la escala. */
  equipo?: Meta["equipo"];
}

/** Lo que el cálculo lee de lo confirmado. */
export interface CasillasParaLaPerdida {
  negocio?: Cifras;
  embudo?: Cifras;
  metas?: readonly Meta[];
}

interface Ticket {
  valor: number;
  moneda: string | null;
  /** Cómo se dice en la cuenta. */
  dicho: string;
}

/** El ticket de Negocio o, si falta, el volumen entre las ventas del mismo período (solo si las ventas dicen período). */
function ticketDe(n: Cifras | undefined): Ticket | null {
  const t = numeroDe(n?.ticket);
  if (t && t > 0) {
    const moneda = monedaDe(n?.ticket) ?? monedaDe(n?.volumen);
    return { valor: t, moneda, dicho: `${moneda ? `${moneda} ` : ""}${formatearNumero(t)} de ticket` };
  }
  const vol = numeroDe(n?.volumen);
  const ventas = numeroDe(n?.clientes);
  const pVol = porMesDelPrimero(n?.volumen) ?? 1;
  const pVentas = porMesDelPrimero(n?.clientes);
  if (!vol || !ventas || pVentas === null) return null;
  // Redondeado como se muestra: la cuenta usa el mismo número que dice.
  const valor = redondearMonto((vol * pVol) / (ventas * pVentas));
  const moneda = monedaDe(n?.volumen);
  return {
    valor,
    moneda,
    dicho: `${formatearMonto(valor, moneda)} de ticket (el volumen entre las ventas)`,
  };
}

const DE_NEGOCIOS = /negocio|venta|cierre|cierra|cliente|contrato|pedido|compra|deal/i;
const DE_LEADS = /lead|prospecto|interesad|contacto|solicitud|cotizaci/i;
/** Una meta en tasa solo es de conversión si habla de vender: «subir la retención del 60 % al 80 %» no lo es. */
const DE_CONVERSION = /conver|cierr|cierra|venta|vend|compr|lead|oportunidad|cotizaci|prospect|interesad|negocio/i;
/** Una meta de perder menos clientes («que se vayan menos clientes», «bajar las cancelaciones»): baja una cantidad. */
const SE_VAN = /se (van|vayan|pierden|pierdan)|perd(er|emos|imos)|pierden|cancela|churn|abandon|fuga|deserci/i;
/** Y tiene que hablar de clientes: «perder menos horas, de 10 a 4» no es una pérdida de clientes. */
const DE_CLIENTES = /client|cuentas|suscript|abonad|socios|pacientes|alumnos/i;
const DE_CLIENTES_QUE_SE_VAN = { test: (t: string) => SE_VAN.test(t) && DE_CLIENTES.test(t) };
/** Una cantidad que se cuenta en negocios o leads, dicha como tal («15 cierres», «300 leads»). */
const CANTIDAD_CONTADA = /\d[\d.,]*\s*(negocios?|cierres?|ventas?|clientes?|contratos?|pedidos?|deals?|leads?|prospectos?|interesados?|cotizaciones?|oportunidades?)\b/i;
/** ¿La meta parece de plata aunque no diga la moneda? «de 100 mil a 150 mil al mes» no son 50.000 negocios más. */
function pareceMonto(m: Meta): boolean {
  const cifras = `${m.actual ?? ""} ${m.objetivo ?? ""}`;
  if (CANTIDAD_CONTADA.test(cifras)) return false;
  if (/factur|ingres|monto|utilidad|ganancia|margen/i.test(m.que)) return true;
  return /\b(mil|mill[oó]n|millones|k)\b/i.test(cifras) || (numeroDe(m.objetivo) ?? 0) >= 1000;
}

/** El hash corto de un texto (el de las marcas de la agenda): estable entre corridas. */
function hash(t: string): string {
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * La pérdida que sale de lo confirmado, o null si no alcanza: falta el ticket (o el volumen con las ventas), falta lo del
 * embudo que pide la forma, o ninguna meta dice de cuánto a cuánto en una cosa que se pueda contar.
 */
export function calcularLaPerdida(c: CasillasParaLaPerdida): CalculoDeLaPerdida | null {
  const ticket = ticketDe(c.negocio);
  if (!ticket) return null;
  const leads = numeroDe(c.embudo?.leads);
  const leadsAlMes = leads !== null ? r1(leads * (porMesDelPrimero(c.embudo?.leads) ?? 1)) : null;
  const conversionHoy = tasaDe(c.embudo?.conversion);
  const huellaDe = (m: Meta) =>
    hash(JSON.stringify([c.negocio?.ticket ?? "", c.negocio?.volumen ?? "", c.negocio?.clientes ?? "", c.embudo?.leads ?? "", c.embudo?.conversion ?? "", m.que, m.actual ?? "", m.objetivo ?? ""]));
  const cierre = (monto: number, cuenta: string, base: BaseDeLaPerdida, m: Meta): CalculoDeLaPerdida => {
    const dicho = formatearMonto(monto, ticket.moneda);
    return {
      montoAlMes: monto,
      moneda: ticket.moneda,
      base,
      cuenta: `${cuenta} = ${dicho} al mes`,
      texto: `Pierden ~${dicho} al mes por no llegar a «${m.que.trim()}»`,
      meta: m.que.trim(),
      huella: huellaDe(m),
      ...(m.equipo ? { equipo: m.equipo } : {}),
    };
  };

  /* Dos vueltas (revisión del 24 nov): primero las tres formas de siempre en todas las metas, y solo si ninguna alcanza,
     la de clientes que se van. Así una cuenta que ya existía (y quizás se validó) no cambia de meta por la forma nueva. */
  for (const vuelta of ["siempre", "clientes"] as const)
  for (const m of c.metas ?? []) {
    const texto = `${m.que} ${m.objetivo ?? ""} ${m.actual ?? ""}`;
    // Una meta en plata no es una brecha del embudo: no se cuenta acá.
    if (monedaDe(m.objetivo) || monedaDe(m.actual)) continue;

    // 1. Conversión: la meta es una tasa.
    const metaLeida = tasaDe(m.objetivo);
    if (metaLeida !== null) {
      if (!DE_CONVERSION.test(m.que)) continue;
      const meta = r3(metaLeida);
      const hoyLeida = tasaDe(m.actual) ?? conversionHoy;
      if (hoyLeida === null || meta <= hoyLeida || leadsAlMes === null || leadsAlMes <= 0) continue;
      const hoy = r3(hoyLeida);
      const monto = leadsAlMes * (meta - hoy) * ticket.valor;
      return cierre(monto, `${formatearNumero(leadsAlMes, 1)} leads al mes × (${pct(meta)} − ${pct(hoy)}) de conversión × ${ticket.dicho}`, "conversion", m);
    }

    const objetivo = numeroDe(m.objetivo);
    const actual = numeroDe(m.actual);
    // 4. Clientes que se van (24 nov): la meta BAJA cuántos se pierden («de 10 a 4 al mes»): (hoy − meta) × ticket.
    if (vuelta === "clientes") {
      if (objetivo === null || actual === null || objetivo >= actual || !DE_CLIENTES_QUE_SE_VAN.test(m.que) || pareceMonto(m)) continue;
      const porMes = porMesDelPrimero(m.actual) ?? porMesDelPrimero(m.objetivo) ?? porMesDe(m.que) ?? 1;
      const hoy = r1(actual * porMes);
      const meta = r1(objetivo * porMes);
      return cierre((hoy - meta) * ticket.valor, `(${formatearNumero(hoy, 1)} − ${formatearNumero(meta, 1)}) clientes que se van al mes × ${ticket.dicho}`, "clientes", m);
    }
    if (objetivo === null || actual === null || objetivo <= actual || pareceMonto(m)) continue;
    const porMes = porMesDelPrimero(m.objetivo) ?? porMesDelPrimero(m.actual) ?? porMesDe(m.que) ?? 1;
    const metaAlMes = r1(objetivo * porMes);
    const hoyAlMes = r1(actual * porMes);
    const brecha = metaAlMes - hoyAlMes;

    // 2. Leads: la meta cuenta leads (va antes que negocios: «cotizaciones» o «interesados» no son ventas).
    if (DE_LEADS.test(texto)) {
      if (conversionHoy === null || conversionHoy <= 0) continue;
      const conversion = r3(conversionHoy);
      const monto = brecha * conversion * ticket.valor;
      return cierre(monto, `(${formatearNumero(metaAlMes, 1)} − ${formatearNumero(hoyAlMes, 1)}) leads al mes × ${pct(conversion)} de conversión × ${ticket.dicho}`, "leads", m);
    }

    // 3. Negocios: la meta cuenta ventas.
    if (DE_NEGOCIOS.test(texto)) {
      const monto = brecha * ticket.valor;
      return cierre(monto, `(${formatearNumero(metaAlMes, 1)} − ${formatearNumero(hoyAlMes, 1)}) negocios al mes × ${ticket.dicho}`, "negocios", m);
    }
  }
  return null;
}

/** Lo que falta para poder hacer la cuenta, en palabras, o null si ya alcanza (o si no hay ni por dónde empezar). */
export function loQueFaltaParaLaCuenta(c: CasillasParaLaPerdida): string | null {
  if (calcularLaPerdida(c)) return null;
  if (!ticketDe(c.negocio)) return "el ticket promedio (o el volumen de ventas con cuántas ventas cierran)";
  const conMeta = (c.metas ?? []).some((m) => tasaDe(m.objetivo) !== null || numeroDe(m.objetivo) !== null);
  if (!conMeta) return "una meta de cuánto a cuánto: la conversión, los negocios o los leads a los que quieren llegar";
  if (numeroDe(c.embudo?.leads) === null) return "cuántos leads les llegan";
  if (tasaDe(c.embudo?.conversion) === null) return "la tasa de conversión de hoy";
  return null;
}

// ── La pérdida validada (lo que se guarda) ───────────────────────────────────

/** La pérdida que quien lleva la preventa validó con el cliente, con la cuenta que la explica. A la propuesta no llega; a la escala, por perdida-de-la-escala.ts. */
export interface PerdidaValidada {
  montoAlMes: number;
  moneda: string | null;
  base: BaseDeLaPerdida;
  cuenta: string;
  texto: string;
  meta: string;
  huella: string;
  /** ISO. */
  validadaEn: string;
  /** El correo de quien la validó. */
  por: string | null;
}

export const MAX_TEXTO_DE_LA_PERDIDA = 600;

/** Qué mostrar en «Qué pasa si no actúa»: la validada, la cuenta nueva por validar, o las dos si las cifras cambiaron. */
export function perdidaDeLaExploracion(
  casillas: CasillasParaLaPerdida,
  guardada: PerdidaValidada | undefined | null,
): { validada: PerdidaValidada | null; porValidar: CalculoDeLaPerdida | null } {
  const calculo = calcularLaPerdida(casillas);
  const validada = guardada ?? null;
  return { validada, porValidar: calculo && (!validada || validada.huella !== calculo.huella) ? calculo : null };
}

/** La cosa por averiguar de la agenda: «Validar con el cliente: pierden ~US$ 15.000 al mes». */
export function validarConElCliente(calculo: Pick<CalculoDeLaPerdida, "montoAlMes" | "moneda">): string {
  return `Validar con el cliente: pierden ~${formatearMonto(calculo.montoAlMes, calculo.moneda)} al mes`;
}
