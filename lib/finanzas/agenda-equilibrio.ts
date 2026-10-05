/**
 * lib/finanzas/agenda-equilibrio.ts — «Para decidir en la reunión»: lo que mueve los números del punto de equilibrio
 * y no se arregla registrando, cada cosa con QUIÉN la decide (rediseño para RevOps, CFO y CEO, 2026-10-05).
 *
 * La lista de inconsistencias ya decía «lo decide dirección» o «lo carga cobranza». En la reunión eso no alcanza: hay
 * tres personas y cada punto tiene un dueño. El rol sale del TIPO de punto, con una tabla fija: lo que es de la venta
 * (HubSpot, a qué empresa se vendió) es de RevOps; lo que es de la plata, el gasto y el cierre es del CFO; lo que es una
 * regla de negocio que cambia el resultado del año es del CEO.
 *
 * Lo que la página ya muestra en su lugar (las ventas sin respaldo, lo de Odoo y Mercury, los meses con el gasto
 * incompleto) no se repite acá.
 *
 * PURO: sin Prisma ni red.
 */
import type { Inconsistencia } from "./inconsistencias";
import { rangoDeMeses } from "./lectura-equilibrio";

export type Rol = "CEO" | "CFO" | "RevOps";
export const ROLES: readonly Rol[] = ["CEO", "CFO", "RevOps"];

/** Quién decide cada tipo de punto. Uno que no está en la tabla es del CFO: es quien lleva la reunión. */
export const ROL_DE_LINEA: Readonly<Record<string, Rol>> = {
  PIPELINE_SIN_DECIDIR: "CEO",
  FACTURA_SOLO_FUERA_DE_PIPELINE: "CEO",
  PLANILLA_COSTO_VS_PAGADO: "CFO",
  COMISIONES_VENCIDAS: "CFO",
  TARJETA_SOLAPA_HERRAMIENTAS: "CFO",
  AGUINALDO_CRITERIO: "CFO",
  SIN_TIPO_DE_CAMBIO: "CFO",
  DESVIO_DE_CAMBIO: "CFO",
  COBRADO_SIN_FECHA: "CFO",
  MONEDA_INFERIDA: "CFO",
  INGRESO_SIN_CATEGORIA: "CFO",
  SERVICIO_SIN_COBROS: "CFO",
  VENTA_SIN_MONTO: "RevOps",
  VENTA_EN_OTRA_EMPRESA: "RevOps",
  VENTA_SIN_CLIENTE: "RevOps",
  FACTURA_DE_GRUPO: "RevOps",
  CUENTA_SIN_EMPRESA: "RevOps",
};

export const rolDeLinea = (codigo: string): Rol => ROL_DE_LINEA[codigo] ?? "CFO";

/** Las líneas que la página muestra en su propio lugar y por eso no van a la agenda. */
export const LINEAS_CON_LUGAR_PROPIO: readonly string[] = [
  "VENTAS_SIN_COBRANZA",
  "ODOO_FACTURADO_SIN_CUENTA",
  "MERCURY_POR_COBRAR_SIN_EMPAREJAR",
  "EGRESO_INCOMPLETO",
];

export type AccionDeAgenda =
  | { tipo: "decidir-aliados" }
  | { tipo: "linea"; codigo: string }
  | { tipo: "enlace"; href: string; etiqueta: string };

export interface PuntoDeAgenda {
  clave: string;
  rol: Rol;
  pregunta: string;
  detalle: string;
  monto: number | null;
  accion: AccionDeAgenda;
}

export interface EntradaDeAgenda {
  inconsistencias: readonly Inconsistencia[];
  /** Si dirección ya decidió lo de los aliados. Decidido, sale de la agenda (se cambia desde la respuesta). */
  aliadosDecidido: boolean;
  /** Con los aliados se cubre el piso y sin ellos no: lo que hace que la pregunta importe. null = no se sabe. */
  aliadosDecidenElResultado: boolean | null;
  /** Meses con el gasto completo que el CFO todavía no cerró. */
  mesesParaCerrar: readonly string[];
}

/** La agenda, en orden: primero las decisiones de la página, después los puntos de la lista, como vienen (por plata). */
export function armarAgenda(e: EntradaDeAgenda): PuntoDeAgenda[] {
  const out: PuntoDeAgenda[] = [];
  if (!e.aliadosDecidido) {
    out.push({
      clave: "aliados-cubren-piso",
      rol: "CEO",
      pregunta: "¿Lo que pagan los aliados cuenta para cubrir el piso?",
      detalle:
        e.aliadosDecidenElResultado === true
          ? "Sin decidir: hoy cuenta. Con los aliados, el año cubre lo que cuesta operar; sin ellos, no."
          : "Sin decidir: hoy cuenta. Cambia el margen y si cada mes cubre su gasto.",
      monto: null,
      accion: { tipo: "decidir-aliados" },
    });
  }
  if (e.mesesParaCerrar.length > 0) {
    const ps = [...e.mesesParaCerrar].sort();
    out.push({
      clave: "cerrar-meses",
      rol: "CFO",
      pregunta: `Cerrar ${rangoDeMeses(ps)}`,
      detalle: `${ps.length === 1 ? "Tiene" : "Tienen"} el gasto completo. Hasta cerrar${ps.length === 1 ? "lo" : "los"}, el margen a la fecha es preliminar.`,
      monto: null,
      accion: { tipo: "enlace", href: `/finanzas/cierre?mes=${ps[0]}`, etiqueta: "Ir al cierre" },
    });
  }
  for (const l of e.inconsistencias) {
    if (LINEAS_CON_LUGAR_PROPIO.includes(l.codigo)) continue;
    out.push({
      clave: l.codigo,
      rol: rolDeLinea(l.codigo),
      pregunta: l.titulo,
      detalle: l.queHacer,
      monto: l.yaContadoEn ? null : l.montoEnJuego,
      accion: { tipo: "linea", codigo: l.codigo },
    });
  }
  return out;
}
