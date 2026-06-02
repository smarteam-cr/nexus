import { NextRequest, NextResponse } from "next/server";
import { requireUser, UnauthorizedError, ForbiddenError } from "@/lib/auth/supabase";
import { prisma } from "@/lib/db/prisma";

/**
 * PATCH /api/sessions/[id]/minute
 *
 * Actualiza la SessionMinute de una sesión.
 * Body opcional:
 *   - status: "DRAFT" | "REVIEWED" | "EDITED"
 *   - summary, agreements, decisions, risks, topics: editan los campos
 *
 * Al setear status: REVIEWED, registra reviewedAt + reviewedByEmail (del CSE activo).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    throw e;
  }

  const { id: sessionId } = await params;

  let body: {
    status?: "DRAFT" | "REVIEWED" | "EDITED";
    summary?: string;
    agreements?: { text: string }[];
    decisions?: { text: string; rationale?: string }[];
    risks?: { text: string; severity?: "low" | "med" | "high" }[];
    topics?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.status) {
    data.status = body.status;
    if (body.status === "REVIEWED" || body.status === "EDITED") {
      data.reviewedAt = new Date();
      data.reviewedByEmail = user.email;
    }
  }
  if (body.summary !== undefined) data.summary = body.summary;
  if (body.agreements !== undefined) data.agreements = body.agreements as unknown as object;
  if (body.decisions !== undefined) data.decisions = body.decisions as unknown as object;
  if (body.risks !== undefined) data.risks = body.risks as unknown as object;
  if (body.topics !== undefined) data.topics = body.topics as unknown as object;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  const updated = await prisma.sessionMinute.update({
    where: { sessionId },
    data,
    select: { id: true, status: true, reviewedAt: true, reviewedByEmail: true },
  });

  return NextResponse.json(updated);
}
