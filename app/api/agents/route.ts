import { withAuth, withPermission } from "@/lib/api";
import { prisma } from "@/lib/db/prisma";
import { NextResponse } from "next/server";

export const GET = withAuth(async (request) => {
  const { searchParams } = new URL(request.url);
  const stageParam = searchParams.get("stage");

  const agents = await prisma.agent.findMany({
    orderBy: { createdAt: "desc" },
  });

  // Filtrar por etapa si se especifica
  if (stageParam) {
    const stage = parseInt(stageParam);
    if (isNaN(stage)) return NextResponse.json({ error: "Parámetro stage inválido" }, { status: 400 });
    const filtered = agents.filter(
      (a) =>
        a.associatedStages.length === 0 || a.associatedStages.includes(stage)
    );
    return NextResponse.json(filtered);
  }

  return NextResponse.json(agents);
});

export const POST = withPermission("agentes", "manage", async (request) => {
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
    agentType,
  } = body;

  if (!name?.trim() || !systemPrompt?.trim()) {
    return NextResponse.json(
      { error: "name y systemPrompt son requeridos" },
      { status: 400 }
    );
  }

  if (associatedStep !== undefined && associatedStep !== null &&
      (!associatedStages || associatedStages.length === 0)) {
    return NextResponse.json(
      { error: "Debes seleccionar al menos una etapa cuando especificas un paso" },
      { status: 400 }
    );
  }

  const agent = await prisma.agent.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      systemPrompt: systemPrompt.trim(),
      additionalInstructions: additionalInstructions?.trim() || null,
      status: status ?? "DRAFT",
      associatedStages: associatedStages ?? [],
      associatedStep:   associatedStep ?? null,
      sectionLabel:     sectionLabel?.trim() || null,
      outputType:       outputType ?? "CARDS",
      scope:            scope ?? "CLIENT",
      agentType:        agentType ?? "SECTION",
    },
  });

  return NextResponse.json(agent, { status: 201 });
});
