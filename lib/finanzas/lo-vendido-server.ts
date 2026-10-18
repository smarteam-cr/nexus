/**
 * lib/finanzas/lo-vendido-server.ts — carga las propuestas ganadas para el lector de lo vendido (2026-10-18). Las reglas
 * viven en lib/finanzas/lo-vendido.ts (puro); acá solo se lee la base.
 *
 * Ganada = el trato de HubSpot de la propuesta (`BusinessCase.hubspotDealId`) está en `VentaGanada` como GANADA, no
 * excluido y de venta propia (la misma regla que el vendido del punto de equilibrio). Si dos propuestas apuntan al
 * mismo trato se lee la publicada más reciente: es la que vio el cliente.
 *
 * De cada propuesta se lee la versión ACTIVA (la que el vendedor deja a la vista), no el snapshot publicado: el
 * snapshot va sin lo interno (lib/landing/inversion-costo.ts), y es justo lo interno lo que necesita Finanzas.
 */
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { PIPELINES_VENTA_PROPIA } from "@/lib/ventas/pipelines";
import { INVERSION_SECTION_KEY } from "@/lib/landing/inversion";
import { leerLoVendido, type LoVendidoDePropuesta, type PropuestaGanada } from "./lo-vendido";

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Las propuestas ganadas con su inversión, listas para `leerLoVendido`. `anio` acota por la fecha de cierre. */
export async function cargarPropuestasGanadas(opciones?: { anio?: number }): Promise<PropuestaGanada[]> {
  const propuestas = await prisma.businessCase.findMany({
    where: { hubspotDealId: { not: null } },
    select: {
      id: true,
      name: true,
      hubspotDealId: true,
      publishedAt: true,
      updatedAt: true,
      clientId: true,
      client: { select: { name: true, cuentaFinanciera: { select: { id: true } } } },
    },
  });
  const deals = [...new Set(propuestas.map((p) => p.hubspotDealId!))];
  if (!deals.length) return [];

  const anio = opciones?.anio;
  const ventas = await prisma.ventaGanada.findMany({
    where: {
      hubspotDealId: { in: deals },
      estado: "GANADA",
      excluida: false,
      pipelineId: { in: [...PIPELINES_VENTA_PROPIA] },
      ...(anio ? { fechaCierre: { gte: new Date(`${anio}-01-01`), lte: new Date(`${anio}-12-31`) } } : {}),
    },
    select: { hubspotDealId: true, fechaCierre: true, moneda: true },
  });
  const ventaPorDeal = new Map(ventas.map((v) => [v.hubspotDealId, v]));

  // Una propuesta por trato: la publicada más reciente, y si ninguna se publicó, la última que se tocó.
  const porDeal = new Map<string, (typeof propuestas)[number]>();
  for (const p of propuestas) {
    if (!ventaPorDeal.has(p.hubspotDealId!)) continue;
    const otra = porDeal.get(p.hubspotDealId!);
    const clave = (x: typeof p) => `${x.publishedAt?.toISOString() ?? "0"}|${x.updatedAt.toISOString()}`;
    if (!otra || clave(p) > clave(otra)) porDeal.set(p.hubspotDealId!, p);
  }
  const elegidas = [...porDeal.values()];
  if (!elegidas.length) return [];

  const versiones = await prisma.projectCanvas.findMany({
    where: { businessCaseId: { in: elegidas.map((p) => p.id) }, version: { gt: 0 } },
    select: {
      id: true,
      businessCaseId: true,
      name: true,
      version: true,
      isActive: true,
      canvasSections: {
        where: { key: INVERSION_SECTION_KEY },
        select: {
          blocks: { where: { status: "CONFIRMED" }, orderBy: { order: "asc" }, select: { data: true }, take: 1 },
        },
      },
    },
  });

  return elegidas.map((p) => {
    const venta = ventaPorDeal.get(p.hubspotDealId!)!;
    // La activa; si ninguna lo está, la de versión más alta.
    const suyas = versiones.filter((v) => v.businessCaseId === p.id).sort((a, b) => b.version - a.version);
    const leida = suyas.find((v) => v.isActive) ?? suyas[0] ?? null;
    return {
      businessCaseId: p.id,
      nombre: p.name,
      clientId: p.clientId,
      clienteNombre: p.client.name,
      cuentaId: p.client.cuentaFinanciera?.id ?? null,
      versionLeida: leida?.name ?? null,
      hubspotDealId: p.hubspotDealId!,
      fechaCierre: iso(venta.fechaCierre),
      monedaDeLaVenta: venta.moneda || null,
      inversion: leida?.canvasSections[0]?.blocks[0]?.data ?? null,
    };
  });
}

/**
 * Lo vendido de las propuestas ganadas. ⚠ Si una tabla no existe (un SQL sin aplicar) devuelve [] y lo dice en el log:
 * el equilibrio sigue con la carga a mano, que es lo que hacía antes. Cualquier otro error se relanza.
 */
export async function cargarLoVendido(opciones?: { anio?: number }): Promise<LoVendidoDePropuesta[]> {
  try {
    return (await cargarPropuestasGanadas(opciones)).map(leerLoVendido);
  } catch (e) {
    if (!esquemaDesactualizado(e)) throw e;
    console.warn("[equilibrio] no se pudo leer lo vendido de las propuestas (¿falta un SQL?): sigue la carga a mano");
    return [];
  }
}
