/**
 * GET  /api/sales/exploraciones/[id]/contexto
 *   El borrador de «lo que ya sabemos» del cliente (2026-11-06, lib/exploraciones/contexto-server.ts): lo que Nexus ya
 *   tiene, cargado para que la persona lo confirme o lo complete. Sin IA.
 *   Devuelve también lo que Nexus ya propuso para las tarjetas de «Lo que ya sabemos» (`propuesto`) y si hay de dónde.
 * POST /api/sales/exploraciones/[id]/contexto   body: { proponer: true }
 *   Nexus llena las tarjetas desde el traspaso, las notas y las reuniones leídas (con IA si hay fuentes) y las guarda como
 *   propuestas: se confirman en la pantalla.
 * POST /api/sales/exploraciones/[id]/contexto   body: { mensaje: "correo" | "llamada" }
 *   Solo la preventa: redacta con IA el correo corto o el guion de llamada para cuando no hubo contacto antes de la
 *   primera sesión. No lo guarda ni lo manda: lo guarda la pantalla (`contactoPrevio`) y lo manda una persona.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { borradorDelContexto, proponerLoQueSabemos, redactarMensajePrevio } from "@/lib/exploraciones/contexto-server";
import { estadoDesdeFila, leerExploracion } from "@/lib/exploraciones/servidor";
import { TIPOS_DE_MENSAJE_PREVIO } from "@/lib/exploraciones/contexto-de-la-exploracion";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "read");
  if (guard instanceof NextResponse) return guard;
  const [b, lectura] = await Promise.all([borradorDelContexto(id), leerExploracion(id)]);
  if (!b || lectura.estado !== "ok") return NextResponse.json({ error: "La exploración ya no existe." }, { status: 404 });
  return NextResponse.json({ sabemos: b.sabemos, de: b.de, hayFuentes: b.piezas.length > 0, propuesto: estadoDesdeFila(lectura.fila).propuesta.contextoPropuesto ?? null });
}

const Cuerpo = z.union([z.object({ mensaje: z.enum(TIPOS_DE_MENSAJE_PREVIO) }), z.object({ proponer: z.literal(true) })]);

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
  if ("proponer" in cuerpo.data) {
    const p = await proponerLoQueSabemos(id, guard.email);
    if (!p.ok) return NextResponse.json({ error: p.error }, { status: p.status });
    return NextResponse.json({ propuesto: { tarjetas: p.tarjetas }, de: p.de });
  }
  const r = await redactarMensajePrevio(id, cuerpo.data.mensaje, guard.email);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ texto: r.texto });
}
