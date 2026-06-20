import { NextRequest, NextResponse } from "next/server";
import { guardAccessToClient, guardCapability } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; projectId: string }> }
) {
  const { id, projectId } = await params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;

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
  const { projectId } = await params;
  const guard = await guardCapability("deleteClients");
  if (guard instanceof NextResponse) return guard;

  await prisma.project.delete({ where: { id: projectId } });

  return NextResponse.json({ ok: true });
}
