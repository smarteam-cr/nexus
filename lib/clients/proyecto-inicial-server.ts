/**
 * lib/clients/proyecto-inicial-server.ts — los datos que la regla pura (proyecto-inicial.ts) necesita y que no están en
 * la fila del proyecto: quién mira (correo y rol) y, solo para Ventas, de qué venta nació cada proyecto.
 *
 * La consulta de las ventas se paga solo cuando hace falta: quien mira es de Ventas y la cuenta tiene más de un proyecto
 * real con trato de HubSpot. Al resto le alcanza con la fila.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { elegirProyectoDeLaFicha, type ProyectoElegido, type ProyectoParaAbrir, type QuienMira } from "./proyecto-inicial";

/** El SELECT de `Project` que pide la regla. Se suma al select de cada pantalla. */
export const SELECT_PARA_ELEGIR_PROYECTO = {
  id: true,
  esPrueba: true,
  hubspotOwnerEmail: true,
  hubspotPipelineId: true,
  hubspotDealId: true,
  hubspotStatus: true,
  hubspotPipelineStageLabel: true,
  hubspotUltimaActividad: true,
  createdAt: true,
} as const;

type FilaParaElegir = ProyectoParaAbrir & { hubspotDealId?: string | null };

/** Elige con la regla pura, sumando el vendedor de cada proyecto si quien mira es de Ventas. */
export async function elegirProyectoParaQuienMira(proyectos: FilaParaElegir[], quien: QuienMira): Promise<ProyectoElegido> {
  let filas: ProyectoParaAbrir[] = proyectos;
  const reales = proyectos.filter((p) => !p.esPrueba);
  const dealIds = [...new Set(reales.map((p) => p.hubspotDealId).filter((d): d is string => !!d))];
  if (quien.rol === "VENTAS" && reales.length > 1 && dealIds.length > 0) {
    const ventas = await prisma.ventaGanada
      .findMany({ where: { hubspotDealId: { in: dealIds } }, select: { hubspotDealId: true, vendedor: { select: { email: true } } } })
      .catch(() => []);
    const porTrato = new Map(ventas.map((v) => [v.hubspotDealId, v.vendedor?.email ?? null]));
    filas = proyectos.map((p) => ({ ...p, vendedorEmail: p.hubspotDealId ? porTrato.get(p.hubspotDealId) ?? null : null }));
  }
  return elegirProyectoDeLaFicha(filas, quien);
}
