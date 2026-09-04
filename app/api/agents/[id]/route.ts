import { withPermission } from "@/lib/api";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { prisma } from "@/lib/db/prisma";
import { AgentOutputType, AgentScope, AgentStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

/* A-19 (auditoría 2026-09-03): el body llegaba tal cual a prisma.agent.update — un `status`
   inventado, un prompt de 50 MB, un campo que no existe. Estricto: un campo desconocido es 400. */
const putAgentSchema = z.strictObject({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2_000).nullable().optional(),
  systemPrompt: z.string().min(1).max(200_000).optional(),
  additionalInstructions: z.string().max(50_000).nullable().optional(),
  status: z.enum(AgentStatus).optional(),
  associatedStages: z.array(z.number().int().min(0).max(20)).max(20).optional(),
  associatedStep: z.number().int().min(0).max(50).nullable().optional(),
  sectionLabel: z.string().max(200).nullable().optional(),
  outputType: z.enum(AgentOutputType).optional(),
  scope: z.enum(AgentScope).optional(),
});

/* Ídem al catálogo: el prompt entero, solo para quien puede ver agentes. */
export const GET = withPermission("agentes", "read", async (
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
  const parsed = putAgentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return cuerpoInvalido(parsed.error);
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
  } = parsed.data;

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
