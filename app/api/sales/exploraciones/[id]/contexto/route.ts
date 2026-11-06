/**
 * GET  /api/sales/exploraciones/[id]/contexto
 *   El borrador de «lo que ya sabemos» del cliente (2026-11-06, lib/exploraciones/contexto-server.ts): lo que Nexus ya
 *   tiene, cargado para que la persona lo confirme o lo complete. Sin IA.
 * POST /api/sales/exploraciones/[id]/contexto   body: { mensaje: "correo" | "llamada" }
 *   Solo la preventa: redacta con IA el correo corto o el guion de llamada para cuando no hubo contacto antes de la
 *   primera sesión. No lo guarda ni lo manda: lo guarda la pantalla (`contactoPrevio`) y lo manda una persona.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { borradorDelContexto, redactarMensajePrevio } from "@/lib/exploraciones/contexto-server";
import { TIPOS_DE_MENSAJE_PREVIO } from "@/lib/exploraciones/contexto-de-la-exploracion";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "read");
  if (guard instanceof NextResponse) return guard;
  const b = await borradorDelContexto(id);
  if (!b) return NextResponse.json({ error: "La exploración ya no existe." }, { status: 404 });
  return NextResponse.json(b);
}

const Cuerpo = z.object({ mensaje: z.enum(TIPOS_DE_MENSAJE_PREVIO) });

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "write");
  if (guard instanceof NextResponse) return guard;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const cuerpo = Cuerpo.safeParse(raw);
  if (!cuerpo.success) return cuerpoInvalido(cuerpo.error);
  const r = await redactarMensajePrevio(id, cuerpo.data.mensaje, guard.email);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ texto: r.texto });
}
