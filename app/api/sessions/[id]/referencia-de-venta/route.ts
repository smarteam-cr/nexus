/**
 * /api/sessions/[id]/referencia-de-venta — marcar o quitar una reunión como referencia de lo que sí es una reunión de
 * venta consultiva (S1, 2026-10-25).
 *
 *   PUT { nota? }  → la marca
 *   DELETE         → la quita
 *
 * Pide acceso a la reunión y ser super admin (`veElAnalizador`). Lo demás: lib/analizador-venta/referencia-server.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { guardAccesoALaReunion } from "@/lib/sessions/acceso-a-la-reunion";
import { marcarReferencia, quitarReferencia } from "@/lib/analizador-venta/referencia-server";
import { veElAnalizador } from "@/lib/analizador-venta/reglas";

type Params = { params: Promise<{ id: string }> };

const Marcar = z.object({ nota: z.string().max(500).nullish() });

async function guarda(id: string) {
  const acceso = await guardAccesoALaReunion(id);
  if (acceso instanceof NextResponse) return acceso;
  if (!veElAnalizador(acceso.user.teamMember?.roleEnum)) return NextResponse.json({ error: "El analizador de reuniones de venta todavía está en prueba." }, { status: 403 });
  return acceso;
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const acceso = await guarda(id);
  if (acceso instanceof NextResponse) return acceso;
  const parsed = Marcar.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return cuerpoInvalido(parsed.error);
  try {
    const r = await marcarReferencia(id, { por: acceso.user.email, nota: parsed.data.nota });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (esquemaDesactualizado(e)) return NextResponse.json({ error: "A la base le falta el SQL 2026-10-26-analizador-venta.sql." }, { status: 503 });
    throw e;
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const acceso = await guarda(id);
  if (acceso instanceof NextResponse) return acceso;
  try {
    await quitarReferencia(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (esquemaDesactualizado(e)) return NextResponse.json({ error: "A la base le falta el SQL 2026-10-26-analizador-venta.sql." }, { status: 503 });
    throw e;
  }
}
