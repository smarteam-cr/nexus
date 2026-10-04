/**
 * lib/finanzas/supervision-server.ts — mide Finanzas › Supervisión (rediseño 2026-10-03, etapa «Revisión»). Server-only.
 *
 * Lee una sola vez lo que también mide Pendientes (la cola, Odoo, Mercury) y lo reparte: las decisiones, la cobranza
 * que se complica y lo que tiene el equipo. La revisión de pagos y gastos sale de revision-server.ts.
 */
import "server-only";
import { cargarFuentesDePendientes, medirDesdeFuentes } from "./pendientes-server";
import { cargarRevision, type DatosDeRevision } from "./revision-server";
import { cargarCierre } from "./cierre-server";
import { faltanParaCerrar, mesParaCerrar } from "./cierre";
import { juntarDiferencias } from "./conciliacion";
import { cobranzaQueSeComplica, decisionesPendientes, type CobranzaQueSeComplica, type DecisionPendiente } from "./supervision";

export interface DatosDeSupervision {
  decisiones: DecisionPendiente[];
  /** Filas de Conciliación que esperan decisión (la suma de las filas de `decisiones`). */
  filasPorDecidir: number;
  revision: DatosDeRevision;
  complicada: CobranzaQueSeComplica;
  /** El cierre del mes anterior: cuántas de las líneas que frenan están listas. */
  cierre: { periodo: string; cerrado: boolean; listas: number; total: number };
  /** Lo que tiene el equipo por hacer: lo mismo que ve en su Pendientes. */
  equipo: {
    porFacturar: number;
    pagosDetectados: number;
    diferencias: number;
    gastosDelMes: { etiqueta: string; anotados: number; listos: boolean } | null;
  };
}

export async function medirSupervision(todayISO: string): Promise<DatosDeSupervision> {
  const periodoDelCierre = mesParaCerrar(todayISO);
  const [fuentes, revision, cierre] = await Promise.all([
    cargarFuentesDePendientes(todayISO, null),
    cargarRevision(),
    cargarCierre(periodoDelCierre, todayISO),
  ]);
  const bloquean = cierre.items.filter((i) => i.bloquea);
  const pendientes = medirDesdeFuentes(fuentes, todayISO);
  const decisiones = decisionesPendientes(juntarDiferencias(fuentes.odoo.inconsistencias, fuentes.mercury.inconsistencias));
  return {
    decisiones,
    filasPorDecidir: decisiones.reduce((s, d) => s + d.filas, 0),
    revision,
    cierre: {
      periodo: periodoDelCierre,
      cerrado: cierre.cierre?.estado === "CERRADO",
      listas: bloquean.length - faltanParaCerrar(cierre.items).length,
      total: bloquean.length,
    },
    complicada: cobranzaQueSeComplica(fuentes.cola, todayISO),
    equipo: {
      porFacturar: pendientes.porFacturar.n,
      pagosDetectados: pendientes.pagosDetectados.n,
      diferencias: pendientes.diferencias,
      gastosDelMes: pendientes.gastosDelMes
        ? { etiqueta: pendientes.gastosDelMes.etiqueta, anotados: pendientes.gastosDelMes.anotados, listos: pendientes.gastosDelMes.listos }
        : null,
    },
  };
}
