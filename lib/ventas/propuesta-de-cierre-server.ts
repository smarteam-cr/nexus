/**
 * lib/ventas/propuesta-de-cierre-server.ts — arma y guarda la propuesta de fecha de cierre y monto de un negocio
 * (2026-10-14). SERVER-ONLY. Corre cuando el vendedor abre la pregunta, no con cada reunión.
 *
 * Fuentes, todas de ESTA empresa:
 *   · el siguiente paso del negocio en HubSpot;
 *   · el registro de la empresa en HubSpot (notas, llamadas y reuniones de los últimos 120 días);
 *   · las reuniones de Nexus con la empresa, por el chokepoint (`getClientSessions`): su resumen y su minuta.
 * Se guarda en `NegocioAbierto.propuesta` y sirve 24 horas, salvo que el negocio tenga actividad nueva.
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getAnthropic } from "@/lib/anthropic";
import { conContextoDeIA } from "@/lib/ai/contexto-de-corrida";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { fetchCompanyTimelineItems } from "@/lib/hubspot/company-timeline";
import { getClientSessions } from "@/lib/sessions/project-sources";
import { resumenDeReunion } from "@/lib/contexto/material-cronograma";
import { crDateParts } from "@/lib/jobs/time";
import { fechaCorta, type PropuestaDeCierre } from "./negocios";
import { leerPropuestaDeCierre, pedidoDeCierre, VIDA_DE_LA_PROPUESTA_MS, type FuenteDeCierre } from "./propuesta-de-cierre";

const DIAS_DEL_REGISTRO = 120;
const MAX_REUNIONES = 6;
const MAX_POR_FUENTE = 3_500;

/** ¿La propuesta guardada todavía sirve? */
export function propuestaVigente(p: PropuestaDeCierre | null, ultimaActividad: Date | null, ahora: Date): boolean {
  if (!p?.calculadaAt) return false;
  const t = Date.parse(p.calculadaAt);
  if (ahora.getTime() - t > VIDA_DE_LA_PROPUESTA_MS) return false;
  return !ultimaActividad || ultimaActividad.getTime() <= t;
}

async function fuentesDelNegocio(n: {
  siguientePasoHubspot: string | null;
  hubspotCompanyId: string | null;
  clientId: string | null;
}, ahora: Date): Promise<FuenteDeCierre[]> {
  const fuentes: FuenteDeCierre[] = [];
  if (n.siguientePasoHubspot?.trim()) fuentes.push({ rotulo: "Siguiente paso en HubSpot", texto: n.siguientePasoHubspot.trim() });

  if (n.hubspotCompanyId) {
    try {
      const hs = await getSystemHubspotClient();
      const items = await fetchCompanyTimelineItems(hs, n.hubspotCompanyId, {
        since: new Date(ahora.getTime() - DIAS_DEL_REGISTRO * 86_400_000),
        grabaciones: false,
      });
      const tipo = { NOTE: "nota", CALL: "llamada", MEETING: "reunión" } as const;
      for (const i of items.slice(0, 8)) {
        if (!i.body.trim()) continue;
        const dia = new Date(i.ts).toISOString().slice(0, 10);
        fuentes.push({ rotulo: `HubSpot · ${tipo[i.type]} del ${fechaCorta(dia)}`, texto: i.body.slice(0, MAX_POR_FUENTE) });
      }
    } catch {
      /* sin el registro de HubSpot, se propone con lo demás */
    }
  }

  if (n.clientId) {
    const sesiones = await getClientSessions(n.clientId, { take: MAX_REUNIONES });
    if (sesiones.length) {
      const filas = await prisma.firefliesSession.findMany({
        where: { id: { in: sesiones.map((s) => s.id) } },
        select: {
          id: true,
          title: true,
          date: true,
          summary: true,
          minute: { select: { summary: true, decisions: true, agreements: true, risks: true, status: true } },
        },
        orderBy: { date: "desc" },
      });
      for (const f of filas) {
        const texto = resumenDeReunion({ title: f.title, summary: f.summary, minuta: f.minute }).texto.trim();
        if (!texto) continue;
        const dia = crDateParts(f.date).dateKey;
        fuentes.push({ rotulo: `Reunión «${f.title}» del ${fechaCorta(dia)}`, texto: texto.slice(0, MAX_POR_FUENTE) });
      }
    }
  }
  return fuentes;
}

/**
 * La propuesta del negocio: la guardada si todavía sirve, o una nueva. null si al negocio no le falta nada.
 * Nunca lanza por la IA: si el modelo falla, devuelve una propuesta vacía (la pregunta se contesta igual).
 */
export async function propuestaDelNegocio(id: string, quien: string, ahora = new Date()): Promise<PropuestaDeCierre | null> {
  const n = await prisma.negocioAbierto.findUnique({ where: { id }, include: { client: { select: { name: true } } } });
  if (!n || !n.abierto) return null;
  const hoyISO = crDateParts(ahora).dateKey;
  const fechaHoy = n.fechaCierre?.toISOString().slice(0, 10) ?? null;
  const falta = { fecha: !fechaHoy || fechaHoy < hoyISO, monto: n.monto === null };
  if (!falta.fecha && !falta.monto) return null;

  const guardada = (n.propuesta as PropuestaDeCierre | null) ?? null;
  if (propuestaVigente(guardada, n.ultimaActividadAt, ahora)) return guardada;

  const fuentes = await fuentesDelNegocio(n, ahora);
  let propuesta: PropuestaDeCierre = { calculadaAt: ahora.toISOString() };
  if (fuentes.length) {
    try {
      const pedido = pedidoDeCierre({
        negocio: n.nombre,
        empresa: n.client?.name ?? n.empresaNombre ?? "la empresa",
        etapa: n.etapaLabel ?? n.etapaId,
        moneda: n.moneda,
        falta,
        hoyISO,
        fuentes,
      });
      const respuesta = await conContextoDeIA(
        { agentSlug: "propuesta-de-cierre", clientId: n.clientId, triggeredByEmail: quien, origen: "ventas/propuesta-de-cierre" },
        () => getAnthropic().messages.create(pedido),
      );
      propuesta = leerPropuestaDeCierre(respuesta, { fuentes, hoyISO, moneda: n.moneda, falta, ahora });
    } catch (e) {
      console.error(`[ventas/propuesta-de-cierre] ${n.hubspotDealId}: ${e instanceof Error ? e.message : String(e)}`);
      return guardada ?? { calculadaAt: ahora.toISOString() };
    }
  }
  await prisma.negocioAbierto.update({ where: { id }, data: { propuesta: propuesta as unknown as Prisma.InputJsonValue } });
  return propuesta;
}
