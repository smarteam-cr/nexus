/**
 * POST /api/sessions/[id]/audio/subido — el navegador terminó de subir el audio: se pide la transcripción (T5,
 * 2026-10-25). Pide acceso a la reunión. Lo demás: lib/sessions/audio-de-reunion-server.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { guardAccesoALaReunion } from "@/lib/sessions/acceso-a-la-reunion";
import { audioSubido } from "@/lib/sessions/audio-de-reunion-server";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const acceso = await guardAccesoALaReunion(id);
  if (acceso instanceof NextResponse) return acceso;
  try {
    const r = await audioSubido(id);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (esquemaDesactualizado(e)) return NextResponse.json({ error: "A la base le falta el SQL 2026-10-25-reuniones-parte-2.sql." }, { status: 503 });
    throw e;
  }
}
