import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { guardAccessToClient } from "@/lib/auth/api-guards";

/**
 * PUT /api/cards/[cardId]/canvas-status — aceptar o rechazar un borrador del canvas.
 *
 * ⛔ TENÍA CERO GUARDA (auditoría 2026-09-03). Lo único que la frenaba era el middleware, que deja
 * pasar cualquier sesión: quien conociera o adivinara el id de una tarjeta podía aceptar, fusionar
 * o borrar borradores en el contexto de un cliente al que no tiene acceso. El modelo de acceso dice
 * que el CSE ve solo SUS clientes; esta ruta era una puerta lateral al mismo dato que
 * `app/api/projects/**` ya cerró con su ratchet.
 *
 * La tarjeta se carga PRIMERO y el ámbito sale de ella: `guardAccessToClient(card.clientId)`. No
 * hay `clientId` en la URL, así que el ámbito no se puede verificar antes de leer — pero sí antes
 * de escribir, que es lo que importa.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const { cardId } = await params;

  const card = await prisma.clientContextCard.findUnique({
    where: { id: cardId },
    select: {
      clientId: true,
      parentCardId: true,
      content: true,
      title: true,
      diagramData: true,
      cardType: true,
    },
  });
  if (!card) return NextResponse.json({ error: "card not found" }, { status: 404 });

  const guard = await guardAccessToClient(card.clientId);
  if (guard instanceof NextResponse) return guard;

  const { action } = await req.json();

  if (action === "accept") {
    if (card.parentCardId) {
      /* Es una ACTUALIZACIÓN: reemplaza el contenido de la original. La original tiene que ser del
         mismo cliente — por construcción lo es, y se comprueba igual: es una escritura sobre otra
         fila a partir de un id que vino de la base, no de la URL. */
      const parent = await prisma.clientContextCard.findFirst({
        where: { id: card.parentCardId, clientId: card.clientId },
        select: { id: true },
      });
      if (!parent) return NextResponse.json({ error: "parent card not found" }, { status: 404 });

      await prisma.clientContextCard.update({
        where: { id: parent.id },
        data: {
          content: card.content,
          title: card.title,
          ...(card.cardType === "FLOWCHART" && card.diagramData ? { diagramData: card.diagramData } : {}),
          source: "AGENT",
        },
      });
      // Remove the draft (it replaced the original)
      await prisma.clientContextCard.delete({ where: { id: cardId } });
      return NextResponse.json({ ok: true, status: "merged" });
    }

    // Regular draft (not an update) — just confirm
    await prisma.clientContextCard.update({
      where: { id: cardId },
      data: { canvasStatus: "confirmed" },
    });
    return NextResponse.json({ ok: true, status: "confirmed" });
  }

  if (action === "reject") {
    // Rechazar draft → quitar del canvas (canvasSection = null)
    await prisma.clientContextCard.update({
      where: { id: cardId },
      data: { canvasSection: null, canvasOrder: null, canvasStatus: "confirmed" },
    });
    return NextResponse.json({ ok: true, status: "removed" });
  }

  return NextResponse.json({ error: "action must be 'accept' or 'reject'" }, { status: 400 });
}
