/**
 * POST /api/siguiente-paso/[id]/hecho — da por hecho un siguiente paso vigente (2026-10-15). Lo borra de HubSpot (las
 * tres propiedades del equipo quedan vacías) y la historia queda en Nexus. Lo puede quien lo lleva o alguien de su
 * equipo, con acceso a la cuenta.
 */
import { NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { ErrorDelPaso, darPorHecho } from "@/lib/siguiente-paso/escritura-server";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  try {
    const p = await darPorHecho(guard.teamMember, id);
    return NextResponse.json({ ok: true, hubspotEstado: p.hubspotEstado });
  } catch (e) {
    if (e instanceof ErrorDelPaso) return NextResponse.json({ error: e.message }, { status: e.status });
    if (esquemaDesactualizado(e)) return NextResponse.json({ error: "Falta aplicar scripts/sql/2026-10-15-siguiente-paso.sql." }, { status: 503 });
    throw e;
  }
}
