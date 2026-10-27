/**
 * POST /api/sales/exploraciones/[id]/analisis-de-venta/revision — la revisión del análisis de una sesión (S4, 2026-10-27).
 *
 *   { accion: "confirmar", sessionId, analizadoAt, nota? }   → 409 si el análisis cambió
 *   { accion: "desconfirmar", sessionId }
 * (La referencia se quitó el 2026-10-27: Elías.)
 *
 * Pide `preventa.write` y, mientras se prueba, ser super admin (lib/analizador-venta/guardia-server.ts). La reunión tiene
 * que ser de la empresa de la preventa (el chokepoint, invariante 1). Lo demás: lib/analizador-venta/revision-server.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { esReunionDeLaEmpresa, guardDelAnalisisDeVenta } from "@/lib/analizador-venta/guardia-server";
import { RevisionSchema } from "@/lib/analizador-venta/schema";
import { confirmarAnalisis, desconfirmarAnalisis, type ResultadoDeRevisar } from "@/lib/analizador-venta/revision-server";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const g = await guardDelAnalisisDeVenta(id, "write");
  if (g instanceof NextResponse) return g;
  const cuerpo = RevisionSchema.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return cuerpoInvalido(cuerpo.error);
  const b = cuerpo.data;
  if (!(await esReunionDeLaEmpresa(g.clientId, b.sessionId))) return NextResponse.json({ error: "Esa reunión no es de esta empresa o todavía no ocurrió." }, { status: 404 });
  try {
    let r: ResultadoDeRevisar;
    switch (b.accion) {
      case "confirmar":
        r = await confirmarAnalisis(b.sessionId, { por: g.email, nota: b.nota ?? null, analizadoAt: b.analizadoAt });
        break;
      case "desconfirmar":
        r = await desconfirmarAnalisis(b.sessionId);
        break;
    }
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (esquemaDesactualizado(e)) return NextResponse.json({ error: "A la base le falta el SQL 2026-10-27-analisis-de-venta.sql." }, { status: 503 });
    throw e;
  }
}
