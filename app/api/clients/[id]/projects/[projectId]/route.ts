import { NextRequest, NextResponse } from "next/server";
import { requireConsultantSession } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; projectId: string }> }
) {
  try { await requireConsultantSession(); } catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }

  const { projectId } = await params;
  const body = await req.json() as { name?: string; status?: string; serviceType?: string; hubspotDealId?: string | null };

  const data: { name?: string; status?: string; serviceType?: string; hubspotDealId?: string | null } = {};
  if (body.name?.trim()) data.name = body.name.trim();
  if (body.status) data.status = body.status;
  if (body.serviceType !== undefined) data.serviceType = body.serviceType;
  if (body.hubspotDealId !== undefined) data.hubspotDealId = body.hubspotDealId;

  const project = await prisma.project.update({
    where: { id: projectId },
    data,
  });

  return NextResponse.json({ project });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; projectId: string }> }
) {
  try { await requireConsultantSession(); } catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }

  const { projectId } = await params;

  await prisma.project.delete({ where: { id: projectId } });

  return NextResponse.json({ ok: true });
}
