/**
 * /api/tareas/espacios — los espacios libres (docs/tareas-plan.md §5.3).
 *
 * GET  → los que ves y donde estás («Tus espacios»).
 * POST → crear uno: nombre, quién lo ve y sus miembros. Quien lo crea queda como admin y nace con su primer proyecto.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { errorDeValidacion, leerCuerpo, prepararTareas, respuestaDeError } from "@/lib/tareas/http";
import { cargarMisEspacios } from "@/lib/tareas/consultas";
import { crearEspacio } from "@/lib/tareas/mutaciones";
import { CrearEspacio } from "@/lib/tareas/schema";

export async function GET() {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  try {
    return NextResponse.json({ espacios: await cargarMisEspacios(p.ctx) });
  } catch (e) {
    return respuestaDeError(e);
  }
}

export async function POST(req: NextRequest) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  const body = await leerCuerpo(req);
  if (body instanceof NextResponse) return body;
  const parsed = CrearEspacio.safeParse(body);
  if (!parsed.success) return errorDeValidacion(parsed.error.issues);
  try {
    return NextResponse.json(await crearEspacio(p.ctx, parsed.data));
  } catch (e) {
    return respuestaDeError(e);
  }
}
