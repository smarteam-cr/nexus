/**
 * lib/finanzas/gastos-server.ts — lo que alimenta Finanzas › Gastos del mes, Recurrentes y Tarjetas sin salarios
 * (rediseño 2026-10-03, docs/finanzas-rediseno-plan.md). Server-only.
 *
 * ⛔ PRIVACIDAD: nada de este archivo lee un salario. Los recurrentes se piden con la categoría filtrada EN LA CONSULTA
 * (y su historia, `CostoMovimiento`, filtrada por la categoría del costo Y por la de la foto de cada movimiento), y de la
 * planilla solo sale el TOTAL del mes por moneda (sin persona, sin quincena por persona). Lo vigila
 * costos-privacy.test.ts (P5).
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { loadCostos, loadGastos, type GastoPuntualDTO } from "@/lib/cobranza/queries";
import { CobranzaError } from "@/lib/cobranza/mutations";
import { montosPorMoneda, type MontoEnMoneda } from "@/lib/cobranza/odoo/diferencias";
import { CATEGORIAS_SIN_SALARIO, esCategoriaSinSalario, montoMensual, type CategoriaSinSalario } from "./gastos";
import { costoParaEgreso, montoDelCostoEn, type MovimientoDeCosto } from "./egresos-nexus";
import type { MonedaEq } from "./equilibrio";

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
  const [gastos, costos, movimientos, planilla, tarjetas, cierre] = await Promise.all([
    loadGastos({ periodo }),
    loadCostos({ sinSalarios: true }),
    // La historia de los recurrentes, para mostrar el mes con lo que valía ESE mes y no con lo de hoy. ⛔ Filtrada dos
    // veces: el costo de hoy no es salario y la foto del movimiento tampoco (un costo que antes fue salario no trae
    // ese pasado).
    prisma.costoMovimiento.findMany({
      where: { categoria: { in: [...CATEGORIAS_SIN_SALARIO] }, costo: { categoria: { in: [...CATEGORIAS_SIN_SALARIO] } } },
      select: { costoId: true, tipo: true, fechaEfectiva: true, monto: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.pagoPlanilla.findMany({ where: { periodo }, select: { quincena: true, monto: true, moneda: true } }),
    prisma.tarjetaCredito.count({ where: { activa: true } }),
    prisma.cierreMes.findUnique({
      where: { periodo },
      select: { estado: true, gastosListosPor: true, gastosListosEn: true },
    }),
  ]);
  const historia = new Map<string, MovimientoDeCosto[]>();
  for (const m of movimientos) {
    if (!m.costoId) continue;
    const xs = historia.get(m.costoId) ?? [];
    xs.push({ tipo: m.tipo, fechaEfectiva: m.fechaEfectiva.toISOString().slice(0, 10), monto: Number(m.monto) });
    historia.set(m.costoId, xs);
  }
  // Los recurrentes de ESE mes, con la misma vigencia que el punto de equilibrio (lib/finanzas/egresos-nexus.ts). Antes
  // eran los activos de hoy: el mes pasado mostraba los recurrentes y los montos de hoy.
  const delMes = costos.flatMap((c) => {
    if (!esCategoriaSinSalario(c.categoria)) return [];
    const monto = montoDelCostoEn(
      costoParaEgreso({
        id: c.id,
        nombre: c.nombre,
        categoria: c.categoria,
        monto: c.monto,
        moneda: c.moneda as MonedaEq,
        frecuencia: c.frecuencia,
        activo: c.activo,
        finalizadoEl: c.finalizadoEl,
        createdAt: new Date(c.createdAt),
        movimientos: historia.get(c.id) ?? [],
      }),
      periodo,
    );
    return monto === null ? [] : [{ categoria: c.categoria, moneda: c.moneda, monto: montoMensual(monto, c.frecuencia) }];
  });
  return {
    periodo,
    gastos,
    recurrentes: CATEGORIAS_SIN_SALARIO.map((categoria) => {
      const de = delMes.filter((c) => c.categoria === categoria);
      return {
        categoria,
        cantidad: de.length,
        montos: montosPorMoneda(de.map((c) => ({ moneda: c.moneda, monto: c.monto }))),
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
