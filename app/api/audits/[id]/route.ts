import { NextResponse } from "next/server";
import { withAuth, withPermission } from "@/lib/api";
import { prisma } from "@/lib/db/prisma";

export const GET = withAuth(async (
  _request,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = await params;

    const audit = await prisma.audit.findUnique({ where: { id } });

    if (!audit) {
      return NextResponse.json({ error: "Auditoría no encontrada" }, { status: 404 });
    }

    return NextResponse.json(audit);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 401 });
  }
});

export const DELETE = withPermission("auditoria", "delete", async (
  _request,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = await params;

    await prisma.audit.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
