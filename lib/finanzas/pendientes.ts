/**
 * lib/finanzas/pendientes.ts — Finanzas › Pendientes, la pantalla de entrada de quien registra (rediseño 2026-10-03,
 * docs/finanzas-rediseno-plan.md).
 *
 * Junta en una lista lo que hoy está repartido en Cobranza, Conciliación, Comisiones y Gastos: cada tarea dice qué hay que
 * hacer, cuánto mueve y a qué página ir. Ninguna es nueva: son los mismos números que esas páginas ya calculan, contados
 * acá con las mismas reglas.
 *
 * ── LO QUE NO MUESTRA, A PROPÓSITO ──────────────────────────────────────────────
 * Lo que la persona ya registró. Revisar ese trabajo es de quien supervisa y vive en Supervisión. Acá solo llega lo que
 * le devolvieron, como una tarea más («Devuelto por Alex»).
 *
 * PURO: recibe los conteos ya medidos y arma las tareas. La medición vive en pendientes-server.ts.
 */
import { textoDeMontos, type MontoEnMoneda } from "@/lib/cobranza/odoo/diferencias";
import type { Devuelto } from "./revision";

/** El aviso de proyecto pausado dentro de la tarea de facturar (lib/cobranza/proyecto-pausado.ts). */
function avisoDePausados(p: { n: number; clientes: string[] } | undefined): string {
  if (!p || p.n === 0) return "";
  const nombres = `${p.clientes.slice(0, 3).join(", ")}${p.clientes.length > 3 ? " y otros" : ""}`;
  return ` ⏸ ${p.n === 1 ? "Una es" : `${p.n} son`} de un proyecto pausado (${nombres}): consulta con Customer Success y el líder antes de facturar${p.n === 1 ? "la" : "las"}.`;
}

export interface DatosDePendientes {
  /**
   * Cuotas que ya tocaba facturar y siguen sin factura. `pausados`: cuántas son de un proyecto pausado, y de qué clientes
   * (2026-10-06: antes de facturarlas hay que hablar con Customer Success y el líder).
   */
  porFacturar: { n: number; montos: MontoEnMoneda[]; pausados?: { n: number; clientes: string[] } };
  /** Cobros con la promesa de pago vencida, y los clientes, sin repetir. */
  promesas: { n: number; montos: MontoEnMoneda[]; clientes: string[] };
  /** Cuotas que Odoo o Mercury ya dan por pagadas y en Nexus siguen por cobrar. */
  pagosDetectados: { n: number; montos: MontoEnMoneda[] };
  /** Comisiones de aliados con la fecha pasada y sin confirmar. */
  comisionesVencidas: number;
  /** Clientes de Odoo y de Mercury sin su cuenta de Nexus. */
  porEmparejar: { odoo: number; mercury: number };
  /** Filas de Conciliación que se arreglan registrando, sin contar las de pagos detectados (ya son su propia tarea). */
  diferencias: number;
  /** Filas que esperan una decisión de quien supervisa. */
  decisiones: number;
  /** El mes de los gastos, y si ya se avisó que están todos. null = la etapa de gastos todavía no existe. */
  gastosDelMes?: { periodo: string; etiqueta: string; anotados: number; listos: boolean } | null;
  /** Lo que quien supervisa devolvió, con su comentario. */
  devueltos?: Devuelto[];
}

export type Cuando = "hoy" | "semana";

export interface TareaPendiente {
  clave: string;
  cuando: Cuando;
  titulo: string;
  detalle: string;
  /** La plata que mueve, ya con su moneda. Vacío si no aplica. */
  plata: string;
  accion: string;
  href: string;
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? `1 ${uno}` : `${n} ${varios}`);

/**
 * Las tareas, en el orden en que conviene hacerlas. Una que no tiene nada que hacer no aparece. Lo devuelto por quien
 * supervisa no va acá: la pantalla lo muestra en su propio bloque, con el comentario.
 */
export function armarPendientes(d: DatosDePendientes): TareaPendiente[] {
  const out: TareaPendiente[] = [];
  if (d.pagosDetectados.n > 0) {
    out.push({
      clave: "pagos",
      cuando: "hoy",
      titulo: `Registrar ${plural(d.pagosDetectados.n, "pago que Odoo o Mercury ya dan por pagado", "pagos que Odoo o Mercury ya dan por pagados")}`,
      detalle: "En Nexus siguen por cobrar. Confirma la fecha en que entró la plata y regístralo.",
      plata: textoDeMontos(d.pagosDetectados.montos),
      accion: "Ver cuáles",
      href: "/finanzas/conciliacion",
    });
  }
  if (d.porFacturar.n > 0) {
    out.push({
      clave: "facturar",
      cuando: "hoy",
      titulo: `Facturar ${plural(d.porFacturar.n, "cuota que ya toca", "cuotas que ya tocan")}`,
      detalle: `Emite la factura en Odoo o en Mercury y márcala en Cobranza con su número.${avisoDePausados(d.porFacturar.pausados)}`,
      plata: textoDeMontos(d.porFacturar.montos),
      accion: "Facturar",
      href: "/cobranza",
    });
  }
  if (d.promesas.n > 0) {
    const nombres = d.promesas.clientes.slice(0, 3).join(", ");
    out.push({
      clave: "promesas",
      cuando: "hoy",
      titulo: `Seguir ${plural(d.promesas.n, "cobro con la promesa de pago vencida", "cobros con la promesa de pago vencida")}`,
      detalle: `${nombres}${d.promesas.clientes.length > 3 ? " y otros" : ""}. Escríbeles o anota una promesa nueva.`,
      plata: textoDeMontos(d.promesas.montos),
      accion: "Ver la lista",
      href: "/cobranza",
    });
  }
  if (d.comisionesVencidas > 0) {
    out.push({
      clave: "comisiones",
      cuando: "hoy",
      titulo: `Confirmar ${plural(d.comisionesVencidas, "comisión de aliado", "comisiones de aliados")}`,
      detalle: "La fecha en que el aliado tenía que pagar ya pasó y nadie dijo que entró.",
      plata: "",
      accion: "Confirmar",
      href: "/finanzas/comisiones-partner",
    });
  }
  const emparejar = d.porEmparejar.odoo + d.porEmparejar.mercury;
  if (emparejar > 0) {
    const partes = [
      d.porEmparejar.odoo ? `${d.porEmparejar.odoo} de Odoo` : null,
      d.porEmparejar.mercury ? `${d.porEmparejar.mercury} de Mercury` : null,
    ].filter(Boolean);
    out.push({
      clave: "emparejar",
      cuando: "semana",
      titulo: `Emparejar ${plural(emparejar, "cliente", "clientes")} con su cuenta`,
      detalle: `${partes.join(" y ")}. Mientras no estén emparejados, sus facturas no cuentan en la cobranza.`,
      plata: "",
      accion: "Emparejar",
      href: "/finanzas/conciliacion",
    });
  }
  if (d.diferencias > 0) {
    out.push({
      clave: "diferencias",
      cuando: "semana",
      titulo: `Resolver ${plural(d.diferencias, "diferencia", "diferencias")} con Odoo y Mercury`,
      detalle: "Las que se arreglan registrando: números de factura, cuentas, montos.",
      plata: "",
      accion: "Ir a Conciliación",
      href: "/finanzas/conciliacion",
    });
  }
  if (d.gastosDelMes && !d.gastosDelMes.listos) {
    out.push({
      clave: "gastos",
      cuando: "semana",
      titulo: `Anotar los gastos de ${d.gastosDelMes.etiqueta}`,
      detalle:
        d.gastosDelMes.anotados > 0
          ? `Llevas ${plural(d.gastosDelMes.anotados, "gasto anotado", "gastos anotados")}. Cuando estén todos, avísalo en Gastos del mes.`
          : "Lo que no es recurrente: compras, servicios, viáticos. Antes iba al Excel de egresos.",
      plata: "",
      accion: "Anotar",
      href: "/finanzas/gastos",
    });
  }
  return out;
}
