/**
 * lib/finanzas/gastos-server.ts — lo que alimenta Finanzas › Gastos del mes, Recurrentes y Tarjetas sin salarios
 * (rediseño 2026-10-03, docs/finanzas-rediseno-plan.md). Server-only.
 *
 * ⛔ PRIVACIDAD: nada de este archivo lee un salario. Los recurrentes se piden con la categoría filtrada EN LA CONSULTA, y
 * de la planilla solo sale el TOTAL del mes por moneda (sin persona, sin quincena por persona). Lo vigila
 * costos-privacy.test.ts (P5).
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { loadCostos, loadGastos, type GastoPuntualDTO } from "@/lib/cobranza/queries";
import { CobranzaError } from "@/lib/cobranza/mutations";
import { montosPorMoneda, type MontoEnMoneda } from "@/lib/cobranza/odoo/diferencias";
import { CATEGORIAS_SIN_SALARIO, esCategoriaSinSalario, montoMensual, type CategoriaSinSalario } from "./gastos";

export interface GastosDelMesDTO {
  periodo: string;
  gastos: GastoPuntualDTO[];
  /** Los recurrentes vigentes que no son salarios, por categoría, con lo que cuestan en un mes. */
  recurrentes: Array<{ categoria: CategoriaSinSalario; cantidad: number; montos: MontoEnMoneda[] }>;
  /** El TOTAL de la planilla anotada para el mes, por moneda, y cuántas quincenas tiene. Sin personas. */
  planilla: { montos: MontoEnMoneda[]; quincenas: number };
  tarjetas: number;
  /** Si ya se avisó que están todos los gastos del mes, quién y cuándo. */
  gastosListos: { por: string; en: string } | null;
  /** Si el mes ya está cerrado: ya no se avisa nada. */
  cerrado: boolean;
}

export async function loadGastosDelMes(periodo: string): Promise<GastosDelMesDTO> {
  const [gastos, costos, planilla, tarjetas, cierre] = await Promise.all([
    loadGastos({ periodo }),
    loadCostos({ sinSalarios: true }),
    prisma.pagoPlanilla.findMany({ where: { periodo }, select: { quincena: true, monto: true, moneda: true } }),
    prisma.tarjetaCredito.count({ where: { activa: true } }),
    prisma.cierreMes.findUnique({
      where: { periodo },
      select: { estado: true, gastosListosPor: true, gastosListosEn: true },
    }),
  ]);
  const vigentes = costos.filter((c) => c.activo && c.finalizadoEl === null);
  return {
    periodo,
    gastos,
    recurrentes: CATEGORIAS_SIN_SALARIO.map((categoria) => {
      const de = vigentes.filter((c) => c.categoria === categoria);
      return {
        categoria,
        cantidad: de.length,
        montos: montosPorMoneda(de.map((c) => ({ moneda: c.moneda, monto: montoMensual(c.monto, c.frecuencia) }))),
      };
    }),
    planilla: {
      montos: montosPorMoneda(planilla.map((p) => ({ moneda: p.moneda, monto: Number(p.monto) }))),
      quincenas: new Set(planilla.map((p) => p.quincena)).size,
    },
    tarjetas,
    gastosListos:
      cierre?.gastosListosPor && cierre.gastosListosEn
        ? { por: cierre.gastosListosPor, en: cierre.gastosListosEn.toISOString() }
        : null,
    cerrado: cierre?.estado === "CERRADO",
  };
}

/**
 * Avisa (o deshace el aviso) de que los gastos del mes están todos. Es lo que el cierre del mes pide de quien registra.
 * Un mes cerrado no se toca: hay que reabrirlo.
 */
export async function marcarGastosListos(periodo: string, listos: boolean, actor: string): Promise<void> {
  const actual = await prisma.cierreMes.findUnique({ where: { periodo }, select: { estado: true } });
  if (actual?.estado === "CERRADO") throw new CobranzaError("El mes ya está cerrado: para cambiarlo hay que reabrirlo.", 409);
  await prisma.cierreMes.upsert({
    where: { periodo },
    create: { periodo, gastosListosPor: listos ? actor : null, gastosListosEn: listos ? new Date() : null },
    update: { gastosListosPor: listos ? actor : null, gastosListosEn: listos ? new Date() : null },
  });
}

/**
 * ⛔ Antes de editar o borrar un recurrente desde las pantallas sin salarios: que exista y que NO sea un salario. Un
 * salario contesta lo mismo que uno que no existe (404), para no confirmar que está.
 */
export async function asegurarCostoSinSalario(costoId: string): Promise<void> {
  const c = await prisma.costoRecurrente.findUnique({ where: { id: costoId }, select: { categoria: true } });
  if (!c || !esCategoriaSinSalario(c.categoria)) throw new CobranzaError("Ese costo no existe.", 404);
}

/** Lo mismo para una tarjeta: solo se le pueden asignar costos que no son salarios. */
export async function asegurarCostosSinSalario(costoIds: readonly string[]): Promise<void> {
  if (costoIds.length === 0) return;
  const n = await prisma.costoRecurrente.count({
    where: { id: { in: [...costoIds] }, categoria: { in: [...CATEGORIAS_SIN_SALARIO] } },
  });
  if (n !== new Set(costoIds).size) throw new CobranzaError("Alguno de esos costos no existe.", 404);
}
