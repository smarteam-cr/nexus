/**
 * /api/sales/exploraciones/[id]/acceso/respuesta — cuándo se PRESENTÓ La escala al cliente y qué RESPONDIÓ (21 nov,
 * lib/exploraciones/hitos-de-la-escala-server.ts).
 *
 *   GET  → { presentadaEl, presentadaPor, respuesta, aceptado }.
 *   POST body: { tipo: "presentada", fecha } | { tipo: "acepto", nota? } | { tipo: "acepto-con-cambios" | "pidio-ajustes", nota }
 *        → anota el hito con quién y cuándo (append-only) y devuelve el estado. 409 sin nada publicado o, en una
 *        respuesta, sin una presentación anotada.
 * Mirar pide leer la exploración; anotar, poder cambiarla (lib/exploraciones/guardia.ts).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";
import { anotarHito, ErrorDelHito, estadoConElCliente } from "@/lib/exploraciones/hitos-de-la-escala-server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "read");
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json(await estadoConElCliente(id));
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "write");
  if (guard instanceof NextResponse) return guard;
  try {
    return NextResponse.json(await anotarHito(id, await req.json().catch(() => null), guard.email));
  } catch (e) {
    if (e instanceof ErrorDelHito) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
