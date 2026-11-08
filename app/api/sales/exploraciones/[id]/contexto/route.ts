/**
 * GET  /api/sales/exploraciones/[id]/contexto
 *   Lo de la EMPRESA que ya tiene su ficha (`empresa`: el desafío principal y el resultado del negocio) y si hay de dónde
 *   proponer el contexto (`hayFuentes`). Sin IA. Lo que Nexus ya propuso viaja con la exploración
 *   (`propuesta.contextoPropuesto`): la pantalla lo muestra sin esperar esto (2026-11-07).
 * POST /api/sales/exploraciones/[id]/contexto   body: { proponer: true }
 *   UNA llamada por exploración (lib/exploraciones/contexto-server.ts › proponerElContexto): el objetivo de la exploración,
 *   el desafío y el resultado del negocio (si la ficha no los tiene) y, en la preventa, lo de la compra como sugerencias
 *   del Resumen. Se validan en la pantalla.
 * POST /api/sales/exploraciones/[id]/contexto   body: { desafio: string | null } | { resultado: string | null }
 *   Lo que validó (o corrigió) la persona va a la ficha de la empresa como propuesta: el desafío a «Dolor principal», el
 *   resultado del negocio a su línea de «Retos estratégicos». Con null, lo descartó. En los dos casos sale de lo propuesto.
 * POST /api/sales/exploraciones/[id]/contexto   body: { mensaje: "correo" | "llamada" }
 *   Solo la preventa: redacta con IA el correo corto o el guion de llamada para cuando no hubo contacto antes de la
 *   primera sesión. No lo guarda ni lo manda: lo guarda la pantalla (`contactoPrevio`) y lo manda una persona.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { borradorDelContexto, empresaEnLaFicha, proponerElContexto, redactarMensajePrevio, validarEnLaFicha } from "@/lib/exploraciones/contexto-server";
import { MAX_DESAFIO_PROPUESTO, TIPOS_DE_MENSAJE_PREVIO } from "@/lib/exploraciones/contexto-de-la-exploracion";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "read");
  if (guard instanceof NextResponse) return guard;
  const b = await borradorDelContexto(id);
  if (!b) return NextResponse.json({ error: "La exploración ya no existe." }, { status: 404 });
  const empresa = await empresaEnLaFicha(b.clientId).catch(() => null);
  return NextResponse.json({ hayFuentes: b.piezas.length > 0, empresa });
}

const Cuerpo = z.union([
  z.object({ mensaje: z.enum(TIPOS_DE_MENSAJE_PREVIO) }),
  z.object({ proponer: z.literal(true) }),
  z.object({ desafio: z.string().trim().min(1).max(MAX_DESAFIO_PROPUESTO).nullable() }),
  z.object({ resultado: z.string().trim().min(1).max(MAX_DESAFIO_PROPUESTO).nullable() }),
]);

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
    const p = await proponerElContexto(id, guard.email);
    if (!p.ok) return NextResponse.json({ error: p.error }, { status: p.status });
    return NextResponse.json({ propuesto: p.propuesto, compra: p.compra });
  }
  if ("desafio" in cuerpo.data || "resultado" in cuerpo.data) {
    const v =
      "desafio" in cuerpo.data
        ? await validarEnLaFicha(id, "desafio", cuerpo.data.desafio, guard.email)
        : await validarEnLaFicha(id, "resultado", cuerpo.data.resultado, guard.email);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status });
    return NextResponse.json({ ok: true, empresa: v.empresa });
  }
  const r = await redactarMensajePrevio(id, cuerpo.data.mensaje, guard.email);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ texto: r.texto });
}
