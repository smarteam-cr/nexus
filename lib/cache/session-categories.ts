/**
 * lib/cache/session-categories.ts
 *
 * Wrapper cacheado de `prisma.sessionCategory.findMany`. Las categorías
 * cambian raro (admin manual) y se consultan en cada render de /sessions.
 *
 * Invalidación:
 *   - TTL automático (10 min)
 *   - CRUD de SessionCategory (en /api/session-categories/**) debe llamar
 *     `revalidateSessionCategories()`.
 */

import { unstable_cache, revalidateTag } from "next/cache";
import { prisma } from "@/lib/db/prisma";

export const SESSION_CATEGORIES_TAG = "session-categories";

export const getSessionCategories = unstable_cache(
  async () => {
    return prisma.sessionCategory.findMany({
      orderBy: { order: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        domains: true,
        kind: true,
        color: true,
      },
    });
  },
  ["session-categories"],
  { revalidate: 600, tags: [SESSION_CATEGORIES_TAG] }
);

export function revalidateSessionCategories() {
  // Next 16: revalidateTag requiere un cache profile como 2do arg.
  revalidateTag(SESSION_CATEGORIES_TAG, "default");
}
