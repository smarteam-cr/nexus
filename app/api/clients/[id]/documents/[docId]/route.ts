import { NextRequest, NextResponse } from "next/server";
import { requireConsultantSession } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

type Params = { params: Promise<{ id: string; docId: string }> };

// DELETE /api/clients/[id]/documents/[docId]
export async function DELETE(
  _req: NextRequest,
  { params }: Params
) {
  try {
    await requireConsultantSession();
    const { docId } = await params;

    await prisma.clientDocument.delete({ where: { id: docId } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
