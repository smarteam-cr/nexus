/**
 * lib/finanzas/tipo-cambio.ts — el tipo de cambio del dólar, día por día (2026-10-05). PURO: sin Prisma, sin red, sin
 * reloj.
 *
 * Pedido de Elías (2026-10-05): «no debería usar ₡500, sino el API del Banco Central o un lugar seguro en Costa Rica
 * para el tipo de cambio de cada día, e irlo guardando para todas las transacciones». Hasta acá había UN número por mes
 * (`TipoCambioMes`), cargado a mano o por script, y los doce de 2026 valían ₡500 (el del 5 de octubre era ₡462,08: un
 * 8 % de diferencia en todo lo que está en colones).
 *
 * ── QUÉ TASA ─────────────────────────────────────────────────────────────────────
 * La **venta de referencia del BCCR** (indicador 318). Es la que pide Hacienda para pasar a colones lo que está en
 * dólares, y Nexus la usa al revés con el mismo número. La de compra (317) se guarda para mostrarla, no se usa.
 *
 * ── DE DÓNDE ─────────────────────────────────────────────────────────────────────
 * Dos fuentes oficiales, las dos con el número del BCCR:
 *  · el servicio del BCCR (SDDE), que pide un token personal (`BCCR_TOKEN`) y trae cualquier rango;
 *  · el API del Ministerio de Hacienda, sin token: la tasa de hoy y, cuando responde, el histórico.
 * Las respuestas se leen acá (`leerSeriesBccr`, `leerHistoricoHacienda`, `leerHoyHacienda`); traerlas es de
 * tipo-cambio-server.ts.
 *
 * ── CÓMO SE USA ──────────────────────────────────────────────────────────────────
 * Un movimiento con fecha (un cobro, una factura, una quincena de planilla) se convierte con la tasa de SU día
 * (`tasaDelDia`); lo que es de un mes entero (una fila del Excel de egresos, un recurrente) con el promedio del mes
 * (`tasasDeMesDesdeDias`). Convertir sigue siendo de lib/finanzas/equilibrio.ts y de nadie más: acá solo se decide qué
 * tasa corresponde.
 */

export type FuenteDeTasa = "BCCR" | "HACIENDA";

export interface TasaDelDia {
  /** YYYY-MM-DD, día de Costa Rica. */
  fecha: string;
  /** Colones por dólar, venta de referencia del BCCR. La que se usa. */
  venta: number;
  /** Compra de referencia. Solo se muestra; puede faltar. */
  compra: number | null;
  fuente: FuenteDeTasa;
}

/** Desde cuándo se guarda el histórico: el primer año con cobros y facturas en Nexus. */
export const TIPO_CAMBIO_DESDE = "2023-01-01";

/**
 * Cuántos días hacia atrás se busca la tasa de un día que no tiene. El BCCR publica todos los días, pero un feriado o un
 * corte del servicio deja huecos; una semana alcanza para cruzarlos sin tomar la tasa de otro mes entero.
 */
export const DIAS_HACIA_ATRAS = 7;

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Una tasa creíble de colones por dólar. Afuera de esto, la respuesta vino rota (o en otra unidad) y no se guarda. */
export function tasaCreible(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 100 && n <= 2000;
}

/** «2024-12-01», «2024-12-01T00:00:00», «01/12/2024» → «2024-12-01». null si no es una fecha. */
export function fechaDeRespuesta(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (FECHA_RE.test(s.slice(0, 10))) return s.slice(0, 10);
  const dmy = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return null;
}

const numero = (v: unknown): number | null => {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  if (v && typeof v === "object" && "valor" in v) return numero((v as { valor: unknown }).valor);
  return null;
};

/**
 * La respuesta del servicio del BCCR para UN indicador: `{ estado, mensaje, datos: [{ series: [{ fecha,
 * valorDatoPorPeriodo }] }] }`. Devuelve fecha → valor, sin lo que no es una tasa creíble.
 * ⚠ `estado: false` o una forma desconocida LANZA: una lista vacía se leería como «no hubo tasas», que no es lo mismo.
 */
export function leerSeriesBccr(json: unknown): Map<string, number> {
  const r = json as { estado?: unknown; mensaje?: unknown; datos?: unknown };
  if (!r || typeof r !== "object") throw new Error("El BCCR respondió algo que no es JSON.");
  if (r.estado === false) throw new Error(`El BCCR rechazó la consulta: ${String(r.mensaje ?? "sin mensaje")}`);
  if (!Array.isArray(r.datos)) throw new Error("El BCCR respondió sin «datos».");
  const out = new Map<string, number>();
  for (const d of r.datos as Array<{ series?: unknown }>) {
    if (!Array.isArray(d?.series)) continue;
    for (const s of d.series as Array<{ fecha?: unknown; valorDatoPorPeriodo?: unknown }>) {
      const fecha = fechaDeRespuesta(s?.fecha);
      const valor = numero(s?.valorDatoPorPeriodo);
      if (fecha && tasaCreible(valor)) out.set(fecha, valor);
    }
  }
  return out;
}

/** Junta compra y venta del BCCR en tasas del día. Un día sin venta no entra: la venta es la que se usa. */
export function juntarBccr(venta: ReadonlyMap<string, number>, compra: ReadonlyMap<string, number>): TasaDelDia[] {
  return [...venta.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, v]) => ({ fecha, venta: v, compra: compra.get(fecha) ?? null, fuente: "BCCR" as const }));
}

/**
 * El histórico de Hacienda (`/indicadores/tc/dolar/historico?d=…&h=…`). Acepta la lista directa o dentro de `data`, y
 * compra y venta como número o como `{ valor }`. Lo que no se pudo leer se cuenta, para que una respuesta con otra forma
 * no pase por «no hubo tasas».
 */
export function leerHistoricoHacienda(json: unknown): { tasas: TasaDelDia[]; ilegibles: number } {
  const lista = Array.isArray(json) ? json : Array.isArray((json as { data?: unknown })?.data) ? (json as { data: unknown[] }).data : null;
  if (!lista) throw new Error("Hacienda respondió el histórico sin una lista de días.");
  const tasas: TasaDelDia[] = [];
  let ilegibles = 0;
  for (const f of lista as Array<Record<string, unknown>>) {
    const fecha = fechaDeRespuesta(f?.fecha);
    const venta = numero(f?.venta);
    const compra = numero(f?.compra);
    if (!fecha || !tasaCreible(venta)) {
      ilegibles++;
      continue;
    }
    tasas.push({ fecha, venta, compra: tasaCreible(compra) ? compra : null, fuente: "HACIENDA" });
  }
  return { tasas: tasas.sort((a, b) => a.fecha.localeCompare(b.fecha)), ilegibles };
}

/** La tasa de hoy de Hacienda (`/indicadores/tc/dolar`): `{ venta: { fecha, valor }, compra: { fecha, valor } }`. */
export function leerHoyHacienda(json: unknown): TasaDelDia {
  const r = json as { venta?: { fecha?: unknown; valor?: unknown }; compra?: { valor?: unknown } };
  const fecha = fechaDeRespuesta(r?.venta?.fecha);
  const venta = numero(r?.venta?.valor);
  const compra = numero(r?.compra?.valor);
  if (!fecha || !tasaCreible(venta)) throw new Error("Hacienda respondió la tasa de hoy con otra forma.");
  return { fecha, venta, compra: tasaCreible(compra) ? compra : null, fuente: "HACIENDA" };
}

// ── Qué tasa le toca a cada cosa ────────────────────────────────────────────────

/** Suma días a una fecha YYYY-MM-DD (en UTC, sin horas: no hay corrimiento por zona). */
export function sumarDias(fechaISO: string, dias: number): string {
  const d = new Date(`${fechaISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Los días de un mes «YYYY-MM», hasta `hastaISO` si el mes está en curso. */
export function diasDelMes(periodo: string, hastaISO?: string): string[] {
  const [a, m] = periodo.split("-").map(Number) as [number, number];
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const out: string[] = [];
  for (let d = 1; d <= ultimo; d++) {
    const f = `${periodo}-${String(d).padStart(2, "0")}`;
    if (hastaISO && f > hastaISO) break;
    out.push(f);
  }
  return out;
}

/**
 * La venta de un día; si ese día no tiene, la del día anterior más cercano, hasta `DIAS_HACIA_ATRAS`. null = no hay una
 * tasa cerca: el que pregunta usa el promedio del mes (y si tampoco hay, el monto no se suma y se dice).
 */
export function tasaDelDia(
  dias: ReadonlyMap<string, number>,
  fechaISO: string,
  maxDias = DIAS_HACIA_ATRAS,
): { fecha: string; venta: number } | null {
  for (let i = 0; i <= maxDias; i++) {
    const f = i === 0 ? fechaISO : sumarDias(fechaISO, -i);
    const v = dias.get(f);
    if (v !== undefined) return { fecha: f, venta: v };
  }
  return null;
}

export interface TasaMensualDerivada {
  periodo: string;
  crcPorUsd: number;
  /** Cuántos días del mes trajeron su propia tasa. */
  dias: number;
  /** Todos los días del mes (hasta hoy, si está en curso) tienen una tasa cerca. */
  completo: boolean;
  /** Mes que todavía no empezó: lleva la última tasa conocida, no un promedio. */
  porVenir: boolean;
  fuente: string;
}

const ROUND4 = (n: number) => Math.round(n * 10000) / 10000;
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const fechaCorta = (f: string) => `${Number(f.slice(8, 10))} de ${MESES[Number(f.slice(5, 7)) - 1]}`;

/**
 * La tasa de cada mes a partir de las de cada día: el promedio de la venta de los días del mes (hasta hoy, si está en
 * curso). Un mes por venir lleva la última tasa conocida: es plata de plan, y la mejor apuesta es la de hoy. Un mes sin
 * ningún día no sale: el que llama decide con qué lo cubre (la tasa cargada a mano de `TipoCambioMes`, o nada).
 */
export function tasasDeMesDesdeDias(
  dias: readonly Pick<TasaDelDia, "fecha" | "venta">[],
  periodos: readonly string[],
  hoyISO: string,
): Map<string, TasaMensualDerivada> {
  const porFecha = new Map(dias.map((d) => [d.fecha, d.venta]));
  const periodoHoy = hoyISO.slice(0, 7);
  const ultima = [...dias].filter((d) => d.fecha <= hoyISO).sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  const out = new Map<string, TasaMensualDerivada>();
  for (const p of periodos) {
    if (p > periodoHoy) {
      if (ultima) {
        out.set(p, {
          periodo: p,
          crcPorUsd: ultima.venta,
          dias: 0,
          completo: false,
          porVenir: true,
          fuente: `BCCR · venta del ${fechaCorta(ultima.fecha)}, la última conocida (mes por venir)`,
        });
      }
      continue;
    }
    const delMes = dias.filter((d) => d.fecha.startsWith(`${p}-`) && d.fecha <= hoyISO);
    if (delMes.length === 0) continue;
    const promedio = ROUND4(delMes.reduce((n, d) => n + d.venta, 0) / delMes.length);
    const completo = diasDelMes(p, p === periodoHoy ? hoyISO : undefined).every((f) => tasaDelDia(porFecha, f) !== null);
    out.set(p, {
      periodo: p,
      crcPorUsd: promedio,
      dias: delMes.length,
      completo,
      porVenir: false,
      fuente: `BCCR · promedio de la venta de ${delMes.length === 1 ? "1 día" : `${delMes.length} días`}${completo ? "" : " (faltan días)"}`,
    });
  }
  return out;
}

export interface ResumenDelMes {
  periodo: string;
  promedioVenta: number;
  promedioCompra: number | null;
  minimo: number;
  maximo: number;
  /** La venta del último día con tasa del mes. */
  alCierre: number;
  dias: number;
}

/** Para el histórico: cada mes con su promedio, mínimo, máximo y la tasa al cierre. Del más nuevo al más viejo. */
export function resumenPorMes(dias: readonly TasaDelDia[]): ResumenDelMes[] {
  const porMes = new Map<string, TasaDelDia[]>();
  for (const d of dias) {
    const p = d.fecha.slice(0, 7);
    if (!porMes.has(p)) porMes.set(p, []);
    porMes.get(p)!.push(d);
  }
  return [...porMes.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([periodo, ds]) => {
      const orden = [...ds].sort((a, b) => a.fecha.localeCompare(b.fecha));
      const compras = orden.filter((d) => d.compra !== null).map((d) => d.compra!);
      return {
        periodo,
        promedioVenta: ROUND4(orden.reduce((n, d) => n + d.venta, 0) / orden.length),
        promedioCompra: compras.length ? ROUND4(compras.reduce((n, c) => n + c, 0) / compras.length) : null,
        minimo: Math.min(...orden.map((d) => d.venta)),
        maximo: Math.max(...orden.map((d) => d.venta)),
        alCierre: orden[orden.length - 1]!.venta,
        dias: orden.length,
      };
    });
}

/** Los tramos [desde, hasta] de a lo sumo `maxDias` que cubren un rango: para pedir el histórico en partes. */
export function tramos(desdeISO: string, hastaISO: string, maxDias: number): Array<{ desde: string; hasta: string }> {
  const out: Array<{ desde: string; hasta: string }> = [];
  let d = desdeISO;
  while (d <= hastaISO) {
    const h = sumarDias(d, maxDias - 1);
    out.push({ desde: d, hasta: h < hastaISO ? h : hastaISO });
    d = sumarDias(h, 1);
  }
  return out;
}
