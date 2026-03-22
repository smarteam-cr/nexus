import { requireConsultantSession } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireConsultantSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const agent = await prisma.agent.findUnique({ where: { id } });
  if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(agent);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireConsultantSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireConsultantSession();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  await prisma.agent.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
