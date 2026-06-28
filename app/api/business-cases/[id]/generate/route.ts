/**
 * POST /api/business-cases/[id]/generate
 *
 * Llena el canvas del business case con el agente (datos ESTRUCTURADOS por sección):
 *   1. Junta el contexto (transcripts pegados/subidos + transcripts de las
 *      sesiones incluidas).
 *   2. Elige el canvas destino: si el canvas activo está VACÍO (template recién
 *      creado) → lo llena en su lugar; si ya tiene contenido → crea "Caso de uso N+1".
 *   3. El agente produce `data` por sección → escribe ese data en el bloque de cada
 *      sección (DRAFT/AGENT). El vendedor confirma/edita después.
 *
 * Exige ≥1 fuente de contexto. Gateado con guardSalesAccess.
 */
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { createBusinessCaseCanvas } from "@/lib/canvas/default-canvases";
import { generateCanvasSections } from "@/lib/business-cases/canvas-agent";

/** Un `data` estructurado está "vacío" si todos sus strings y arrays lo están. */
function dataIsBlank(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.every(dataIsBlank);
  if (typeof v === "object") return Object.values(v as Record<string, unknown>).every(dataIsBlank);
  return false;
}

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

  // ── Canvas destino: llenar el activo si está vacío, si no crear versión nueva ──
  const active = await prisma.projectCanvas.findFirst({
    where: { businessCaseId: id, isActive: true },
    select: {
      id: true,
      version: true,
      canvasSections: { select: { key: true, agentBriefOverride: true, blocks: { select: { data: true, content: true } } } },
    },
  });
  const activeHasContent =
    !!active &&
    active.canvasSections.some((s) =>
      s.blocks.some((b) => !dataIsBlank(b.data) || (b.content ?? "").trim() !== ""),
    );

  const run = await prisma.agentRun.create({
    data: {
      clientId: bc.clientId,
      businessCaseId: id,
      status: "RUNNING",
      agentSlug: "business-case",
      stepLabel: active && !activeHasContent ? `Generación v${active.version}` : "Generación",
    },
    select: { id: true },
  });

  try {
    // Guía efectiva por sección: el override del CSE en el canvas activo gana (si no,
    // el agente cae al brief por defecto de la config). Así, si el CSE editó la guía,
    // el agente genera según lo que dice esa sección.
    const briefsByKey: Record<string, string> = {};
    for (const s of active?.canvasSections ?? []) {
      if (s.agentBriefOverride) briefsByKey[s.key] = s.agentBriefOverride;
    }
    const generated = await generateCanvasSections(context, briefsByKey);

    let canvasId: string;
    let version: number;
    if (active && !activeHasContent) {
      canvasId = active.id;
      version = active.version;
    } else {
      const last = await prisma.projectCanvas.aggregate({
        where: { businessCaseId: id },
        _max: { version: true },
      });
      version = (last._max.version ?? 0) + 1;
      canvasId = await createBusinessCaseCanvas(id, version);
    }

    // 1 bloque por sección: escribimos el data generado en el bloque existente
    // (sembrado vacío) o lo creamos si faltara.
    const sections = await prisma.canvasSection.findMany({
      where: { canvasId },
      select: { id: true, key: true, blocks: { select: { id: true }, orderBy: { order: "asc" }, take: 1 } },
    });
    const sectionByKey = new Map(sections.map((s) => [s.key, s]));

    for (const gs of generated) {
      const section = sectionByKey.get(gs.key);
      if (!section) continue;
      const blockId = section.blocks[0]?.id;
      const data = gs.data as Prisma.InputJsonValue;
      if (blockId) {
        await prisma.canvasBlock.update({
          where: { id: blockId },
          data: { data, content: null, source: "AGENT", status: "DRAFT", agentRunId: run.id },
        });
      } else {
        await prisma.canvasBlock.create({
          data: { sectionId: section.id, blockType: "CARD", content: null, data, order: 0, source: "AGENT", status: "DRAFT", agentRunId: run.id },
        });
      }
    }

    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "DONE" } });
    return NextResponse.json({ canvasId, version });
  } catch (e) {
    const message = e instanceof Error ? e.message : "error desconocido";
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "ERROR", output: message } });
    return NextResponse.json({ error: "La generación falló: " + message }, { status: 500 });
  }
}
