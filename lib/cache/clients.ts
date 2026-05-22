/**
 * lib/cache/clients.ts
 *
 * Wrapper cacheado de `prisma.client.findMany` para el sidebar de AppShell.
 *
 * Se ejecuta en CADA navegación dentro de la app (AppShell envuelve casi todas
 * las páginas), así que es el query más caliente del proyecto. Con `unstable_cache`
 * lo bajamos a 1 RTT a Supabase cada `revalidate` segundos.
 *
 * Invalidación:
 *   - TTL automático (revalidate)
 *   - Mutaciones de Client deben llamar `revalidateTag("clients-sidebar")`
 *     después del create/update/delete (ver app/api/clients/**.route.ts).
 */

import { unstable_cache, revalidateTag } from "next/cache";
import { prisma } from "@/lib/db/prisma";

/** Tag de cache — usar también en `revalidateTag()` desde mutaciones. */
export const CLIENTS_SIDEBAR_TAG = "clients-sidebar";

export const getClientsForSidebar = unstable_cache(
  async () => {
    return prisma.client.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        company: true,
        hubspotAccount: { select: { id: true, hubName: true } },
      },
    });
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
