import { NextResponse, type NextRequest } from "next/server";
import { guardAccessToClient } from "@/lib/auth/api-guards";
import { apiError } from "@/lib/api";
import { agregarReunionSchema } from "@/lib/sessions/reunion-a-mano-schema";
import { agregarReunion, opcionesParaAgregar } from "@/lib/sessions/reunion-a-mano-server";

/**
 * /api/clients/[id]/reuniones-a-mano — «Agregar una reunión» (etapa 4f del roadmap de «Para ti», 2026-10-15).
 *
 *   GET  ?fecha=AAAA-MM-DD → los proyectos del cliente, el equipo y las reuniones de ese día (para preguntar si es una).
 *   POST                   → agrega una reunión nueva, o lo que pasó en una de Meet sin transcripción ni notas.
 *
 * Lo puede hacer cualquiera con acceso al cliente, de cualquier equipo. Las reglas viven en
 * lib/sessions/reunion-a-mano-server.ts.
 */

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;
  const fecha = req.nextUrl.searchParams.get("fecha");
  const opciones = await opcionesParaAgregar(id, fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null);
  if (!opciones) return apiError("Ese cliente no existe.", 404);
  return NextResponse.json(opciones);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;

  const body = await req.json().catch(() => null);
  const parsed = agregarReunionSchema.safeParse({ ...(body && typeof body === "object" ? body : {}), clientId: id });
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Faltan datos de la reunión.", 400);

  const r = await agregarReunion(parsed.data, {
    email: guard.user.email,
    nombre: guard.user.teamMember?.name ?? null,
  });
  if (!r.ok) return NextResponse.json({ error: r.error, reunionesDelDia: r.reunionesDelDia }, { status: r.status });
  return NextResponse.json(r, { status: r.nueva ? 201 : 200 });
}
