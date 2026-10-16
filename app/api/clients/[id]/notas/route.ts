import { NextResponse, type NextRequest } from "next/server";
import { guardAccessToClient } from "@/lib/auth/api-guards";
import { apiError } from "@/lib/api";
import { portalDelSistema } from "@/lib/hubspot/registro-para-vincular";
import { nuevaNotaSchema } from "@/lib/notas/schema";
import { notasDeLaCuenta } from "@/lib/notas/lectura-server";
import { ErrorDeLaNota, crearNota } from "@/lib/notas/escritura-server";

/**
 * /api/clients/[id]/notas — La cuenta › Notas (etapa 5 de docs/mi-dia-plan.md).
 *
 *   GET  → las notas de Nexus y, aparte, las que se escribieron directo en el registro de HubSpot.
 *   POST → anota (canal, fecha, texto y, si aplica, el proyecto o el negocio). Se escribe en HubSpot enseguida; si
 *          HubSpot no responde, queda pendiente y se reintenta cada hora.
 *
 * Lo puede cualquiera con acceso al cliente, de cualquier equipo. Las reglas viven en lib/notas/.
 */
type Ctx = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;
  const [datos, portalId] = await Promise.all([notasDeLaCuenta(id), portalDelSistema().catch(() => null)]);
  return NextResponse.json({ ...datos, portalId }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;

  const body = await req.json().catch(() => null);
  const parsed = nuevaNotaSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Faltan datos de la nota.", 400);

  try {
    const nota = await crearNota(id, { email: guard.user.email, rol: guard.user.teamMember?.roleEnum ?? null }, parsed.data);
    return NextResponse.json({ id: nota.id, hubspotEstado: nota.hubspotEstado, hubspotError: nota.hubspotError }, { status: 201 });
  } catch (e) {
    if (e instanceof ErrorDeLaNota) return apiError(e.message, e.status);
    throw e;
  }
}
