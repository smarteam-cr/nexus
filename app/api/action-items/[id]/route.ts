import { NextRequest, NextResponse } from "next/server";
import { guardAccessToClient } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

/**
 * PATCH /api/action-items/[id]
 *
 * Edita un ActionItem. Campos editables: text, status, done, ownerEmail, dueDate.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const item = await prisma.actionItem.findUnique({
    where: { id },
    select: { clientId: true },
  });
  if (!item) return NextResponse.json({ error: "ActionItem no existe" }, { status: 404 });
  const guard = await guardAccessToClient(item.clientId);
  if (guard instanceof NextResponse) return guard;

  let body: {
    text?: string;
    status?: "PENDING" | "IN_PROGRESS" | "BLOCKED" | "DONE";
    done?: boolean;
    ownerEmail?: string | null;
    dueDate?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.text !== undefined) data.text = body.text.trim();
  if (body.status !== undefined) data.status = body.status;
  if (body.done !== undefined) data.done = body.done;
  if (body.ownerEmail !== undefined) {
    data.ownerEmail = body.ownerEmail ? body.ownerEmail.toLowerCase() : null;
  }
  if (body.dueDate !== undefined) {
    if (body.dueDate) {
      const d = new Date(body.dueDate);
      data.dueDate = isNaN(d.getTime()) ? null : d;
    } else {
      data.dueDate = null;
    }
  }

  // Sincronizar done ↔ status
  if (data.status === "DONE") data.done = true;
  if (data.done === true && !data.status) data.status = "DONE";
  if (data.done === false && data.status === "DONE") data.status = "PENDING";

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  const updated = await prisma.actionItem.update({
    where: { id },
    data,
  });

  return NextResponse.json(updated);
}

/**
 * DELETE /api/action-items/[id]
 *
 * Soft-delete: NO elimina la fila, setea deletedAt. Así la tarea sigue visible
 * en el "Histórico" del modal de pendientes (tareas hechas o borradas).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const item = await prisma.actionItem.findUnique({
    where: { id },
    select: { clientId: true },
  });
  if (!item) return NextResponse.json({ error: "ActionItem no existe" }, { status: 404 });
  const guard = await guardAccessToClient(item.clientId);
  if (guard instanceof NextResponse) return guard;

  await prisma.actionItem.update({ where: { id }, data: { deletedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
