/**
 * /api/marketing/ideas — ideas de contenido generadas (salida NO-CRUD).
 * GET ?pillarId=&runId= (cualquier interno). La única mutación es DELETE en [id].
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { getIdeas } from "@/lib/marketing/queries";

export async function GET(req: NextRequest) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;

  const sp = req.nextUrl.searchParams;
  const ideas = await getIdeas({
    pillarId: sp.get("pillarId") ?? undefined,
    runId: sp.get("runId") ?? undefined,
  });
  return NextResponse.json({ ideas });
}
