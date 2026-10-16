import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { guardAccessToClient } from "@/lib/auth/api-guards";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/db/prisma";
import { ErrorDeLaNota, archivarNota, escribirNotaEnHubspot } from "@/lib/notas/escritura-server";

/**
 * PATCH /api/clients/[id]/notas/[notaId] — una nota de la cuenta (etapa 5 de docs/mi-dia-plan.md).
 *
 *   { accion: "sacar" }      → la saca de Nexus y de la memoria de la cuenta. En HubSpot queda.
 *   { accion: "reintentar" } → vuelve a intentar escribirla en HubSpot ahora (sin esperar al job de cada hora).
 */
type Ctx = { params: Promise<{ id: string; notaId: string }> };

const schema = z.object({ accion: z.enum(["sacar", "reintentar"]) });

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id, notaId } = await ctx.params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("No se entendió qué hacer con la nota.", 400);

  try {
    if (parsed.data.accion === "sacar") {
      await archivarNota(id, { email: guard.user.email, rol: guard.user.teamMember?.roleEnum ?? null }, notaId);
      return NextResponse.json({ ok: true });
    }
    const nota = await prisma.notaDeLaCuenta.findUnique({ where: { id: notaId }, select: { clientId: true, estado: true, hubspotEstado: true } });
    if (!nota || nota.clientId !== id) return apiError("Esa nota no existe.", 404);
    if (nota.estado !== "vigente" || !["pendiente", "error"].includes(nota.hubspotEstado)) {
      return apiError("Esa nota no tiene nada que reintentar en HubSpot.", 409);
    }
    const r = await escribirNotaEnHubspot(notaId);
    return NextResponse.json({ hubspotEstado: r.hubspotEstado, hubspotError: r.hubspotError });
  } catch (e) {
    if (e instanceof ErrorDeLaNota) return apiError(e.message, e.status);
    throw e;
  }
}
