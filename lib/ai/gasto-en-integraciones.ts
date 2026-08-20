/**
 * lib/ai/gasto-en-integraciones.ts — EL GASTO EN CLAUDE, RESUMIDO PARA LA TARJETA DE INTEGRACIONES.
 *
 * ── POR QUÉ NO REUSA `resumirGasto` ──────────────────────────────────────────────────────────
 * `/settings/gasto-ia` lee hasta 20.000 filas y las resume EN MEMORIA, porque ahí se necesita el
 * desglose por agente, por corrida y por día. La tarjeta de integraciones necesita dos números:
 * traer 20.000 filas para sumarlas sería pagar una pantalla entera por un titular, en una página
 * que se abre para configurar logos.
 *
 * Así que se agrega EN LA BASE. ⚠ Y por eso las ventanas son MÓVILES (últimos 30 y 7 días) y no
 * «hoy»: `resumirGasto` corta el día con la fecha de Costa Rica, y un `gte` con corte UTC daría un
 * número distinto al de la pantalla grande para el mismo dato. Dos números que no coinciden y
 * nadie sabe cuál creer es peor que un número menos.
 *
 * ⛔ EL GATE NO ESTÁ ACÁ, Y ES A PROPÓSITO. Esta función NO decide quién puede ver el gasto: lo
 * decide la página, ANTES de llamarla. El costo es plata y `/integrations` la abre cualquier
 * consultor interno, así que quien no tiene rol de costos no recibe el dato — no oculto, AUSENTE.
 * La guarda de al lado lo hace cumplir.
 */
import { prisma } from "@/lib/db/prisma";

export interface GastoResumidoDeClaude {
  costo30: number;
  llamadas30: number;
  costo7: number;
  llamadas7: number;
  modelos: { model: string; llamadas: number }[];
}

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Los dos totales y los modelos más usados. Devuelve `null` si la tabla del medidor todavía no
 * existe en esta base — el deploy puede llegar antes que su migración, y una pantalla de
 * configuración no puede reventar por eso.
 */
export async function gastoResumidoDeClaude(
  ahora: Date = new Date(),
): Promise<GastoResumidoDeClaude | null> {
  const desde30 = new Date(ahora.getTime() - 30 * DIA_MS);
  const desde7 = new Date(ahora.getTime() - 7 * DIA_MS);

  try {
    const [t30, t7, modelos] = await Promise.all([
      prisma.llmCall.aggregate({
        where: { at: { gte: desde30 } },
        _sum: { costUsd: true },
        _count: { _all: true },
      }),
      prisma.llmCall.aggregate({
        where: { at: { gte: desde7 } },
        _sum: { costUsd: true },
        _count: { _all: true },
      }),
      prisma.llmCall.groupBy({
        by: ["model"],
        where: { at: { gte: desde30 } },
        _count: { _all: true },
        orderBy: { _count: { model: "desc" } },
        take: 3,
      }),
    ]);

    return {
      costo30: t30._sum.costUsd ?? 0,
      llamadas30: t30._count._all,
      costo7: t7._sum.costUsd ?? 0,
      llamadas7: t7._count._all,
      modelos: modelos.map((m) => ({ model: m.model, llamadas: m._count._all })),
    };
  } catch {
    return null;
  }
}
