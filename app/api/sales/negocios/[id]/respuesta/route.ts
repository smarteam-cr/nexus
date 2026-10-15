/**
 * POST /api/sales/negocios/[id]/respuesta   body: { fechaCierre?: "AAAA-MM-DD", monto?: number }
 *
 * La respuesta a la pregunta de «Para ti» (2026-10-14, docs/mi-dia-plan.md): la fecha de cierre y el monto de un
 * negocio abierto. Se escriben en HubSpot y, si HubSpot los acepta, en la copia de Nexus. Pide `ventas.read` y ser el
 * dueño del negocio o tener `ventas.write` (lib/ventas/negocio-escritura-server.ts).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardPermission } from "@/lib/auth/api-guards";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { RespuestaDelNegocioSchema } from "@/lib/ventas/negocios-schema";
import { ErrorDelNegocio, responderNegocio } from "@/lib/ventas/negocio-escritura-server";
import { olvidarMedicion } from "@/lib/para-ti/medir-server";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const guard = await guardPermission("ventas", "read");
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "El cuerpo no es JSON." }, { status: 400 });
  }
  const parsed = RespuestaDelNegocioSchema.safeParse(raw);
  if (!parsed.success) return cuerpoInvalido(parsed.error);

  try {
    const n = await responderNegocio(id, parsed.data, guard.teamMember);
    olvidarMedicion(guard.teamMember.email);
    return NextResponse.json({
      ok: true,
      fechaCierre: n.fechaCierre?.toISOString().slice(0, 10) ?? null,
      monto: n.monto === null ? null : Number(n.monto),
    });
  } catch (e) {
    if (e instanceof ErrorDelNegocio) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
