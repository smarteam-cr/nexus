/**
 * lib/cache/clients.ts
 *
 * Wrapper cacheado de `prisma.client.findMany` para el sidebar de AppShell.
 *
 * Se ejecuta en CADA navegación dentro de la app (AppShell envuelve casi todas
 * las páginas), así que es el query más caliente del proyecto. Con `unstable_cache`
 * lo bajamos a 1 RTT a Supabase cada `revalidate` segundos.
 *
 * El orden es por **última actividad pasada** (no por createdAt) — así los
 * clientes "activos" suben y los dormidos bajan. Reusa el helper
 * `computeClientActivityMap`.
 *
 * Invalidación:
 *   - TTL automático (revalidate)
 *   - Mutaciones de Client deben llamar `revalidateTag("clients-sidebar")`
 *     después del create/update/delete (ver app/api/clients/**.route.ts).
 */

import { unstable_cache, revalidateTag } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { computeClientActivityMap } from "@/lib/clients/last-interaction";

/** Tag de cache — usar también en `revalidateTag()` desde mutaciones. */
export const CLIENTS_SIDEBAR_TAG = "clients-sidebar";

export const getClientsForSidebar = unstable_cache(
  async () => {
    // 1. Cargar todos los clientes con los campos básicos del sidebar
    const rows = await prisma.client.findMany({
      where: { isProspect: false }, // los prospectos de Ventas (business cases) no van al sidebar de CS
      select: {
        id: true,
        name: true,
        company: true,
        emailDomains: true,
        hubspotAccount: { select: { id: true, hubName: true } },
      },
    });

    if (rows.length === 0) return [];

    // 2. Calcular actividad por cliente (sesiones pasadas + notas + runs)
    const activityMap = await computeClientActivityMap(
      rows.map((c) => ({
        id: c.id,
        name: c.name,
        company: c.company,
        emailDomains: c.emailDomains,
      })),
    );

    // 3. Decorar y ordenar por última actividad PASADA DESC. Los clientes sin
    //    actividad pasada van al final (ordenados alfabético entre sí).
    const decorated = rows.map((c) => ({
      id: c.id,
      name: c.name,
      company: c.company,
      hubspotAccount: c.hubspotAccount,
      lastActivityAt: activityMap.get(c.id)?.lastActivity?.date ?? null,
    }));

    decorated.sort((a, b) => {
      const at = a.lastActivityAt?.getTime() ?? 0;
      const bt = b.lastActivityAt?.getTime() ?? 0;
      if (at !== bt) return bt - at;
      return (a.name ?? "").localeCompare(b.name ?? "");
    });

    return decorated;
  },
  ["clients-sidebar"],
  { revalidate: 60, tags: [CLIENTS_SIDEBAR_TAG] }
);

/**
 * Invalidar el cache del sidebar de clientes. Llamar después de cualquier
 * mutación que cambie `name`, `company`, o la asociación con `hubspotAccount`.
 *
 * Mutaciones que SÍ afectan: create/update/delete de Client, conectar/desconectar
 * hubspotAccount.
 *
 * Mutaciones que NO afectan (no llamar): cambios en `canvas`, en `emailDomains`,
 * en relaciones sessions/projects/cards, etc.
 */
export function revalidateClientsSidebar() {
  // Next 16: revalidateTag requiere un cache profile como 2do arg.
  // "default" mapea al perfil estándar (stale 5m, revalidate 15m).
  revalidateTag(CLIENTS_SIDEBAR_TAG, "default");
}
