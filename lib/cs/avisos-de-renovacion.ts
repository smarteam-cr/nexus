/**
 * lib/cs/avisos-de-renovacion.ts — las licencias de un cliente (HubSpot + lo cargado a mano) y el
 * AVISO con anticipación de sus renovaciones (2026-10-02). La regla vive en `lib/cs/licencias.ts`.
 *
 * El aviso es DETERMINISTA (sin IA): un job diario recorre los clientes con licencias y, a 90, 60 y
 * 30 días de cada renovación, deja una alerta de «Renovación» en Éxito del cliente, una por cliente,
 * hub, fecha y umbral (la llave lo garantiza: correr dos veces no duplica). Antes la renovación solo
 * la miraba el vigilante con IA, que en producción no corre desde julio.
 */
import { prisma } from "@/lib/db/prisma";
import { fechaLocalDeLaReunion } from "@/lib/sessions/compromisos-y-alcance";
import {
  avisoDeRenovacion,
  combinarLicencias,
  licenciasDesdePartner,
  lineaDelAviso,
  severidadDelAviso,
  type LicenciaDeHub,
} from "./licencias";

export interface LicenciasDelCliente {
  licencias: LicenciaDeHub[];
  /** Cuándo se copió lo de HubSpot por última vez (ISO), o null si no hay copia. */
  datosDeHubspotAl: string | null;
}

export async function cargarLicenciasDelCliente(clientId: string): Promise<LicenciasDelCliente> {
  const [snapshot, manuales] = await Promise.all([
    prisma.clientPartnerSnapshot.findUnique({ where: { clientId }, select: { properties: true, fetchedAt: true } }),
    prisma.licenciaCliente.findMany({
      where: { clientId },
      select: { hub: true, plan: true, fechaCompra: true, fechaRenovacion: true, montoMensual: true, moneda: true, nota: true },
    }),
  ]);
  return {
    licencias: combinarLicencias(licenciasDesdePartner(snapshot?.properties), manuales),
    datosDeHubspotAl: snapshot?.fetchedAt?.toISOString() ?? null,
  };
}

/** Una pasada: crea los avisos que tocan hoy. Devuelve cuántos creó. */
export async function correrAvisosDeRenovacion(ahora: Date): Promise<{ creados: number; revisados: number }> {
  const hoy = fechaLocalDeLaReunion(ahora);
  const clientes = await prisma.client.findMany({
    where: { OR: [{ partnerSnapshot: { isNot: null } }, { licencias: { some: {} } }] },
    select: { id: true, name: true },
  });
  let creados = 0;
  for (const cliente of clientes) {
    const { licencias } = await cargarLicenciasDelCliente(cliente.id);
    for (const l of licencias) {
      const aviso = avisoDeRenovacion(l.renovacion, hoy);
      if (!aviso) continue;
      const dedupeKey = `renovacion:${cliente.id}:${l.hub}:${l.renovacion}:${aviso.umbral}`;
      const ya = await prisma.csAlert.findFirst({ where: { dedupeKey }, select: { id: true } });
      if (ya) continue;
      await prisma.csAlert.create({
        data: {
          clientId: cliente.id,
          projectId: null,
          severity: severidadDelAviso(aviso.umbral),
          category: "RENEWAL_RISK",
          title: `Renovación en ${aviso.dias} días · ${cliente.name}`,
          reason: lineaDelAviso(l, aviso.dias),
          suggestedAction:
            "Revisa con el cliente el uso de la licencia antes de la renovación: es el momento de ajustar el plan o proponer una expansión.",
          evidence: { hub: l.hub, renovacion: l.renovacion, umbral: aviso.umbral, fuente: l.fuenteRenovacion },
          dedupeKey,
        },
      });
      creados++;
    }
  }
  return { creados, revisados: clientes.length };
}
