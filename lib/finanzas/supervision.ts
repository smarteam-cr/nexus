/**
 * lib/finanzas/supervision.ts — Finanzas › Supervisión, la pantalla de entrada de quien supervisa (rediseño de Finanzas,
 * 2026-10-03, etapa «Revisión»).
 *
 * Lo que espera su decisión, el trabajo del equipo por revisar y la cobranza que se está complicando. Como Pendientes,
 * no calcula nada propio: lee las mismas listas que Conciliación y la misma cola que Cobranza.
 *
 * PURO: sin Prisma ni red. La medición vive en supervision-server.ts.
 */
import { clasificarCobro, resumenAntiguedad, type CobroClasificable } from "@/lib/cobranza/antiguedad";
import { diffDays } from "@/lib/cobranza/engine";
import { montosPorMoneda, textoDeMontos, type DiferenciaOdoo, type MontoEnMoneda } from "@/lib/cobranza/odoo/diferencias";
import { esDecision, fuenteDeLinea } from "./conciliacion";

export interface DecisionPendiente {
  codigo: string;
  fuente: "Odoo" | "Mercury";
  titulo: string;
  detalle: string;
  /** La plata, con su moneda. Vacío si la línea no la cuantifica. */
  plata: string;
  filas: number;
}

/** Las líneas de Conciliación que esperan una decisión de negocio y todavía tienen filas, en el orden de la lista. */
export function decisionesPendientes(lineas: readonly DiferenciaOdoo[]): DecisionPendiente[] {
  return lineas
    .filter((l) => esDecision(l) && l.items.length > 0)
    .map((l) => ({
      codigo: l.codigo,
      fuente: fuenteDeLinea(l.codigo) === "mercury" ? "Mercury" : "Odoo",
      titulo: l.titulo,
      detalle: l.detalle,
      plata: textoDeMontos(montosPorMoneda(l.plata)),
      filas: l.items.length,
    }));
}

export interface ClienteQueSeComplica {
  cliente: string;
  /** «US$4.560 · 202 días» o «2 cuotas, US$7.100 · la más vieja de 141 días». */
  texto: string;
}

export interface CobranzaQueSeComplica {
  /** Vencido hace más de 90 días, por moneda. */
  mas90: MontoEnMoneda[];
  nMas90: number;
  /** Facturas con la promesa de pago vencida, por moneda. */
  promesas: MontoEnMoneda[];
  nPromesas: number;
  /** Los clientes con lo más viejo, hasta tres. */
  clientes: ClienteQueSeComplica[];
}

type FilaDeCola = CobroClasificable & { clienteNombre: string };

/** Lo de la cola que pasó los 90 días o rompió su promesa: los mismos números que las tarjetas de Cobranza. */
export function cobranzaQueSeComplica(cola: readonly FilaDeCola[], todayISO: string): CobranzaQueSeComplica {
  const resumen = Object.entries(resumenAntiguedad([...cola], todayISO));
  const por = (f: (m: (typeof resumen)[number][1]) => { n: number; monto: number }) =>
    resumen.map(([moneda, m]) => ({ moneda, ...f(m) })).filter((x) => x.n > 0);
  const mas90 = por((m) => ({ n: m.conteo.d90mas, monto: m.aging.d90mas }));
  const promesas = por((m) => ({ n: m.nPromesaIncumplida, monto: m.promesaIncumplida }));

  const viejos = new Map<string, Array<{ monto: number; moneda: string; dias: number }>>();
  for (const c of cola) {
    if (clasificarCobro(c, todayISO) !== "d90mas") continue;
    const xs = viejos.get(c.clienteNombre) ?? [];
    xs.push({ monto: c.monto, moneda: c.moneda, dias: diffDays(c.fechaProgramada, todayISO) });
    viejos.set(c.clienteNombre, xs);
  }
  const clientes = [...viejos]
    .map(([cliente, xs]) => ({ cliente, xs, dias: Math.max(...xs.map((x) => x.dias)) }))
    .sort((a, b) => b.dias - a.dias || a.cliente.localeCompare(b.cliente))
    .slice(0, 3)
    .map(({ cliente, xs, dias }) => {
      const plata = textoDeMontos(montosPorMoneda(xs));
      return {
        cliente,
        texto: xs.length === 1 ? `${plata} · ${dias} días` : `${xs.length} cuotas, ${plata} · la más vieja de ${dias} días`,
      };
    });

  return {
    mas90: mas90.map(({ moneda, monto }) => ({ moneda, monto })),
    nMas90: mas90.reduce((s, x) => s + x.n, 0),
    promesas: promesas.map(({ moneda, monto }) => ({ moneda, monto })),
    nPromesas: promesas.reduce((s, x) => s + x.n, 0),
    clientes,
  };
}
