import { NextRequest, NextResponse } from "next/server";
import { syncProjectsForClient } from "@/lib/hubspot/sync-projects";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // force=1 saltea el cooldown en memoria (botón "Reintentar" del usuario). La auto-sync del
  // montaje NO lo pasa → respeta el cooldown y no re-sincroniza en cada navegación.
  const force = _req.nextUrl.searchParams.get("force") === "1";

  try {
    const result = await syncProjectsForClient(id, { force });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
