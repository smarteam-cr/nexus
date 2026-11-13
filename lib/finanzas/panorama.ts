/**
 * lib/finanzas/panorama.ts — lo que el panorama del dinero (el punto de equilibrio) arma encima del reporte anual
 * (2026-11-13, pedidos de Finanzas 2, 3, 5 y 27). PURO: sin Prisma, sin red, sin reloj (`hoyISO` entra por parámetro).
 *
 * ── LAS CUATRO PIEZAS ─────────────────────────────────────────────────────────
 *  · `gastoDelMes`: el gasto de un mes con su firmeza. Real si quien supervisa cerró el mes (CierreMes); registrado si
 *    el mes ya pasó y nadie lo cerró; PROYECTADO desde el día 1 si el mes está en curso o por venir: con lo fijo que ya
 *    se conoce (el piso de hoy, rubro por rubro) o lo ya anotado si es más. Así a inicio de mes el gasto no parece bajo
 *    solo porque falta la segunda quincena.
 *  · `pisoConColchon`: el mínimo exacto y el mínimo con colchón. El colchón lo elige quien mira (10 % a 15 % es el
 *    rango acordado; arranca en 15 %).
 *  · `mesesDelRango` / `rangoDePreset`: el filtro de fechas de los gráficos (antes solo se filtraba por año).
 *  · `lecturaDeLasTandas`: la facturación sale en dos tandas; a inicio de mes lo facturado se ve bajo y no lo es.
 *
 * No calcula plata nueva: reparte lo que `calcularEquilibrio` ya midió. La única cuenta propia es el máximo por rubro
 * del gasto proyectado, y vive acá para que el gráfico y la tabla no la escriban dos veces.
 */
import { RUBROS, type FilaMes, type PisoVigente, type RubroEgreso } from "./equilibrio";
import { ROLES_DE_CUSTOMER_SUCCESS } from "./modelo-comisiones/quien-ve";

const round2 = (n: number) => Math.round(n * 100) / 100;

// ── El colchón del piso ─────────────────────────────────────────────────────────

/** El colchón con que arranca la pantalla. Decisión de Finanzas (2026-11-13): el rango acordado es 10 % a 15 %. */
export const COLCHON_POR_DEFECTO = 15;
export const RANGO_COLCHON_ACORDADO = { desde: 10, hasta: 15 } as const;
/** Lo que se deja escribir. Más que esto ya no es un colchón: es otra meta. */
export const COLCHON_MAXIMO = 50;

/** Un colchón válido: entero entre 0 y `COLCHON_MAXIMO`. Lo que no se puede leer vuelve al de por defecto. */
export function normalizarColchon(x: unknown): number {
  // Un texto vacío no es «0 %»: `Number("")` da 0 y el colchón se iría a cero sin que nadie lo pidiera.
  const n = typeof x === "string" ? (x.trim() === "" ? NaN : Number(x.replace(",", ".").trim())) : typeof x === "number" ? x : NaN;
  if (!Number.isFinite(n)) return COLCHON_POR_DEFECTO;
  return Math.min(COLCHON_MAXIMO, Math.max(0, Math.round(n)));
}

/** El mínimo con colchón: el piso × (1 + colchón %). */
export function pisoConColchon(piso: number, colchonPct: number): number {
  return round2(piso * (1 + normalizarColchon(colchonPct) / 100));
}

/** ¿El colchón elegido está fuera del rango acordado? Se avisa, no se impide. */
export function fueraDelRangoAcordado(colchonPct: number): boolean {
  const c = normalizarColchon(colchonPct);
  return c < RANGO_COLCHON_ACORDADO.desde || c > RANGO_COLCHON_ACORDADO.hasta;
}

// ── El gasto del mes, con su firmeza ────────────────────────────────────────────

/**
 * Qué tan firme es el gasto de un mes.
 *  - REAL        quien supervisa cerró el mes: es el gasto que dio por bueno.
 *  - REGISTRADO  el mes ya pasó y nadie lo cerró: es lo anotado, todavía sin confirmar.
 *  - PROYECTADO  el mes está en curso o por venir: lo fijo que ya se conoce, o lo anotado si es más.
 */
export type FirmezaDelGasto = "REAL" | "REGISTRADO" | "PROYECTADO";

export interface GastoDelMes {
  periodo: string;
  monto: number;
  firmeza: FirmezaDelGasto;
  /** Lo anotado hasta hoy (el gasto del reporte). En un mes REAL o REGISTRADO es igual a `monto`. */
  anotado: number;
  /** Solo REAL: quién cerró el mes y el día (YYYY-MM-DD). */
  confirmadoPor: string | null;
  confirmadoEn: string | null;
  /** Solo REAL: el mes cambió después de cerrarlo (un gasto, una factura o una quincena). */
  cambioDespuesDelCierre: boolean;
}

/** Lo que hace falta del cierre de un mes. `cerradoPor` puede venir ya con el nombre de pila. */
export interface CierreParaElGasto {
  periodo: string;
  cerradoEn: string;
  cerradoPor?: string | null;
  cambio: boolean | null;
}

/**
 * El gasto de un mes con su firmeza.
 *
 * ⚠ El proyectado es un MÁXIMO POR RUBRO, no la suma del piso y lo anotado: el 1 de noviembre la planilla anotada es
 * cero y el piso dice ~33.400, el 15 ya hay una quincena (~16.700) y el piso sigue mandando; cuando se anota algo que
 * el piso no tiene (un gasto financiero, una licencia) o una planilla más cara, manda lo anotado. Sumar los dos
 * contaría la planilla dos veces.
 *
 * Sin piso de hoy (un reporte sin costos vigentes), un mes en curso no se puede proyectar: queda REGISTRADO.
 */
export function gastoDelMes(
  m: Pick<FilaMes, "periodo" | "egresos" | "egresosPorRubro">,
  opciones: { hoyISO: string; piso: Pick<PisoVigente, "porRubro"> | null; cierre?: CierreParaElGasto | null },
): GastoDelMes {
  const actual = opciones.hoyISO.slice(0, 7);
  const base = { periodo: m.periodo, anotado: m.egresos, confirmadoPor: null, confirmadoEn: null, cambioDespuesDelCierre: false };
  const c = opciones.cierre;
  if (c) {
    return {
      ...base,
      monto: m.egresos,
      firmeza: "REAL",
      confirmadoPor: c.cerradoPor ?? null,
      confirmadoEn: c.cerradoEn || null,
      cambioDespuesDelCierre: c.cambio === true,
    };
  }
  if (m.periodo < actual || !opciones.piso) return { ...base, monto: m.egresos, firmeza: "REGISTRADO" };
  const piso = opciones.piso.porRubro;
  const monto = round2(RUBROS.reduce((n, r: RubroEgreso) => n + Math.max(m.egresosPorRubro[r] ?? 0, piso[r] ?? 0), 0));
  return { ...base, monto, firmeza: "PROYECTADO" };
}

/** El gasto de cada mes del reporte, en el mismo orden. */
export function gastosDelAnio(
  meses: ReadonlyArray<Pick<FilaMes, "periodo" | "egresos" | "egresosPorRubro">>,
  opciones: { hoyISO: string; piso: Pick<PisoVigente, "porRubro"> | null; cierres: readonly CierreParaElGasto[] },
): GastoDelMes[] {
  const cierrePorMes = new Map(opciones.cierres.map((c) => [c.periodo, c]));
  return meses.map((m) => gastoDelMes(m, { hoyISO: opciones.hoyISO, piso: opciones.piso, cierre: cierrePorMes.get(m.periodo) ?? null }));
}

// ── El filtro de fechas de los gráficos ─────────────────────────────────────────

export type PresetDeRango = "anio" | "loQueVa" | "seis" | "tres";

export const PRESETS_DE_RANGO: ReadonlyArray<{ clave: PresetDeRango; etiqueta: string }> = [
  { clave: "anio", etiqueta: "Todo el año" },
  { clave: "loQueVa", etiqueta: "Lo que va del año" },
  { clave: "seis", etiqueta: "Últimos 6 meses" },
  { clave: "tres", etiqueta: "Últimos 3 meses" },
];

export interface RangoDeMeses {
  desde: string; // YYYY-MM
  hasta: string; // YYYY-MM
}

const periodo = (anio: number, mes: number) => `${anio}-${String(mes).padStart(2, "0")}`;

/**
 * El rango de un preset dentro del año del reporte. «Lo que va del año» y los «últimos N» terminan en el mes en curso;
 * en un año que ya terminó, en diciembre, y en uno que todavía no empezó, en enero.
 */
export function rangoDePreset(preset: PresetDeRango, anio: number, hoyISO: string): RangoDeMeses {
  const anioHoy = Number(hoyISO.slice(0, 4));
  const ultimo = anio < anioHoy ? 12 : anio > anioHoy ? 1 : Number(hoyISO.slice(5, 7));
  const n = preset === "seis" ? 6 : preset === "tres" ? 3 : null;
  if (preset === "anio") return { desde: periodo(anio, 1), hasta: periodo(anio, 12) };
  if (n === null) return { desde: periodo(anio, 1), hasta: periodo(anio, ultimo) };
  return { desde: periodo(anio, Math.max(1, ultimo - n + 1)), hasta: periodo(anio, ultimo) };
}

/** Un rango que se pueda usar: desde ≤ hasta, los dos dentro del año. Uno al revés se da vuelta. */
export function rangoValido(r: RangoDeMeses, anio: number): RangoDeMeses {
  const enAnio = (p: string, defecto: string) => (/^\d{4}-(0[1-9]|1[0-2])$/.test(p) && p.startsWith(`${anio}-`) ? p : defecto);
  const a = enAnio(r.desde, periodo(anio, 1));
  const b = enAnio(r.hasta, periodo(anio, 12));
  return a <= b ? { desde: a, hasta: b } : { desde: b, hasta: a };
}

/** Los meses que caen en el rango (con sus índices originales, para leer cosas paralelas al año). */
export function mesesDelRango<T extends { periodo: string }>(meses: readonly T[], r: RangoDeMeses): Array<{ m: T; i: number }> {
  return meses.map((m, i) => ({ m, i })).filter(({ m }) => m.periodo >= r.desde && m.periodo <= r.hasta);
}

// ── Las dos tandas de la facturación ────────────────────────────────────────────

/**
 * Cómo leer lo facturado del mes en curso. La facturación sale en dos tandas (Finanzas, 2026-11-13): primero la
 * internacional y la de Mercury, a inicio de mes; después kölbi y la segunda quincena. A inicio de mes lo facturado se
 * ve bajo y no es que se facturó poco: falta la segunda tanda, que está en lo programado sin factura del mes.
 *
 * null = el mes no está en curso (uno que ya pasó tiene sus dos tandas; uno por venir, ninguna).
 */
export function lecturaDeLasTandas(
  m: Pick<FilaMes, "periodo" | "facturado" | "pendienteFacturar">,
  hoyISO: string,
): { facturadoHastaHoy: number; faltaFacturar: number; segundaTandaPendiente: boolean } | null {
  if (m.periodo !== hoyISO.slice(0, 7)) return null;
  return {
    facturadoHastaHoy: m.facturado,
    faltaFacturar: m.pendienteFacturar,
    segundaTandaPendiente: m.pendienteFacturar > 0,
  };
}

// ── Quién vendió ────────────────────────────────────────────────────────────────

/**
 * El área de quien vendió, por el rol de su dueño en HubSpot (resuelto a una persona de Nexus). La misma regla que el
 * modelo de comisiones: un negocio cuyo dueño es CSE o CSL es de Customer Success. Sin dueño en Nexus (o sin dueño), se
 * dice así en vez de adivinar.
 */
export function areaDeQuienVendio(rol: string | null | undefined): string {
  if (!rol) return "Sin dueño en Nexus";
  if ((ROLES_DE_CUSTOMER_SUCCESS as readonly string[]).includes(rol)) return "Customer Success";
  if (rol === "VENTAS") return "Ventas";
  return "Dirección y otros";
}

/**
 * La firmeza del gasto en palabras, para la lectura de un mes, la tabla y «Contra el gasto». Los formatos entran por
 * parámetro: este archivo no sabe de monedas ni de cómo se escribe una fecha en pantalla.
 */
export function textoDeFirmeza(g: GastoDelMes, usd: (n: number) => string, fecha: (iso: string) => string): string {
  if (g.firmeza === "REAL") {
    const quien = g.confirmadoPor ? ` por ${g.confirmadoPor}` : "";
    const cuando = g.confirmadoEn ? ` el ${fecha(g.confirmadoEn)}` : "";
    return `Real: confirmado${quien} al cerrar el mes${cuando}.${g.cambioDespuesDelCierre ? " Cambió después del cierre." : ""}`;
  }
  if (g.firmeza === "REGISTRADO") return "Registrado: el mes todavía no se cerró.";
  return `Proyectado con lo fijo que ya se conoce. Anotado hasta hoy: ${usd(g.anotado)}.`;
}
