/**
 * lib/clients/lo-que-le-falta-comprar-server.ts — lo que le falta comprar a una empresa, con lo que hay en la base (R12,
 * 2026-10-25). SERVIDOR.
 *
 * Junta la posición de la empresa en la escala (la foto más reciente de una exploración viva, la misma que usa la
 * propuesta: lib/exploraciones/escala-de-la-empresa.ts › escalaParaLaPropuesta) y sus casos de uso, y se los pasa a la
 * regla pura (lo-que-le-falta-comprar.ts). Los hubs que le faltan los trae quien llama (la ruta de los datos ya los
 * calcula con el TAM v1 y la copia de Partner). Nunca lanza por la escala: sin ella, la regla usa los hubs.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { escalaParaLaPropuesta } from "@/lib/exploraciones/escala-de-la-empresa";
import type { AreaParaElCamino } from "@/lib/casos-de-uso/camino";
import type { Hub } from "@/lib/cs/licencias";
import { loQueLeFaltaComprar, type LoQueLeFaltaComprar } from "./lo-que-le-falta-comprar";

export async function loQueLeFaltaComprarDeLaEmpresa(clientId: string, hubsQueLeFaltan: readonly { hub: Hub }[]): Promise<LoQueLeFaltaComprar> {
  const [escala, casos] = await Promise.all([
    escalaParaLaPropuesta(clientId).catch((e) => {
      console.warn("[clients/lo-que-le-falta-comprar] sin la escala", e instanceof Error ? e.message : e);
      return null;
    }),
    prisma.casoDeUso.findMany({ where: { clientId }, select: { titulo: true, estado: true } }),
  ]);
  const areas: AreaParaElCamino[] | null = escala
    ? escala.map((a) => ({
        id: a.id,
        nombre: a.nombre,
        nivel: a.nivel,
        objetivo: a.objetivo,
        frena: a.frena,
        capas: a.capas,
        dimensiones: a.dimensiones.map((d) => ({ id: d.id, nombre: d.nombre, aplica: d.aplica, nivel: d.nivel, clase: d.clase })),
      }))
    : null;
  return loQueLeFaltaComprar({ escala: areas, casos, hubsQueLeFaltan });
}
