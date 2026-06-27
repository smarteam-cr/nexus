/**
 * POST /api/business-cases/[id]/generate
 *
 * Crea una VERSIÓN NUEVA del canvas del business case y la llena con el agente:
 *   1. Junta el contexto (transcripts pegados/subidos + transcripts de las
 *      sesiones incluidas).
 *   2. Crea un ProjectCanvas nuevo (businessCaseId, version = max+1, isActive) con
 *      las secciones de BUSINESS_CASE_CANVAS — desactiva el canvas activo anterior.
 *   3. El agente produce markdown por sección → un bloque TEXT (DRAFT/AGENT) por
 *      sección. El vendedor confirma/edita después.
 *
 * Exige ≥1 fuente de contexto. Gateado con guardSalesAccess.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { createBusinessCaseCanvas } from "@/lib/canvas/default-canvases";
import { generateCanvasSections } from "@/lib/business-cases/canvas-agent";

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

  // ── Contexto: transcripts manuales + sesiones incluidas con transcript ──────
  const [transcripts, includedSessions] = await Promise.all([
    prisma.businessCaseTranscript.findMany({
      where: { businessCaseId: id },
      select: { rawText: true, fileName: true },
    }),
    prisma.businessCaseSession.findMany({
      where: { businessCaseId: id, included: true },
      select: { sessionId: true },
    }),
  ]);
  const sessionIds = includedSessions.map((s) => s.sessionId);
  const sessions = sessionIds.length
    ? await prisma.firefliesSession.findMany({
        where: { id: { in: sessionIds } },
        select: { title: true, date: true, transcript: true },
      })
    : [];

  const parts: string[] = [];
  for (const t of transcripts) {
    if (t.rawText.trim()) parts.push(`# Nota/transcript${t.fileName ? ` (${t.fileName})` : ""}\n${t.rawText.trim()}`);
  }
  for (const s of sessions) {
    if (s.transcript?.trim()) parts.push(`# Sesión: ${s.title}\n${s.transcript.trim()}`);
  }
  const context = parts.join("\n\n---\n\n");
  if (!context.trim()) {
    return NextResponse.json(
      { error: "Agregá al menos un transcript o una sesión con transcripción antes de generar." },
      { status: 400 },
    );
  }

  const last = await prisma.projectCanvas.aggregate({
    where: { businessCaseId: id },
    _max: { version: true },
  });
  const version = (last._max.version ?? 0) + 1;

  const run = await prisma.agentRun.create({
    data: {
      clientId: bc.clientId,
      businessCaseId: id,
      status: "RUNNING",
      agentSlug: "business-case",
      stepLabel: `Generación v${version}`,
    },
    select: { id: true },
  });

  try {
    const generated = await generateCanvasSections(context);
    const canvasId = await createBusinessCaseCanvas(id, version);

    const canvasSections = await prisma.canvasSection.findMany({
      where: { canvasId },
      select: { id: true, key: true },
    });
    const sectionIdByKey = new Map(canvasSections.map((s) => [s.key, s.id]));

    for (const gs of generated) {
      const sectionId = sectionIdByKey.get(gs.key);
      if (!sectionId) continue;
      await prisma.canvasBlock.create({
        data: {
          sectionId,
          blockType: "TEXT",
          content: gs.markdown,
          order: 0,
          source: "AGENT",
          status: "DRAFT",
          agentRunId: run.id,
        },
      });
    }

    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "DONE" } });
    return NextResponse.json({ canvasId, version });
  } catch (e) {
    const message = e instanceof Error ? e.message : "error desconocido";
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "ERROR", output: message } });
    return NextResponse.json({ error: "La generación falló: " + message }, { status: 500 });
  }
}
