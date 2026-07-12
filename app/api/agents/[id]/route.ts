import { withAuth, withPermission } from "@/lib/api";
import { prisma } from "@/lib/db/prisma";
import { NextResponse } from "next/server";

export const GET = withAuth(async (
  _request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  const agent = await prisma.agent.findUnique({ where: { id } });
  if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(agent);
});

export const PUT = withPermission("agentes", "manage", async (
  request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  const body = await request.json();
  const {
    name,
    description,
    systemPrompt,
    additionalInstructions,
    status,
    associatedStages,
    associatedStep,
    sectionLabel,
    outputType,
    scope,
  } = body;

  const agent = await prisma.agent.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(description !== undefined && {
        description: description?.trim() || null,
      }),
      ...(systemPrompt !== undefined && { systemPrompt: systemPrompt.trim() }),
      ...(additionalInstructions !== undefined && {
        additionalInstructions: additionalInstructions?.trim() || null,
      }),
      ...(status !== undefined && { status }),
      ...(associatedStages !== undefined && { associatedStages }),
      ...(associatedStep !== undefined && { associatedStep: associatedStep ?? null }),
      ...(sectionLabel !== undefined && { sectionLabel: sectionLabel?.trim() || null }),
      ...(outputType !== undefined && { outputType }),
      ...(scope !== undefined && { scope }),
    },
  });

  return NextResponse.json(agent);
});

export const DELETE = withPermission("agentes", "manage", async (
  _request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  await prisma.agent.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
