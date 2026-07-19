import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { withPermission, apiError } from "@/lib/api";
import { getOutputFormatInstructions } from "@/lib/canvas/agent-output-schema";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/agents/[id]/effective-prompt — lo que REALMENTE se envía al modelo.
 *
 * Los prompts están repartidos a propósito (ARCHITECTURE §6: DB para lo
 * calibrable, código para lo permanente), pero eso hacía imposible calibrar
 * informado: el systemPrompt de la DB es solo una parte de lo que corre. Este
 * endpoint junta las piezas para VERLAS (no las mueve): systemPrompt +
 * additionalInstructions (DB) + las format instructions base del outputType
 * (código). Los agentes de canvas en block-format reciben además instrucciones
 * por sección armadas al momento de correr — eso es por-corrida y se declara
 * en la nota, no se simula.
 */
export const GET = withPermission("agentes", "read", async (_req: NextRequest, { params }: Params) => {
  const { id } = await params;
  const agent = await prisma.agent.findUnique({
    where: { id },
    select: {
      name: true,
      outputType: true,
      systemPrompt: true,
      additionalInstructions: true,
      updatedAt: true,
    },
  });
  if (!agent) return apiError("not_found", 404);

  const formatInstructions =
    agent.outputType === "FLOWCHART" || agent.outputType === "STREAM"
      ? null
      : getOutputFormatInstructions({});

  return NextResponse.json({
    name: agent.name,
    outputType: agent.outputType,
    updatedAt: agent.updatedAt,
    systemPrompt: agent.systemPrompt,
    additionalInstructions: agent.additionalInstructions,
    formatInstructions,
    nota:
      "Esta es la base común. Los agentes de canvas (block-format) reciben además instrucciones por sección y el contexto del cliente, armados al momento de correr.",
  });
});
