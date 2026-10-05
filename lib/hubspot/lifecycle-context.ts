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
import { nuevoRegistro } from "@/lib/auditoria-portal/lecturas";

export async function loadPortalLifecycleContext(clientId: string): Promise<string> {
  try {
    const account = await prisma.hubspotAccount.findFirst({
      where: { clientId, isSystem: false },
      select: { id: true },
    });
    if (!account) return "";

    const token = await getFreshToken(account.id);
    // La detección de workflows del ciclo de vida corre adentro (una sola llamada). Lo que no se
    // pudo leer queda en el registro y se dice como tal: un «0 contactos» que en realidad fue un
    // 403 llevaría al agente a proponer borrar una etapa que se usa.
    const registro = nuevoRegistro();
    const stats = await fetchLifecycleStats(token, registro);
    // Sin las etapas del portal, la lista es la de HubSpot por defecto: presentarla como «lo que
    // el portal usa HOY» sería falso. Mejor ninguna fuente que una inventada.
    if (registro.fallidas.some((f) => f.bloque === "etapas_del_portal")) return "";
    if (!stats.contacts.length) return "";

    const lineas = stats.contacts.map((c) =>
      c.count === null
        ? `- ${c.label} (${c.value}): no se pudo leer cuántos contactos hay`
        : `- ${c.label} (${c.value}): ${c.count} contactos`,
    );
    const wf =
      stats.lifecycleWorkflows === null
        ? "\nNo se pudo leer la lista de workflows del portal."
        : stats.lifecycleWorkflows.length
          ? `\nWorkflows activos que mueven el ciclo de vida: ${stats.lifecycleWorkflows.length}`
          : "";
    return `Etapas del ciclo de vida que el portal usa HOY:\n${lineas.join("\n")}${wf}`;
  } catch {
    // Token vencido, scopes insuficientes, portal caído: el plan sale igual, sin esta
    // fuente. Fallar acá sería dejar al CSE sin plan por un problema de conexión.
    return "";
  }
}
