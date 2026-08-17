import { NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { asignarDuenioManual } from "@/lib/sessions/duenio-manual";
import { withAuth, apiError } from "@/lib/api";
import { prisma } from "@/lib/db/prisma";
import { reResolveSession } from "@/lib/sessions/resolve-client";

// GET /api/sessions/[id] — transcript lazy load
export const GET = withAuth(async (_req, ctx) => {
  const { id } = await ctx.params;

  const session = await prisma.firefliesSession.findUnique({
    where: { id },
    select: { id: true, transcript: true, summary: true },
  });

  if (!session) return apiError("not_found", 404);
  return NextResponse.json(session);
});

/**
 * PATCH /api/sessions/[id] — asignación manual de cliente.
 *
 * ⚠ `manualClientId` NO es clave foránea: la base acepta cualquier string y nadie la valida
 * después. Un id que no existe deja la sesión en tierra de nadie —no pertenece a ningún cliente
 * vivo, pero tampoco cuenta como "sin dueño", así que el buscador de reuniones internas también la
 * rechaza— y desde ahí es invisible en toda la app. Es lo que escondió una reunión en un demo en
 * vivo el 2026-08-04. Acá se cierra la puerta de entrada: si el cliente no existe, 400.
 */
export const PATCH = withAuth(async (req, ctx) => {
  const { id } = await ctx.params;
  /* ⚠ `withAuth` verifica que haya sesión pero DESCARTA al usuario, así que el handler no sabe
     quién es. Se lo vuelve a pedir inline —mismo patrón que handoff-sources— porque sin autor la
     procedencia del sello es la mitad del dato: sirve para saber que fue humano, no para saber a
     quién preguntarle cuando una reunión aparece en el cliente equivocado. */
  const usuario = await guardInternalUser();
  if (usuario instanceof NextResponse) return usuario;
  let body: { manualClientId?: unknown };
  try {
    body = (await req.json()) as { manualClientId?: unknown };
  } catch {
    return apiError("cuerpo_invalido", 400);
  }

  const crudo = body.manualClientId;
  if (crudo !== null && crudo !== undefined && typeof crudo !== "string") {
    return apiError("manualClientId debe ser un id o null", 400);
  }
  const destino = typeof crudo === "string" && crudo.trim() ? crudo.trim() : null;

  if (destino) {
    const existe = await prisma.client.findUnique({ where: { id: destino }, select: { id: true } });
    if (!existe) {
      return apiError("Ese cliente no existe: la sesión quedaría con un dueño fantasma", 400);
    }
  }

  await asignarDuenioManual(id, destino, { origen: "humano", actorEmail: usuario.teamMember.email ?? null });
  const session = { id, manualClientId: destino };

  // PERF #1: el override de cliente cambia la resolución → re-resolver esta sesión.
  await reResolveSession(id);

  return NextResponse.json(session);
});
