/**
 * POST /api/business-cases/[id]/generate
 *
 * Corre el agente generador con los transcripts del caso → crea bloques DRAFT.
 * NUNCA pisa bloques CONFIRMED (los conserva). Exige ≥1 transcript con texto.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { generateBlocks, applyGeneratedBlocks, getBlocks } from "@/lib/business-cases";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const bc = await prisma.businessCase.findUnique({
    where: { id },
    select: { id: true, clientId: true },
  });
  if (!bc) {
    return NextResponse.json({ error: "Business case no existe" }, { status: 404 });
  }

  const transcripts = await prisma.businessCaseTranscript.findMany({
    where: { businessCaseId: id },
    select: { rawText: true },
  });
  const texts = transcripts.map((t) => t.rawText).filter((t) => t.trim().length > 0);
  if (texts.length === 0) {
    return NextResponse.json(
      { error: "Agregá al menos un transcript con contenido antes de generar." },
      { status: 400 },
    );
  }

  const run = await prisma.agentRun.create({
    data: {
      clientId: bc.clientId,
      businessCaseId: id,
      status: "RUNNING",
      agentSlug: "business-case",
      stepLabel: "Generación de Business Case",
    },
    select: { id: true },
  });

  try {
    const generated = await generateBlocks(texts);
    await applyGeneratedBlocks(id, generated, run.id);
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "DONE", output: JSON.stringify(generated).slice(0, 100000) },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "error desconocido";
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "ERROR", output: message },
    });
    return NextResponse.json(
      { error: "La generación falló: " + message },
      { status: 500 },
    );
  }

  const blocks = await getBlocks(id);
  return NextResponse.json({ blocks });
}
