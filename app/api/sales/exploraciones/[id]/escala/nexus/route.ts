/**
 * /api/sales/exploraciones/[id]/escala/nexus — «✨ Pedirle a Nexus» en la página de La escala (23 nov, etapa 3 del plan
 * maestro de «Hablar con Nexus», versión sin cajón; lib/exploraciones/escala-con-nexus-server.ts).
 *
 *   POST { lugar, pedido, foco? } → { propuesta }: un pedido, una propuesta por pieza con el antes y el después. No escribe.
 *          429 si Nexus llegó al tope del mes; 404 si el área no es de la página.
 *   PUT  { lugar, cambios: [{ clave, antes, despues }], pedido? } → { aplicados, deshacer, aviso }: aplica por el mismo camino
 *          que la edición a mano. 409 con `choques` si otra persona cambió una de esas partes. Nunca publica.
 *        { lugar, deshacer: { versionId, firma } } → { aviso }: «Deshacer», volver a la versión de antes (409 si cambió).
 * Las dos piden poder cambiar la exploración (la misma guardia que «Rehacer con IA»). La cuenta sale de la exploración: el
 * modelo nunca la elige.
 */
import { NextRequest, NextResponse } from "next/server";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { prisma } from "@/lib/db/prisma";
import { AplicarEnLaEscalaSchema, DeshacerEnLaEscalaSchema, PedidoALaEscalaSchema } from "@/lib/exploraciones/escala-con-nexus-esquemas";
import { aplicarEnLaEscala, deshacerEnLaEscala, proponerEnLaEscala } from "@/lib/exploraciones/escala-con-nexus-server";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";

type Ctx = { params: Promise<{ id: string }> };

/** La persona y la cuenta de la exploración, o la respuesta que corta. */
async function quienYCuenta(id: string): Promise<{ email: string; clientId: string } | NextResponse> {
  const guard = await guardDeLaExploracion(id, "write");
  if (guard instanceof NextResponse) return guard;
  if (!guard.email) return NextResponse.json({ error: "No se sabe quién pide." }, { status: 403 });
  const fila = await prisma.exploracionDeVenta.findUnique({ where: { id }, select: { clientId: true } });
  if (!fila) return NextResponse.json({ error: "Esa preventa no existe." }, { status: 404 });
  return { email: guard.email, clientId: fila.clientId };
}

async function cuerpo(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const q = await quienYCuenta(id);
  if (q instanceof NextResponse) return q;
  const b = PedidoALaEscalaSchema.safeParse(await cuerpo(req));
  if (!b.success) return cuerpoInvalido(b.error);
  const r = await proponerEnLaEscala({ email: q.email }, { clientId: q.clientId, exploracionId: id, lugar: b.data.lugar, pedido: b.data.pedido, foco: b.data.foco ?? null });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ propuesta: r.propuesta });
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const q = await quienYCuenta(id);
  if (q instanceof NextResponse) return q;
  const raw = await cuerpo(req);
  if (raw && typeof raw === "object" && "deshacer" in raw) {
    const x = DeshacerEnLaEscalaSchema.safeParse(raw);
    if (!x.success) return cuerpoInvalido(x.error);
    const d = await deshacerEnLaEscala({ email: q.email }, { clientId: q.clientId, exploracionId: id, lugar: x.data.lugar, ...x.data.deshacer });
    if (!d.ok) return NextResponse.json({ error: d.error }, { status: d.status });
    return NextResponse.json({ aviso: d.aviso });
  }
  const b = AplicarEnLaEscalaSchema.safeParse(raw);
  if (!b.success) return cuerpoInvalido(b.error);
  const r = await aplicarEnLaEscala({ email: q.email }, { clientId: q.clientId, exploracionId: id, lugar: b.data.lugar, cambios: b.data.cambios, pedido: b.data.pedido ?? null });
  if (!r.ok) return NextResponse.json({ error: r.error, choques: r.choques ?? [] }, { status: r.status });
  return NextResponse.json({ aplicados: r.aplicados, deshacer: r.deshacer, aviso: r.aviso });
}
