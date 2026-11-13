/**
 * lib/finanzas/reglas-de-gasto.ts — las dos reglas de gasto, el presupuesto de las suscripciones y las facturas que
 * faltan (2026-11-13, DECISIONS «Gastos fijos y variables, las reglas de gasto y el tipo de cambio de la planilla»).
 *
 * ── LAS REGLAS (acordadas con Elías) ────────────────────────────────────────────
 *   · Gastos de REPRESENTACIÓN: solo combustible, alimentación y equipo, y con aviso previo.
 *   · TARJETA CORPORATIVA: solo suscripciones y software, y cada suscripción con un presupuesto estimado. Una suscripción
 *     se repite: su lugar es un FIJO (`CostoRecurrente`), que es el que lleva el presupuesto. Una anotada como gasto
 *     puntual se marca para que alguien la pase a fijo.
 *   · Todo gasto con su factura. La recopila quien registra (hoy María José Zamora): ve lo que le falta.
 *
 * ── LO QUE NO HACE, A PROPÓSITO ─────────────────────────────────────────────────
 *   · No frena nada: marca. Un gasto fuera de la regla se guarda igual; lo que cambia es que se ve.
 *   · No mira hacia atrás: las reglas valen para los gastos desde `REGLAS_DE_GASTO_DESDE` (se acordaron en noviembre de
 *     2026; lo de antes se pagó con otras reglas). La factura se pide desde que los gastos se anotan en Nexus
 *     (`EGRESOS_DESDE_NEXUS`), y solo de un gasto que ya pasó: una compra planificada todavía no tiene factura.
 *   · No es un aviso de vencimiento: un costo sigue sin vencer (DECISIONS §Cobranza, «sin alertas de costos»). Esto
 *     compara un gasto contra una regla o un presupuesto escritos por una persona; no entra por `AlertaCobro`.
 *
 * PURO: sin Prisma ni reloj.
 */
import { textoDeMontos } from "@/lib/cobranza/odoo/diferencias";
import { GASTO_RUBROS, GASTO_TIPOS } from "./clases-de-gasto";
import { EGRESOS_DESDE_NEXUS } from "./gastos";

export const TIPOS_DE_GASTO = GASTO_TIPOS;
export type TipoDeGasto = (typeof TIPOS_DE_GASTO)[number];

export const RUBROS_DE_GASTO = GASTO_RUBROS;
export type RubroDeGasto = (typeof RUBROS_DE_GASTO)[number];

export const ETIQUETA_TIPO: Record<TipoDeGasto, string> = {
  REPRESENTACION: "De representación",
  TARJETA_CORPORATIVA: "Tarjeta corporativa",
  OTRO: "Otro",
};

export const ETIQUETA_RUBRO: Record<RubroDeGasto, string> = {
  COMBUSTIBLE: "Combustible",
  ALIMENTACION: "Alimentación",
  EQUIPO: "Equipo",
  SUSCRIPCION: "Suscripción",
  SOFTWARE: "Software",
  OTRO: "Otro",
};

/** Lo que acepta cada tipo con regla. «Otro» no tiene regla de rubro. */
export const RUBROS_PERMITIDOS: Record<Exclude<TipoDeGasto, "OTRO">, readonly RubroDeGasto[]> = {
  REPRESENTACION: ["COMBUSTIBLE", "ALIMENTACION", "EQUIPO"],
  TARJETA_CORPORATIVA: ["SUSCRIPCION", "SOFTWARE"],
};

/** Desde qué día valen las dos reglas (se acordaron en noviembre de 2026). */
export const REGLAS_DE_GASTO_DESDE = "2026-11-01";
/** Desde qué día se pide la factura: desde que los gastos se anotan en Nexus. */
export const FACTURAS_DESDE = `${EGRESOS_DESDE_NEXUS}-01`;

export function esTipoDeGasto(v: unknown): v is TipoDeGasto {
  return typeof v === "string" && (TIPOS_DE_GASTO as readonly string[]).includes(v);
}
export function esRubroDeGasto(v: unknown): v is RubroDeGasto {
  return typeof v === "string" && (RUBROS_DE_GASTO as readonly string[]).includes(v);
}
/** El tipo de un gasto como viene de la base: sin clasificar (o algo desconocido) es «otro». */
export const tipoDe = (v: unknown): TipoDeGasto => (esTipoDeGasto(v) ? v : "OTRO");
/** El rubro de un gasto como viene de la base: null si no tiene. */
export const rubroDe = (v: unknown): RubroDeGasto | null => (esRubroDeGasto(v) ? v : null);

export type ClaveDeAviso =
  | "SIN_RUBRO"
  | "FUERA_DE_REGLA"
  | "SIN_AVISO_PREVIO"
  | "SUSCRIPCION_SUELTA"
  | "SIN_FACTURA"
  | "SIN_PRESUPUESTO"
  | "SOBRE_PRESUPUESTO";

export interface AvisoDeRegla {
  clave: ClaveDeAviso;
  /** Lo que dice la marca, corto. */
  rotulo: string;
  /** Qué pasó y qué hacer, en una frase. */
  texto: string;
  /** Rompe la regla (rojo) o solo falta algo (amarillo). */
  grave: boolean;
}

export interface GastoParaReglas {
  /** YYYY-MM-DD. */
  fecha: string;
  tipo: string | null;
  rubro: string | null;
  avisoPrevio: boolean;
  comprobante: string | null;
  /** Ya se volvió un fijo. */
  pasoAFijo: boolean;
}

const lista = (rs: readonly RubroDeGasto[]) => {
  const xs = rs.map((r) => ETIQUETA_RUBRO[r].toLowerCase());
  return xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;
};

/** ¿Le falta la factura? Solo a un gasto que ya pasó, desde `FACTURAS_DESDE`. */
export function faltaFactura(g: Pick<GastoParaReglas, "fecha" | "comprobante">, hoyISO: string): boolean {
  return g.fecha >= FACTURAS_DESDE && g.fecha <= hoyISO && !g.comprobante?.trim();
}

/** Las marcas de un gasto puntual, de la más grave a la más leve. Vacío = está en regla. */
export function avisosDelGasto(g: GastoParaReglas, hoyISO: string): AvisoDeRegla[] {
  const out: AvisoDeRegla[] = [];
  const tipo = tipoDe(g.tipo);
  const rubro = rubroDe(g.rubro);
  if (g.fecha >= REGLAS_DE_GASTO_DESDE && tipo !== "OTRO") {
    const permitidos = RUBROS_PERMITIDOS[tipo];
    const nombre = tipo === "REPRESENTACION" ? "Un gasto de representación" : "Con la tarjeta corporativa";
    if (rubro === null) {
      out.push({
        clave: "SIN_RUBRO",
        rotulo: "Falta en qué fue",
        texto: `${nombre} solo acepta ${lista(permitidos)}: di en qué fue.`,
        grave: false,
      });
    } else if (!permitidos.includes(rubro)) {
      out.push({
        clave: "FUERA_DE_REGLA",
        rotulo: "Fuera de la regla",
        texto: `${nombre} solo acepta ${lista(permitidos)}, y esto fue ${ETIQUETA_RUBRO[rubro].toLowerCase()}.`,
        grave: true,
      });
    }
    if (tipo === "REPRESENTACION" && !g.avisoPrevio) {
      out.push({
        clave: "SIN_AVISO_PREVIO",
        rotulo: "Sin aviso previo",
        texto: "Los gastos de representación se avisan antes de hacerlos.",
        grave: true,
      });
    }
    if (tipo === "TARJETA_CORPORATIVA" && rubro === "SUSCRIPCION" && !g.pasoAFijo) {
      out.push({
        clave: "SUSCRIPCION_SUELTA",
        rotulo: "Suscripción sin fijo",
        texto: "Una suscripción se repite: vuélvela fijo para que tenga su presupuesto.",
        grave: false,
      });
    }
  }
  if (faltaFactura(g, hoyISO)) {
    out.push({ clave: "SIN_FACTURA", rotulo: "Sin factura", texto: "Falta la factura de este gasto.", grave: false });
  }
  return out.sort((a, b) => Number(b.grave) - Number(a.grave));
}

export interface RecurrenteParaReglas {
  categoria: string;
  monto: number;
  moneda: string;
  frecuencia: string;
  presupuesto: number | null;
  activo: boolean;
  finalizadoEl: string | null;
}

/** ¿Es una suscripción (lleva presupuesto)? Las herramientas: el software y los servicios que se pagan con tarjeta. */
export function esSuscripcion(c: Pick<RecurrenteParaReglas, "categoria">): boolean {
  return c.categoria === "HERRAMIENTA";
}

const enSuFrecuencia = (frecuencia: string) => (frecuencia === "ANUAL" ? "al año" : "al mes");

/** Las marcas de un fijo: sin presupuesto (si es una suscripción) o con un monto que lo pasa. Solo los vigentes. */
export function avisosDelRecurrente(c: RecurrenteParaReglas): AvisoDeRegla[] {
  if (!c.activo || c.finalizadoEl) return [];
  if (c.presupuesto === null) {
    return esSuscripcion(c)
      ? [{ clave: "SIN_PRESUPUESTO", rotulo: "Sin presupuesto", texto: "Cada suscripción lleva un presupuesto estimado.", grave: false }]
      : [];
  }
  const exceso = Math.round((c.monto - c.presupuesto) * 100) / 100;
  if (exceso <= 0) return [];
  return [
    {
      clave: "SOBRE_PRESUPUESTO",
      rotulo: "Pasa el presupuesto",
      texto: `Cuesta ${textoDeMontos([{ moneda: c.moneda, monto: c.monto }])} ${enSuFrecuencia(c.frecuencia)} y el presupuesto es ${textoDeMontos([{ moneda: c.moneda, monto: c.presupuesto }])}: ${textoDeMontos([{ moneda: c.moneda, monto: exceso }])} de más.`,
      grave: true,
    },
  ];
}

/**
 * ¿Lo que cobró la tarjeta en un mes pasa el presupuesto del fijo? Solo un fijo MENSUAL: el cargo de un mes no se compara
 * con un presupuesto anual. Sin presupuesto, no hay con qué comparar.
 */
export function cargoSobrePresupuesto(cargoDelMes: number, fijo: { frecuencia: string; presupuesto?: number | null }): boolean {
  if (fijo.frecuencia !== "MENSUAL" || fijo.presupuesto == null) return false;
  return Math.round((cargoDelMes - fijo.presupuesto) * 100) / 100 > 0;
}

/** Los gastos a los que les falta la factura, del más viejo al más nuevo (los viejos son los más difíciles de conseguir). */
export function gastosSinFactura<T extends Pick<GastoParaReglas, "fecha" | "comprobante">>(gastos: readonly T[], hoyISO: string): T[] {
  return gastos.filter((g) => faltaFactura(g, hoyISO)).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/**
 * Desde qué día cuenta un gasto que se vuelve fijo: el primero del mes que sigue al del gasto. El gasto se queda en su
 * mes; si el fijo contara también ese mes, el mes tendría el mismo gasto dos veces. (Un fijo cargado hoy no cuenta antes
 * de hoy aunque su alta diga otra cosa: `montoDelCostoEn` lo corta por el día en que se cargó.)
 */
export function fijoDesde(fechaDelGastoISO: string): string {
  const [y, m] = fechaDelGastoISO.slice(0, 7).split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}
