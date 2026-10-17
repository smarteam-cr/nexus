/**
 * POST /api/siguiente-paso/[id]/hecho — «Ya se hizo» (2026-10-15). Desde el 2026-10-16 (fase 0.2) `id` es el de la TAREA
 * que es el siguiente paso: queda hecha, con las reglas de Tareas (quién puede terminarla), y HubSpot se pone al día con
 * la tarea que sigue o, si no hay, las propiedades del equipo quedan vacías.
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
