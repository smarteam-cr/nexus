/**
 * lib/finanzas/pendientes-server.ts — mide lo que alimenta Finanzas › Pendientes (rediseño 2026-10-03). Server-only.
 *
 * ⚠ No calcula nada propio: cada número sale de la MISMA función que lo calcula en su página —la cola de Cobranza y su
 * resumen por antigüedad, las listas de Odoo y Mercury, el emparejado, las comisiones por cobrar—, para que Pendientes y
 * esas páginas no puedan decir cifras distintas. Lo puro (qué tarea se arma con qué) vive en pendientes.ts.
 */
import "server-only";
import { loadColaCobros, loadComisionesPartner } from "@/lib/cobranza";
import { clasificarCobro, resumenAntiguedad } from "@/lib/cobranza/antiguedad";
import { marcaPromesa } from "@/lib/cobranza/engine";
import { comisionesPorCobrar } from "@/lib/cobranza/comisiones-partner";
import { cargarDiferencias, contarEmparejado } from "@/lib/cobranza/odoo/servicio";
import { cargarDiferenciasMercury, cargarEmparejadoMercury } from "@/lib/cobranza/mercury/servicio";
import { montosPorMoneda, type DiferenciaOdoo, type MontoEnMoneda } from "@/lib/cobranza/odoo/diferencias";
import { prisma } from "@/lib/db/prisma";
import { filasPorQuien, juntarDiferencias } from "./conciliacion";
import { gastosDelMesPendiente, mesAnterior, periodoDe } from "./gastos";
import { devueltosPara } from "./revision-server";
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

/**
 * Lo que se lee para medir Pendientes, en una vuelta. Supervisión lo reusa (la cola y las dos listas de Conciliación
 * son lo más caro de leer y las dos pantallas las necesitan).
 *
 * `quien`: el email de quien mira, para traerle lo que LE devolvieron (lo que él o ella registró). null = todo lo
 * devuelto (un Super Admin que abre Pendientes).
 */
export async function cargarFuentesDePendientes(todayISO: string, quien: string | null = null) {
  const periodos = [mesAnterior(periodoDe(todayISO)), periodoDe(todayISO)];
  const [cola, comisiones, odoo, mercury, empOdoo, empMercury, gastosDeLosMeses, cierres, devueltos] = await Promise.all([
    loadColaCobros(todayISO),
    loadComisionesPartner(),
    cargarDiferencias(),
    cargarDiferenciasMercury(),
    contarEmparejado(),
    cargarEmparejadoMercury().then((e) => e.conteos),
    /* Cuántos gastos hay anotados en el mes anterior y en este, y si ya se avisó que están todos. */
    prisma.gastoPuntual.findMany({
      where: { fecha: { gte: new Date(`${periodos[0]}-01T00:00:00Z`) } },
      select: { fecha: true },
    }),
    prisma.cierreMes.findMany({
      where: { periodo: { in: periodos } },
      select: { periodo: true, estado: true, gastosListosPor: true },
    }),
    devueltosPara(quien),
  ]);
  return { cola, comisiones, odoo, mercury, empOdoo, empMercury, gastosDeLosMeses, cierres, devueltos };
}

export type FuentesDePendientes = Awaited<ReturnType<typeof cargarFuentesDePendientes>>;

export async function medirPendientes(todayISO: string, quien: string | null = null): Promise<DatosDePendientes> {
  return medirDesdeFuentes(await cargarFuentesDePendientes(todayISO, quien), todayISO);
}

/** Las tareas a partir de lo leído. Sin base ni red: lo mismo que mide Pendientes, para quien ya tiene las fuentes. */
export function medirDesdeFuentes(f: FuentesDePendientes, todayISO: string): DatosDePendientes {
  const { cola, comisiones, odoo, mercury, empOdoo, empMercury, gastosDeLosMeses, cierres, devueltos } = f;

  /* Cobranza: lo mismo que las tarjetas de la cola. */
  const resumen = resumenAntiguedad(cola, todayISO);
  const porFacturar = Object.fromEntries(
    Object.entries(resumen).map(([moneda, m]) => [moneda, { n: m.nSinFacturar, monto: m.sinFacturar }]),
  );
  const promesas = Object.fromEntries(
    Object.entries(resumen).map(([moneda, m]) => [moneda, { n: m.nPromesaIncumplida, monto: m.promesaIncumplida }]),
  );
  /* De las que tocaba facturar, las de un proyecto pausado (2026-10-06): con la misma regla de grupo que la cola. */
  const pausadas = cola.filter((c) => c.proyectoPausado && clasificarCobro(c, todayISO) === "sinFacturar");
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
      pausados: { n: pausadas.length, clientes: [...new Set(pausadas.map((c) => c.clienteNombre))] },
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
    gastosDelMes: gastosDelMesPendiente({
      hoyISO: todayISO,
      /* Un mes cerrado tampoco pide nada: ya se dio por bueno. */
      listos: new Set(cierres.filter((c) => c.gastosListosPor || c.estado === "CERRADO").map((c) => c.periodo)),
      anotados: gastosDeLosMeses.reduce((m, g) => {
        const p = g.fecha.toISOString().slice(0, 7);
        return m.set(p, (m.get(p) ?? 0) + 1);
      }, new Map<string, number>()),
    }),
    devueltos,
  };
}
