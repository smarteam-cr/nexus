import { NextResponse } from "next/server";
import { withClientAccess as withAuth } from "@/lib/api";
import { prisma } from "@/lib/db/prisma";

type Params = { params: Promise<{ id: string; docId: string }> };

// DELETE /api/clients/[id]/documents/[docId]
export const DELETE = withAuth(async (
  _req,
  { params }: Params
) => {
  try {
    const { docId } = await params;

    await prisma.clientDocument.delete({ where: { id: docId } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
