import { NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { asignarDuenioManual } from "@/lib/sessions/duenio-manual";
import { withAuth, apiError } from "@/lib/api";
import { prisma } from "@/lib/db/prisma";
import { reResolveSession } from "@/lib/sessions/resolve-client";
import { guardAccesoALaReunion } from "@/lib/sessions/acceso-a-la-reunion";

/**
 * GET /api/sessions/[id] — la transcripción y el resumen, a pedido (la lista de /sessions).
 *
 * Con dueño, solo quien tiene acceso a ese cliente; sin acceso, 404 (lib/sessions/acceso-a-la-reunion.ts). Hasta el
 * 2026-10-10 servía la transcripción de cualquier reunión a cualquier usuario interno, y con eso anulaba el 404 de la
 * página de la reunión y de su minuta.
 */
export const GET = withAuth(async (_req, ctx) => {
  const { id } = await ctx.params;
  const acceso = await guardAccesoALaReunion(id);
  if (acceso instanceof NextResponse) return acceso;

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
 * ⚠ Hasta R7 (2026-10-24) `manualClientId` NO era clave foránea: la base aceptaba cualquier string,
 * y un id que no existe dejaba la sesión en tierra de nadie —no pertenece a ningún cliente vivo, pero
 * tampoco cuenta como "sin dueño"— e invisible en toda la app (una reunión escondida en un demo en vivo
 * el 2026-08-04). Desde R7 la base lo rechaza (P2003); esta validación queda para responder un 400
 * claro en vez de un error de la base.
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
