import { NextResponse } from "next/server";
import { guardAccessToClient } from "@/lib/auth/api-guards";
import { personasYTicketsDe } from "@/lib/contactos/lectura-server";
import { portalDelSistema } from "@/lib/hubspot/registro-para-vincular";

/**
 * GET /api/clients/[id]/personas — las personas y los tickets de la cuenta, de la copia de HubSpot (etapa 6a de
 * docs/mi-dia-plan.md). Solo lectura; lo ve quien tiene acceso al cliente.
 */
type Ctx = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;
  const [datos, portalId] = await Promise.all([personasYTicketsDe(id), portalDelSistema().catch(() => null)]);
  return NextResponse.json({ ...datos, portalId }, { headers: { "Cache-Control": "no-store" } });
}
