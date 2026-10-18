/**
 * lib/cs/avisos-de-renovacion.ts — las licencias de un cliente (HubSpot + lo cargado a mano) y el
 * AVISO con anticipación de sus renovaciones (2026-10-02). La regla vive en `lib/cs/licencias.ts`.
 *
 * El aviso es DETERMINISTA (sin IA): un job diario recorre los clientes con licencias y, a 90, 60 y
 * 30 días de cada renovación, deja una alerta de «Renovación» en Éxito del cliente, una por cliente,
 * fecha y umbral, con todos los hubs que renuevan ese día (hasta el 2026-10-16, una por hub; la llave
 * lo garantiza: correr dos veces no duplica). Antes la renovación solo
 * la miraba el vigilante con IA, que en producción no corre desde julio.
 *
 * Y se CIERRA sola (2026-10-07) cuando deja de corresponder: la renovación pasó, cambió de fecha o
 * ya cruzó al umbral siguiente, que tiene su propio aviso. Antes quedaban abiertas para siempre: el
 * 7 de octubre eran 38 de las 105 alertas abiertas de la cartera. Una que la CSL cerró a mano no
 * vuelve en el mismo umbral; el umbral siguiente sí sale, porque la renovación está más cerca.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { fechaLocalDeLaReunion } from "@/lib/sessions/compromisos-y-alcance";
import {
  CIERRE_DEL_SISTEMA,
  PREFIJO_DE_RENOVACION,
  avisosQueYaNoCorresponden,
  esLlaveViejaDelAviso,
  evidenciaJuntoALaRegla,
  llaveDelAviso,
  llavesViejasDelAviso,
  razonJuntoALaRegla,
} from "./alertas-reglas";
import { PREFIJO_DE_LA_LECTURA } from "./alertas-de-la-lectura";
import { CLIENTE_NO_EXCLIENTE_WHERE } from "./exclientes";

import { avisosDelCliente, combinarLicencias, licenciasDesdePartner, lineaDelAvisoDeLaFecha, severidadDelAviso, type LicenciaDeHub } from "./licencias";

const RANGO: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

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

/**
 * Una pasada: crea los avisos que tocan hoy y cierra los que ya no corresponden.
 *
 * Desde el 2026-10-16 (fase 1.2 de docs/nexus-sistema-de-trabajo-plan.md) es UN aviso por fecha de renovación, con
 * todos los hubs que renuevan ese día, y se junta con la renovación que vio el vigía: si el vigía ya tenía abierta una
 * alerta de renovación de la cuenta, el aviso la absorbe (conserva lo que vio el agente) en vez de nacer al lado.
 */
export async function correrAvisosDeRenovacion(
  ahora: Date,
): Promise<{ creados: number; juntados: number; cerrados: number; revisados: number }> {
  const hoy = fechaLocalDeLaReunion(ahora);
  const clientes = await prisma.client.findMany({
    // Un excliente confirmado no recibe avisos de renovación (lib/cs/exclientes.ts).
    where: { AND: [{ OR: [{ partnerSnapshot: { isNot: null } }, { licencias: { some: {} } }] }, CLIENTE_NO_EXCLIENTE_WHERE] },
    select: { id: true, name: true },
  });
  let creados = 0;
  let juntados = 0;
  const llavesDeHoy = new Set<string>();
  for (const cliente of clientes) {
    const { licencias } = await cargarLicenciasDelCliente(cliente.id);
    for (const aviso of avisosDelCliente(licencias, hoy)) {
      const dedupeKey = llaveDelAviso(cliente.id, aviso.renovacion, aviso.umbral);
      llavesDeHoy.add(dedupeKey);
      const ya = await prisma.csAlert.findFirst({ where: { dedupeKey }, select: { id: true } });
      if (ya) continue;
      // Lo que la CSL cerró con la llave de antes (una por hub) no vuelve en el mismo umbral.
      const viejas = llavesViejasDelAviso(cliente.id, aviso.licencias.map((l) => l.hub), aviso.renovacion, aviso.umbral);
      const cerradaAntes = await prisma.csAlert.findFirst({
        where: { dedupeKey: { in: viejas }, status: { in: ["RESOLVED", "DISMISSED"] }, NOT: { resolvedByEmail: CIERRE_DEL_SISTEMA } },
        select: { id: true },
      });
      if (cerradaAntes) continue;

      const linea = lineaDelAvisoDeLaFecha(aviso);
      const severity = severidadDelAviso(aviso.umbral);
      const deLaRegla = {
        hubs: aviso.licencias.map((l) => l.hub),
        renovacion: aviso.renovacion,
        umbral: aviso.umbral,
        fuente: aviso.licencias[0].fuenteRenovacion,
        lineaDeLaRegla: linea,
      };
      const title = `Renovación en ${aviso.dias} días · ${cliente.name}`;
      const suggestedAction =
        "Revisa con el cliente el uso de la licencia antes de la renovación: es el momento de ajustar el plan o proponer una expansión.";

      // La renovación que ya vio el vigía se junta con el aviso, en vez de quedar dos alertas de lo mismo.
      const delVigia = await prisma.csAlert.findFirst({
        where: {
          clientId: cliente.id,
          category: "RENEWAL_RISK",
          status: { in: ["OPEN", "SEEN"] },
          NOT: [{ dedupeKey: { startsWith: PREFIJO_DE_RENOVACION } }, { dedupeKey: { startsWith: PREFIJO_DE_LA_LECTURA } }],
        },
        orderBy: { lastDetectedAt: "desc" },
        select: { id: true, reason: true, severity: true, evidence: true, suggestedAction: true },
      });
      if (delVigia) {
        await prisma.csAlert.update({
          where: { id: delVigia.id },
          data: {
            dedupeKey,
            projectId: null,
            title,
            reason: razonJuntoALaRegla(linea, delVigia.reason),
            severity: (RANGO[severity] ?? 0) > (RANGO[delVigia.severity] ?? 0) ? severity : delVigia.severity,
            suggestedAction: delVigia.suggestedAction ?? suggestedAction,
            evidence: evidenciaJuntoALaRegla(deLaRegla, delVigia.evidence, linea) as Prisma.InputJsonValue,
          },
        });
        juntados++;
        continue;
      }
      await prisma.csAlert.create({
        data: {
          clientId: cliente.id,
          projectId: null,
          severity,
          category: "RENEWAL_RISK",
          title,
          reason: linea,
          suggestedAction,
          evidence: deLaRegla,
          dedupeKey,
        },
      });
      creados++;
    }
  }

  // Los abiertos que hoy ya no tocan se cierran solos, firmados por el sistema y con su porqué.
  const abiertos = await prisma.csAlert.findMany({
    // Los de un excliente no se tocan acá: no se muestran, y cerrarlos con «la renovación ya pasó» diría algo falso. Los
    // cierra scripts/cerrar-alertas-de-exclientes.ts, con su nota.
    where: { dedupeKey: { startsWith: PREFIJO_DE_RENOVACION }, status: { in: ["OPEN", "SEEN"] }, client: CLIENTE_NO_EXCLIENTE_WHERE },
    select: { id: true, dedupeKey: true },

  });
  const sobran = new Set(avisosQueYaNoCorresponden(abiertos, llavesDeHoy));
  const viejos = abiertos.filter((a) => sobran.has(a.id) && esLlaveViejaDelAviso(a.dedupeKey)).map((a) => a.id);
  const vencidos = [...sobran].filter((id) => !viejos.includes(id));
  const cerrar = async (ids: string[], nota: string) => {
    if (ids.length === 0) return;
    await prisma.csAlert.updateMany({
      where: { id: { in: ids }, status: { in: ["OPEN", "SEEN"] } },
      data: { status: "RESOLVED", resolvedAt: ahora, resolvedByEmail: CIERRE_DEL_SISTEMA, resolutionNote: nota },
    });
  };
  await cerrar(vencidos, "Se cerró sola: la renovación ya pasó, cambió de fecha o tiene un aviso más cercano.");
  await cerrar(viejos, "Se cerró sola: ahora hay un solo aviso por fecha de renovación, con todos sus hubs.");
  return { creados, juntados, cerrados: sobran.size, revisados: clientes.length };
}
