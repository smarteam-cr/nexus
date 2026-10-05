/**
 * GET /api/para-ti/equipo — «Del equipo» de «Para ti» (2026-10-04).
 *
 * Se pide recién cuando la persona abre esa pestaña: medir a todo el equipo cuesta más que medirse a uno mismo. Lo que
 * cada uno ve lo decide `medirEquipo` (quien no puede abrir toda la cartera ve solo los números).
 */
import { NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { alcanceDe } from "@/lib/para-ti/alcance-server";
import { medirEquipo } from "@/lib/para-ti/equipo-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guardInternalUser();
  if (g instanceof NextResponse) return g;
  const equipo = await medirEquipo(await alcanceDe(g.teamMember));
  return NextResponse.json(equipo, { headers: { "Cache-Control": "no-store" } });
}
