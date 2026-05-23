import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api";
import { prisma } from "@/lib/db/prisma";

export const PATCH = withAuth(async (
  req,
  { params }: { params: Promise<{ id: string; projectId: string }> }
) => {
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
});

export const DELETE = withAuth(async (
  _req,
  { params }: { params: Promise<{ id: string; projectId: string }> }
) => {
  const { projectId } = await params;

  await prisma.project.delete({ where: { id: projectId } });

  return NextResponse.json({ ok: true });
});
