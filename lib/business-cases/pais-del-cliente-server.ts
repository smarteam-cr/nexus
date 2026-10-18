/**
 * lib/business-cases/pais-del-cliente-server.ts — lee de la base las tres fuentes del país del
 * cliente de una propuesta y las pasa por la regla pura (`paisDelCliente`). Solo lectura: tres
 * consultas chicas, en paralelo, al abrir el editor. No llama a HubSpot.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { paisDelCliente, type PaisDelCliente } from "./pais-del-cliente";

/** La preventa de donde salió la propuesta, o la más reciente de la empresa. */
async function paisDeLaPreventa(clientId: string, exploracionId: string | null): Promise<string | null> {
  const fila = await prisma.exploracionDeVenta.findFirst({
    where: exploracionId ? { id: exploracionId } : { clientId, projectId: null },
    orderBy: { updatedAt: "desc" },
    select: { contenido: true },
  });
  const medicion = (fila?.contenido as { medicion?: { pais?: unknown } } | null)?.medicion;
  return typeof medicion?.pais === "string" ? medicion.pais : null;
}

export async function cargarPaisDelCliente(clientId: string, exploracionId: string | null = null): Promise<PaisDelCliente> {
  const [cuenta, partner, preventa] = await Promise.all([
    prisma.cuentaFinanciera.findUnique({
      where: { clientId },
      select: { tipo: true, estadoCuenta: true, fuente: true, estadoActualizadoPor: true },
    }),
    prisma.clientPartnerSnapshot.findUnique({ where: { clientId }, select: { country: true } }),
    paisDeLaPreventa(clientId, exploracionId),
  ]);
  return paisDelCliente({ cuenta, hubspot: partner?.country ?? null, preventa });
}
