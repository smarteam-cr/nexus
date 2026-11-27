import { NextResponse } from "next/server";
import { guardAccesoALaReunion } from "@/lib/sessions/acceso-a-la-reunion";
import { quienEstuvoEn } from "@/lib/sessions/quien-estuvo-server";

/**
 * GET /api/sessions/[id]/quien-estuvo — «Quién estuvo» de una reunión (2026-11-27): los invitados con su lado y su
 * respuesta y, si fue por Meet, quién entró y cuántos minutos. La regla, en lib/sessions/quien-estuvo.ts.
 *
 * Solo quien puede abrir la reunión (lib/sessions/acceso-a-la-reunion.ts): sin acceso o si no existe, 404 con el mismo
 * texto. Solo lectura.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const acceso = await guardAccesoALaReunion(id);
  if (acceso instanceof NextResponse) return acceso;
  const quienEstuvo = await quienEstuvoEn(id);
  if (!quienEstuvo) return NextResponse.json({ error: "No encuentro esa reunión." }, { status: 404 });
  return NextResponse.json({ quienEstuvo });
}
