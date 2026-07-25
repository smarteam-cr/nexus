/**
 * lib/hubspot/lifecycle-context.ts — las etapas del ciclo de vida REALES del portal
 * del cliente, serializadas para un agente.
 *
 * La Planificación define las etapas del ciclo de vida del CRM del cliente. La regla de
 * negocio es PARTIR de lo que el portal usa hoy (etiquetas reales, cuántos contactos hay
 * en cada una, qué workflows las mueven) y proponer solo cambios justificados — no
 * renombrar por gusto.
 *
 * Deliberadamente NO usa `buildLifecycleSnapshot`: ese camino arrastra el análisis de
 * asignación por owner (loop mensual con pausas contra la API de HubSpot — minutos que
 * un runner no puede pagar). Acá solo las dos llamadas baratas.
 *
 * Best-effort: sin cuenta conectada (o con token vencido) devuelve "" — el agente lo
 * trata como "no hay portal que mirar", que es la verdad.
 */
import { prisma } from "@/lib/db/prisma";
import { getFreshToken, fetchLifecycleStats } from "./portal-analyzer";

export async function loadPortalLifecycleContext(clientId: string): Promise<string> {
  try {
    const account = await prisma.hubspotAccount.findFirst({
      where: { clientId, isSystem: false },
      select: { id: true },
    });
    if (!account) return "";

    const token = await getFreshToken(account.id);
    // fetchLifecycleStats ya llama a las opciones adentro; el segundo argumento son los
    // workflows a inspeccionar — vacío: la detección de workflows del ciclo de vida es
    // parte del análisis de portal completo, no de este contexto barato.
    const stats = await fetchLifecycleStats(token, []);
    if (!stats.contacts.length) return "";

    const lineas = stats.contacts.map((c) => `- ${c.label} (${c.value}): ${c.count} contactos`);
    const wf = stats.lifecycleWorkflows?.length
      ? `\nWorkflows activos que mueven el ciclo de vida: ${stats.lifecycleWorkflows.length}`
      : "";
    return `Etapas del ciclo de vida que el portal usa HOY:\n${lineas.join("\n")}${wf}`;
  } catch {
    // Token vencido, scopes insuficientes, portal caído: el plan sale igual, sin esta
    // fuente. Fallar acá sería dejar al CSE sin plan por un problema de conexión.
    return "";
  }
}
