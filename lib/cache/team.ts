/**
 * lib/cache/team.ts
 *
 * Wrapper cacheado de `prisma.teamMember.findMany`. TeamMembers cambian poco
 * (~10-20 personas) y se consultan en cada render de /sessions.
 *
 * Invalidación:
 *   - TTL automático (10 min)
 *   - Mutaciones de TeamMember deben llamar `revalidateTeamMembers()`
 */

import { unstable_cache, revalidateTag } from "next/cache";
import { prisma } from "@/lib/db/prisma";

export const TEAM_MEMBERS_TAG = "team-members";

export const getTeamMembers = unstable_cache(
  async () => {
    return prisma.teamMember.findMany({
      select: { id: true, name: true, email: true, role: true },
    });
  },
  ["team-members"],
  { revalidate: 600, tags: [TEAM_MEMBERS_TAG] }
);

export function revalidateTeamMembers() {
  // Next 16: revalidateTag requiere un cache profile como 2do arg.
  revalidateTag(TEAM_MEMBERS_TAG, "default");
}
