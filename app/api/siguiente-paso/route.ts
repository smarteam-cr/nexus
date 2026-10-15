/**
 * POST /api/siguiente-paso   body: { objeto, objetoId, equipo, que, fecha?, responsableEmail? }
 *
 * Fija el siguiente paso de un equipo sobre una empresa, un negocio o un proyecto (2026-10-15, etapa 2 de
 * docs/mi-dia-plan.md). Se guarda en Nexus y se escribe en HubSpot; si HubSpot no responde, queda pendiente y el job
 * `negocios-abiertos` lo reintenta. Pide un usuario interno; el equipo tiene que ser el suyo y el objeto, uno al que
 * tiene acceso (lib/siguiente-paso/escritura-server.ts).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { NuevoPasoSchema } from "@/lib/siguiente-paso/schema";
import { ErrorDelPaso, fijarSiguientePaso } from "@/lib/siguiente-paso/escritura-server";

export async function POST(req: NextRequest) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "El cuerpo no es JSON." }, { status: 400 });
  }
  const parsed = NuevoPasoSchema.safeParse(raw);
  if (!parsed.success) return cuerpoInvalido(parsed.error);

  try {
    const p = await fijarSiguientePaso(guard.teamMember, { ...parsed.data, fecha: parsed.data.fecha ?? null });
    return NextResponse.json({ ok: true, id: p.id, hubspotEstado: p.hubspotEstado, hubspotError: p.hubspotError });
  } catch (e) {
    if (e instanceof ErrorDelPaso) return NextResponse.json({ error: e.message }, { status: e.status });
    if (esquemaDesactualizado(e)) return NextResponse.json({ error: "Falta aplicar scripts/sql/2026-10-15-siguiente-paso.sql." }, { status: 503 });
    throw e;
  }
}
