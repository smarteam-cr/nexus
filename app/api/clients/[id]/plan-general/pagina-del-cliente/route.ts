/**
 * /api/clients/[id]/plan-general/pagina-del-cliente — la página del plan general que ve el cliente, desde adentro
 * (2026-11-27). lib/external/pagina-del-cliente(-server).ts.
 *
 *   GET → la vista previa: lo que el cliente vería al «Publicar» (el mismo armado que la foto), con lo que el equipo
 *         decidió de la página. Pide acceso a la cuenta.
 *   PUT { titulo?, conNombre?, conLogo?, bienvenida?, conAtrasadas?, conResponsables?, conResumen? } → guarda (NO
 *         publica: queda «Hay cambios que el cliente no ve»). La vara del plan (`guardPlanEdit`).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToClient, guardPlanEdit } from "@/lib/auth/api-guards";
import { PaginaDelClienteSchema } from "@/lib/external/pagina-del-cliente-schema";
import { guardarPaginaDelPlan, vistaPreviaDelPlan } from "@/lib/external/pagina-del-cliente-server";
import { cuerpoJson, responderDelPlan } from "@/lib/plan-general/respuesta";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;
  return responderDelPlan(async () => {
    const vista = await vistaPreviaDelPlan(id);
    if (!vista) return NextResponse.json({ error: "La cuenta no existe." }, { status: 404 });
    return NextResponse.json(vista);
  });
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardPlanEdit(id);
  if (guard instanceof NextResponse) return guard;
  const parsed = PaginaDelClienteSchema.safeParse(await cuerpoJson(req));
  if (!parsed.success) return NextResponse.json({ error: "Lo que se quiso guardar de la página no se entiende." }, { status: 400 });
  return responderDelPlan(async () => {
    await guardarPaginaDelPlan(id, parsed.data, guard.user.email ?? null);
    return NextResponse.json({ ok: true });
  });
}
