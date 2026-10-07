/**
 * GET  /api/sales/exploraciones/[id]/reuniones?q=    → para el buscador: las reuniones de la empresa
 *                                                      y las de tu calendario
 * POST /api/sales/exploraciones/[id]/reuniones       body: { sessionId, elegida }
 *
 * El buscador de «Contexto adicional» de la preventa (Elías, 2026-10-07: «siempre se debe poder
 * buscar y agregar cualquier sesión de Meet del usuario o del cliente»). Hasta ese día la preventa
 * solo veía las reuniones más recientes, desde un mes antes del alta, y no había cómo sumar otra.
 *
 * Sumar: una reunión de la empresa entra; una sin cliente se adopta (pasa a ser de la empresa en
 * todo Nexus, como al agregarla a un proyecto), y una de otro cliente se rechaza. Queda en
 * `contenido.reunionesElegidas` (sin SQL), y el agente la lista y la lee aunque sea vieja. Quitar
 * solo la saca de esa lista: no le cambia el dueño.
 *
 * Las dos piden `preventa.write`: el buscador existe para elegir.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardPermission } from "@/lib/auth/api-guards";
import type { Operacion } from "@/lib/exploraciones/contenido";
import { reunionesDeLaEmpresaParaElegir } from "@/lib/exploraciones/fuentes";
import { aplicarCambios, escalaParaExplorar, leerExploracion } from "@/lib/exploraciones/servidor";
import { prepararReunionParaElCliente } from "@/lib/sessions/agregar-sesion";
import { buscarEnTuCalendario } from "@/lib/sessions/calendario-de-quien-busca";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardPermission("preventa", "write");
  if (guard instanceof NextResponse) return guard;

  const lectura = await leerExploracion(id);
  if (lectura.estado !== "ok") return NextResponse.json({ error: "Esa preventa no existe." }, { status: 404 });
  const clientId = lectura.fila.clientId;
  const [deLaEmpresa, calendario] = await Promise.all([
    reunionesDeLaEmpresaParaElegir(clientId),
    buscarEnTuCalendario({
      email: guard.teamMember?.email ?? guard.user.email ?? "",
      clientId,
      projectId: null,
      q: req.nextUrl.searchParams.get("q") ?? "",
      documento: "la preventa",
    }),
  ]);
  return NextResponse.json({ deLaEmpresa, calendario });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardPermission("preventa", "write");
  if (guard instanceof NextResponse) return guard;

  let body: { sessionId?: unknown; elegida?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const sessionId = typeof body.sessionId === "string" && body.sessionId.length <= 60 ? body.sessionId : "";
  if (!sessionId || typeof body.elegida !== "boolean") {
    return NextResponse.json({ error: "sessionId y elegida (boolean) requeridos" }, { status: 400 });
  }

  const lectura = await leerExploracion(id);
  if (lectura.estado !== "ok") return NextResponse.json({ error: "Esa preventa no existe." }, { status: 404 });
  if (body.elegida) {
    const prep = await prepararReunionParaElCliente({
      sessionId,
      clientId: lectura.fila.clientId,
      actorEmail: guard.teamMember?.email ?? guard.user.email ?? null,
    });
    if (!prep.ok) return NextResponse.json({ error: prep.error }, { status: prep.status });
  }

  const escala = await escalaParaExplorar();
  if (escala.estado !== "ok") return NextResponse.json({ error: "La escala no está publicada en Nexus." }, { status: 503 });
  const ops: Operacion[] = [{ op: "reunionElegida", sessionId, elegida: body.elegida }];
  /* Sumar o quitar no depende de lo demás: si otra persona (o el agente) cambió la preventa
     entretanto, se aplica sobre lo último. */
  let r = await aplicarCambios(id, lectura.fila.version, ops, escala.general);
  if (r.estado === "conflicto") r = await aplicarCambios(id, r.fila.version, ops, escala.general);
  switch (r.estado) {
    case "ok":
      return NextResponse.json({ ok: true });
    case "no-existe":
      return NextResponse.json({ error: "Esa preventa no existe." }, { status: 404 });
    case "invalido":
      return NextResponse.json({ error: r.error }, { status: 400 });
    case "conflicto":
      return NextResponse.json({ error: "La preventa cambió mientras tanto: vuelve a intentarlo." }, { status: 409 });
  }
}
