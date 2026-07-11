/**
 * /api/cobranza/series — serie histórica de métricas para las tendencias.
 *   GET → { series: SnapshotSerieDTO[] } (ascendente, solo snapshots CON métricas
 *         — los pre-fase-3 no son comparables y quedan fuera, sin backfill).
 * Acceso: guardCobranzaAccess (ADMIN + SUPER_ADMIN) — enforcement server-side.
 */
import { NextResponse } from "next/server";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import { loadSnapshotSeries } from "@/lib/cobranza/queries";

export async function GET() {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json({ series: await loadSnapshotSeries() });
}
