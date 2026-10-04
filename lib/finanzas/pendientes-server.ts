/**
 * lib/finanzas/pendientes-server.ts — mide lo que alimenta Finanzas › Pendientes (rediseño 2026-10-03). Server-only.
 *
 * ⚠ No calcula nada propio: cada número sale de la MISMA función que lo calcula en su página —la cola de Cobranza y su
 * resumen por antigüedad, las listas de Odoo y Mercury, el emparejado, las comisiones por cobrar—, para que Pendientes y
 * esas páginas no puedan decir cifras distintas. Lo puro (qué tarea se arma con qué) vive en pendientes.ts.
 */
import "server-only";
import { loadColaCobros, loadComisionesPartner } from "@/lib/cobranza";
import { resumenAntiguedad } from "@/lib/cobranza/antiguedad";
import { marcaPromesa } from "@/lib/cobranza/engine";
import { comisionesPorCobrar } from "@/lib/cobranza/comisiones-partner";
import { cargarDiferencias, contarEmparejado } from "@/lib/cobranza/odoo/servicio";
import { cargarDiferenciasMercury, cargarEmparejadoMercury } from "@/lib/cobranza/mercury/servicio";
import { montosPorMoneda, type DiferenciaOdoo, type MontoEnMoneda } from "@/lib/cobranza/odoo/diferencias";
import { filasPorQuien, juntarDiferencias } from "./conciliacion";
import type { DatosDePendientes } from "./pendientes";

/** Las líneas que dicen «ya pagada allá, por cobrar acá»: son su propia tarea, «Registrar pagos». */
export const LINEAS_DE_PAGOS_DETECTADOS = ["ODOO-POR-COBRAR-PAGADA", "MERCURY-PAGADA-SIN-COBRAR"] as const;

const montosDeResumen = (porMoneda: Record<string, { n: number; monto: number }>): MontoEnMoneda[] =>
  Object.entries(porMoneda)
    .filter(([, v]) => v.n > 0)
    .map(([moneda, v]) => ({ moneda, monto: v.monto }));

/** Las filas y la plata de unas líneas, contando cada documento una vez (la plata de la línea ya viene así). */
function filasYPlata(lineas: readonly DiferenciaOdoo[]): { n: number; montos: MontoEnMoneda[] } {
  return {
    n: lineas.reduce((s, l) => s + l.items.length, 0),
    montos: montosPorMoneda(lineas.flatMap((l) => l.plata)),
  };
}

export async function medirPendientes(todayISO: string): Promise<DatosDePendientes> {
  const [cola, comisiones, odoo, mercury, empOdoo, empMercury] = await Promise.all([
    loadColaCobros(todayISO),
    loadComisionesPartner(),
    cargarDiferencias(),
    cargarDiferenciasMercury(),
    contarEmparejado(),
    cargarEmparejadoMercury().then((e) => e.conteos),
  ]);

  /* Cobranza: lo mismo que las tarjetas de la cola. */
  const resumen = resumenAntiguedad(cola, todayISO);
  const porFacturar = Object.fromEntries(
    Object.entries(resumen).map(([moneda, m]) => [moneda, { n: m.nSinFacturar, monto: m.sinFacturar }]),
  );
  const promesas = Object.fromEntries(
    Object.entries(resumen).map(([moneda, m]) => [moneda, { n: m.nPromesaIncumplida, monto: m.promesaIncumplida }]),
  );
  const clientesConPromesaRota = [
    ...new Set(
      cola
        .filter(
          (c) =>
            marcaPromesa({ estado: c.estado, fechaEmisionISO: c.fechaEmision, promesaPagoISO: c.promesaPago ?? null }, todayISO) ===
            "incumplida",
        )
        .sort((a, b) => b.monto - a.monto)
        .map((c) => c.clienteNombre),
    ),
  ];

  /* Conciliación: las dos listas juntas, como las ve la pantalla. */
  const todas = juntarDiferencias(odoo.inconsistencias, mercury.inconsistencias);
  const detectadas = todas.filter((l) => (LINEAS_DE_PAGOS_DETECTADOS as readonly string[]).includes(l.codigo));
  const pagosDetectados = filasYPlata(detectadas);
  const porQuien = filasPorQuien(todas);

  return {
    porFacturar: {
      n: Object.values(porFacturar).reduce((s, v) => s + v.n, 0),
      montos: montosDeResumen(porFacturar),
    },
    promesas: {
      n: Object.values(promesas).reduce((s, v) => s + v.n, 0),
      montos: montosDeResumen(promesas),
      clientes: clientesConPromesaRota,
    },
    pagosDetectados,
    comisionesVencidas: comisionesPorCobrar(comisiones.comisiones, todayISO).length,
    porEmparejar: { odoo: empOdoo.porEmparejar, mercury: empMercury.sinEmparejar },
    diferencias: Math.max(0, porQuien.mias - pagosDetectados.n),
    decisiones: porQuien.decisiones,
    gastosDelMes: null,
    devueltos: [],
  };
}
