/**
 * GET /api/escala/borrador/reportes?ancla=1.7.F1 — los reportes de feedback mandados sobre esa parte
 * de la escala, para verlos al editarla y vincular el cambio al reporte que lo originó.
 *
 * El feedback es privado: solo los super admin (los mismos que editan la escala y revisan el feedback).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { puedeEditarLaEscala } from "@/lib/escala/datos/reglas";
import { SOLO_SUPER_ADMIN } from "@/lib/escala/datos/respuestas";
import { reportesDelAncla } from "@/lib/escala/datos/servidor";

export async function GET(req: NextRequest) {
  const ctx = await guardInternalUser();
  if (ctx instanceof NextResponse) return ctx;
  if (!puedeEditarLaEscala(ctx.role)) return NextResponse.json({ error: SOLO_SUPER_ADMIN }, { status: 403 });
  const ancla = req.nextUrl.searchParams.get("ancla") ?? "";
  if (!/^\d+(\.\d+(\.[DIFEO](\d+)?)?)?$/.test(ancla)) return NextResponse.json({ error: "Ancla inválida." }, { status: 400 });
  return NextResponse.json({ reportes: await reportesDelAncla(ancla) });
}
