import { NextRequest, NextResponse } from "next/server";
import { guardAccessToClient } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

/**
 * POST /api/action-items
 *
 * Crea un ActionItem manual (no generado por agente).
 * Body: { text, clientId, projectId?, sessionId?, ownerEmail?, dueDate?, source? }
 */
export async function POST(req: NextRequest) {
  let body: {
    text?: string;
    clientId?: string;
    projectId?: string | null;
    sessionId?: string | null;
    ownerEmail?: string | null;
    dueDate?: string | null;
    source?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const text = (body.text ?? "").trim();
  if (!text) {
    return NextResponse.json({ error: "text requerido" }, { status: 400 });
  }
  if (!body.clientId) {
    return NextResponse.json({ error: "clientId requerido" }, { status: 400 });
  }

  const guard = await guardAccessToClient(body.clientId);
  if (guard instanceof NextResponse) return guard;

  let dueDate: Date | null = null;
  if (body.dueDate) {
    const d = new Date(body.dueDate);
    if (!isNaN(d.getTime())) dueDate = d;
  }

  const created = await prisma.actionItem.create({
    data: {
      text,
      clientId: body.clientId,
      projectId: body.projectId ?? null,
      sessionId: body.sessionId ?? null,
      ownerEmail: body.ownerEmail?.toLowerCase() || null,
      dueDate,
      status: "PENDING",
      done: false,
      source: body.source ?? "manual",
    },
  });

  return NextResponse.json(created, { status: 201 });
}
