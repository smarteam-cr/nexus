/**
 * /api/sales/exploraciones/[id]/analisis-de-venta — el análisis de la venta consultiva de una preventa (S4 y S5,
 * 2026-10-27; antes vivía en Sesiones › «Reuniones de venta», que se retiró: S6).
 *
 *   GET                  → todas las reuniones de venta con la empresa, cada una con quién habló, su análisis y su revisión
 *   POST { sessionId }   → analiza (o vuelve a analizar) una de ellas. Gasta IA (unos diez centavos de dólar).
 *
 * Mirar pide `preventa.read`; analizar, `preventa.write`; y mientras se prueba, ser super admin
 * (lib/analizador-venta/guardia-server.ts). La reunión tiene que ser de la empresa de la preventa (el chokepoint,
 * invariante 1). Lo demás: lib/analizador-venta/pieza-server.ts y analizar-server.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { analizarReunionDeVenta } from "@/lib/analizador-venta/analizar-server";
import { esReunionDeLaEmpresa, guardDelAnalisisDeVenta } from "@/lib/analizador-venta/guardia-server";
import { analisisDelProspecto } from "@/lib/analizador-venta/pieza-server";
import { AnalizarSchema } from "@/lib/analizador-venta/schema";

type Ctx = { params: Promise<{ id: string }> };

const FALTA_EL_SQL = "A la base le falta el SQL del análisis de la venta (2026-10-26-analizador-venta.sql y 2026-10-27-analisis-de-venta.sql).";

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const g = await guardDelAnalisisDeVenta(id, "read");
  if (g instanceof NextResponse) return g;
  try {
    return NextResponse.json(await analisisDelProspecto(g.clientId));
  } catch (e) {
    if (esquemaDesactualizado(e)) return NextResponse.json({ error: FALTA_EL_SQL }, { status: 503 });
    throw e;
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const g = await guardDelAnalisisDeVenta(id, "write");
  if (g instanceof NextResponse) return g;
  const cuerpo = AnalizarSchema.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return cuerpoInvalido(cuerpo.error);
  if (!(await esReunionDeLaEmpresa(g.clientId, cuerpo.data.sessionId))) return NextResponse.json({ error: "Esa reunión no es de esta empresa o todavía no ocurrió." }, { status: 404 });
  try {
    const r = await analizarReunionDeVenta(cuerpo.data.sessionId, { pedidoPor: g.email });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, juicios: r.analisis.juicios.length, descartados: r.descartados });
  } catch (e) {
    if (esquemaDesactualizado(e)) return NextResponse.json({ error: FALTA_EL_SQL }, { status: 503 });
    throw e;
  }
}
