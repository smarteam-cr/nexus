/**
 * lib/cobranza/ingresos-no-venta.ts
 *
 * La plata que entra y NO es venta: qué clase de plata es, a qué mes del reporte de equilibrio va y
 * cuál falta clasificar. Pura: sin Prisma, sin red, sin reloj.
 *
 * ⚠ Y sin zod ni valores de lib/finanzas/equilibrio.ts: la importan el formulario del navegador y
 * schema.ts (el mismo motivo que numero-factura.ts). De equilibrio solo entran TIPOS.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────────
 * El fondo de marketing de Insider (INV-26 + INV-27, US$5.346,91) entró al banco y no es venta a un
 * cliente: es presupuesto de un aliado. El Compendio lo cuenta como venta, y en Nexus no tenía dónde
 * caer: como cobro inflaba lo facturado y el % de cobranza; como comisión de aliado sumaba al punto
 * de equilibrio. Desde la etapa 10, lo registrado en Ingresos variables NO ES VENTA: el reporte lo
 * suma a la caja y a nada más (`NO_VENTA` en lib/finanzas/equilibrio.ts).
 *
 * ⚠ La categoría del fondo de aliado todavía no tiene nombre (lo deciden Elías y Claudia). Hasta
 * entonces se carga SIN categoría y el reporte la lista en «Lo que no cuadra». Cuando esté, se suma
 * una línea a `CATEGORIAS_INGRESO_NO_VENTA`: la columna es texto justamente para que no haga falta SQL.
 */
import type { IngresoDeMes, MonedaEq } from "@/lib/finanzas/equilibrio";
import type { EnlaceItem, ItemInconsistencia } from "@/lib/finanzas/inconsistencias";
import { NUMERO_FACTURA_MAX, normalizarNumeroFactura } from "./numero-factura";

/**
 * Las clases de plata que entra sin ser venta. Solo las que no piden decidir nada: cualquier empresa
 * las tiene y ninguna es venta. Lo que no encaja se deja sin clasificar, que es una respuesta
 * honesta y queda a la vista; un «Otro» taparía justo la pregunta abierta.
 */
export const CATEGORIAS_INGRESO_NO_VENTA = ["REEMBOLSO", "INTERESES", "APORTE_DE_SOCIOS"] as const;
export type CategoriaIngresoNoVenta = (typeof CATEGORIAS_INGRESO_NO_VENTA)[number];

export const CATEGORIA_INGRESO_LABEL: Record<CategoriaIngresoNoVenta, string> = {
  REEMBOLSO: "Reembolso o devolución",
  INTERESES: "Intereses del banco",
  APORTE_DE_SOCIOS: "Aporte de socios o préstamo",
};

export const SIN_CATEGORIA_LABEL = "Sin clasificar";

/** Tope de la referencia ya normalizada: es un número de documento, igual que el de una factura. */
export const REFERENCIA_EXTERNA_MAX = NUMERO_FACTURA_MAX;

/** La misma escritura que el número de factura de un cobro, para que «INV - 26» e «INV-26» choquen. */
export const normalizarReferenciaExterna = normalizarNumeroFactura;

export function esCategoriaIngreso(c: string | null | undefined): c is CategoriaIngresoNoVenta {
  return !!c && (CATEGORIAS_INGRESO_NO_VENTA as readonly string[]).includes(c);
}

/**
 * Cómo se nombra la categoría en pantalla.
 * ⚠ Una que el código no conoce (renombrada, escrita a mano en la base) se lee como sin clasificar:
 * así vuelve a la lista de pendientes en vez de desaparecer con un nombre que nadie eligió.
 */
export function etiquetaDeCategoria(c: string | null | undefined): string {
  return esCategoriaIngreso(c) ? CATEGORIA_INGRESO_LABEL[c] : SIN_CATEGORIA_LABEL;
}

/**
 * El 409 del alta: el número ya es la factura de un cobro, así que esa plata ya cuenta como venta
 * (en lo facturado y, si se cobró, en la caja). Cargarla otra vez acá la contaría dos veces.
 */
export function mensajeReferenciaYaEsCobro(referencia: string, cliente: string): string {
  return `«${referencia}» ya es la factura de un cobro de ${cliente}: esa plata ya cuenta como venta. Si no es venta, corregí ese cobro en Cobranza; si es venta, no va en Ingresos variables.`;
}

/** Lo que hace falta de una fila de `IngresoVariable` para el reporte. */
export interface IngresoNoVentaParaReporte {
  /** "YYYY-MM-DD": el día en que entró la plata. */
  fechaISO: string;
  monto: number;
  moneda: MonedaEq;
}

/**
 * Las filas del año como ingresos del reporte: tipo `NO_VENTA`, en el mes en que entró la plata.
 *
 * `cobrada` = la fecha ya llegó. El formulario no deja cargar una fecha futura, pero la API sí, y
 * una plata que todavía no entró no puede sumar a la caja. Una fila de otro año no entra.
 */
export function ingresosNoVentaDelAnio(
  filas: readonly IngresoNoVentaParaReporte[],
  anio: number,
  hoyISO: string,
): IngresoDeMes[] {
  return filas
    .filter((f) => f.fechaISO.startsWith(`${anio}-`))
    .map((f) => ({
      periodo: f.fechaISO.slice(0, 7),
      tipo: "NO_VENTA" as const,
      monto: f.monto,
      moneda: f.moneda,
      tipoServicio: null,
      cobrada: f.fechaISO <= hoyISO,
    }));
}

/** Una fila para la lista de «Lo que no cuadra». */
export interface IngresoNoVentaFila extends IngresoNoVentaParaReporte {
  concepto: string;
  categoria: string | null;
  referenciaExterna: string | null;
  clienteNombre: string | null;
}

/**
 * La plata que no es venta y todavía no dice qué es, lista para «Lo que no cuadra».
 *
 * La conversión entra por parámetro (`aPresentacion`, que en el loader es `convertir()` con la tasa
 * de ese mes): este módulo no convierte. Lo que no se puede convertir NO suma al monto de la línea y
 * lleva su monto en la nota, con la moneda escrita, igual que lo facturado sin tasa.
 */
export function pendientesDeClasificar(
  filas: readonly IngresoNoVentaFila[],
  aPresentacion: (monto: number, moneda: MonedaEq, periodo: string) => number | null,
  enlaces: readonly EnlaceItem[],
): { cuantas: number; monto: number; items: ItemInconsistencia[] } {
  const pendientes = filas
    .filter((f) => !esCategoriaIngreso(f.categoria))
    .map((f) => ({ f, convertido: aPresentacion(f.monto, f.moneda, f.fechaISO.slice(0, 7)) }));
  // Primero lo que más plata mueve; lo que no se pudo convertir, al final.
  pendientes.sort((a, b) => (b.convertido ?? -1) - (a.convertido ?? -1));
  const monto = Math.round(pendientes.reduce((n, p) => n + (p.convertido ?? 0), 0) * 100) / 100;
  return {
    cuantas: pendientes.length,
    monto,
    items: pendientes.map(({ f, convertido }) => ({
      texto: f.concepto,
      monto: convertido ?? undefined,
      nota: [
        `entró el ${f.fechaISO}`,
        f.referenciaExterna ? `ref. ${f.referenciaExterna}` : null,
        f.clienteNombre ?? "sin cliente",
        convertido === null
          ? `${f.moneda} ${f.monto.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} sin tipo de cambio: no suma al monto de la línea`
          : null,
      ]
        .filter(Boolean)
        .join(" · "),
      enlaces: [...enlaces],
    })),
  };
}
