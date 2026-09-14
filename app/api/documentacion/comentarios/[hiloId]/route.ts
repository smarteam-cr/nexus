import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { puedeResolver } from "@/lib/documentacion/comentarios";
import { cambiarResuelto, hiloPorId, responder } from "@/lib/documentacion/consultas-de-comentarios";
import { CambiarResuelto, Responder } from "@/lib/documentacion/esquema";

async function leerCuerpo(req: NextRequest): Promise<unknown | NextResponse> {
  try {
    return await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
}

/**
 * POST — responder en un hilo. Es de todo el equipo interno, como comentar (Elías, 2026-09-13):
 * pide usuario interno y no la celda del módulo.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ hiloId: string }> }) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;

  const body = await leerCuerpo(req);
  if (body instanceof NextResponse) return body;
  const parsed = Responder.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  }

  const { hiloId } = await params;
  if (!(await hiloPorId(hiloId))) {
    return NextResponse.json({ error: "Ese hilo ya no existe." }, { status: 404 });
  }
  await responder({ hiloId, cuerpo: parsed.data.cuerpo, email: guard.user.email });
  return NextResponse.json({ ok: true }, { status: 201 });
}

/**
 * PATCH — resolver o reabrir. SOLO Súper admin y CSL (Elías, 2026-09-13): el rol se mira acá, fijo,
 * y no en la matriz de permisos, que se edita desde /team.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ hiloId: string }> }) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;

  if (!puedeResolver(guard.role)) {
    return NextResponse.json(
      { error: "Resolver comentarios es de Súper admin y CSL." },
      { status: 403 },
    );
  }

  const body = await leerCuerpo(req);
  if (body instanceof NextResponse) return body;
  const parsed = CambiarResuelto.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Falta `resuelto` (booleano)." }, { status: 400 });
  }

  const { hiloId } = await params;
  if (!(await hiloPorId(hiloId))) {
    return NextResponse.json({ error: "Ese hilo ya no existe." }, { status: 404 });
  }
  await cambiarResuelto({ hiloId, resuelto: parsed.data.resuelto, email: guard.user.email });
  return NextResponse.json({ ok: true });
}
