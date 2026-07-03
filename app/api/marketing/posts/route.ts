/**
 * /api/marketing/posts — stats de posts de inspiración para /contenido
 * (total, en ventana de 3 meses, por fuente). Lectura: cualquier interno.
 */
import { NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { getPostsStats, getSources } from "@/lib/marketing/queries";

export async function GET() {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const [stats, sources] = await Promise.all([getPostsStats(), getSources()]);
  return NextResponse.json({
    stats,
    sources: sources.map((s) => ({
      id: s.id,
      label: s.label ?? s.profileUrl.replace(/^https?:\/\/(www\.)?/, ""),
      active: s.active,
      posts: s._count.posts,
      lastFetchedAt: s.lastFetchedAt,
      lastFetchError: s.lastFetchError,
    })),
  });
}
