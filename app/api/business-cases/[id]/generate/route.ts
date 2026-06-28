/**
 * POST /api/business-cases/[id]/generate
 *
 * Llena el canvas del business case con el agente (datos ESTRUCTURADOS por sección):
 *   1. Junta el contexto (transcripts pegados/subidos + transcripts de las
 *      sesiones incluidas).
 *   2. Crea SIEMPRE un caso de uso nuevo (v1, v2, …); el agente lee las guías de la
 *      Plantilla (v0), que nunca se llena.
 *   3. El agente produce `data` por sección → se escribe YA ACEPTADO (CONFIRMED) en el
 *      bloque de cada sección. El vendedor edita/borra (no hay paso de "confirmar").
 *
 * Exige ≥1 fuente de contexto. Gateado con guardSalesAccess.
 */
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { createBusinessCaseCanvas } from "@/lib/canvas/default-canvases";
import { generateCanvasSections } from "@/lib/business-cases/canvas-agent";
import { loadBcFeeding } from "@/lib/business-cases/feeding";
import { briefsByKeyFrom } from "@/lib/business-cases/section-briefs";

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

  // ── Contexto: transcripts manuales + transcripts de las sesiones que ALIMENTAN
  //    el caso (regla de Ventas + overrides; mismo criterio que el panel) ─────────
  const feeding = await loadBcFeeding(id);
  const feedingIds = feeding?.feedingIds ?? [];
  const [transcripts, sessions] = await Promise.all([
    prisma.businessCaseTranscript.findMany({
      where: { businessCaseId: id },
      select: { rawText: true, fileName: true },
    }),
    feedingIds.length
      ? prisma.firefliesSession.findMany({
          where: { id: { in: feedingIds } },
          select: { title: true, date: true, transcript: true },
        })
      : Promise.resolve([] as { title: string; date: Date; transcript: string | null }[]),
  ]);

  const parts: string[] = [];
  for (const t of transcripts) {
    if (t.rawText.trim()) parts.push(`# Nota/transcript${t.fileName ? ` (${t.fileName})` : ""}\n${t.rawText.trim()}`);
  }
  let sessionsWithoutTranscript = 0;
  for (const s of sessions) {
    if (s.transcript?.trim()) parts.push(`# Sesión: ${s.title}\n${s.transcript.trim()}`);
    else sessionsWithoutTranscript++;
  }
  const context = parts.join("\n\n---\n\n");
  if (!context.trim()) {
    // Mensaje claro: distinguir "no hay fuentes" de "las sesiones no tienen transcripción aún".
    const error =
      sessionsWithoutTranscript > 0
        ? "Las sesiones del prospecto todavía no tienen transcripción. Pegá un transcript a mano en “Fuentes manuales” (o esperá a que se transcriba la reunión)."
        : "Agregá una sesión del prospecto con transcripción o pegá un transcript a mano antes de generar.";
    return NextResponse.json({ error }, { status: 400 });
  }

  // ── Guías del agente: SIEMPRE desde la Plantilla (v0). Fallback al activo (BC legacy). ──
  const template =
    (await prisma.projectCanvas.findFirst({
      where: { businessCaseId: id, version: 0 },
      select: { sections: true },
    })) ??
    (await prisma.projectCanvas.findFirst({
      where: { businessCaseId: id, isActive: true },
      select: { sections: true },
    }));

  // Guard anti-doble-generación: si ya hay una corrida en curso para este BC (otra
  // pestaña, retry de red), no arrancamos otra — evita dos casos con la misma versión.
  // Acotado a 5 min para que una corrida colgada/caída no bloquee para siempre.
  const inFlight = await prisma.agentRun.findFirst({
    where: {
      businessCaseId: id,
      agentSlug: "business-case",
      status: "RUNNING",
      createdAt: { gt: new Date(Date.now() - 5 * 60 * 1000) },
    },
    select: { id: true },
  });
  if (inFlight) {
    return NextResponse.json(
      { error: "Ya hay una generación en curso para este caso. Esperá a que termine." },
      { status: 409 },
    );
  }

  const run = await prisma.agentRun.create({
    data: {
      clientId: bc.clientId,
      businessCaseId: id,
      status: "RUNNING",
      agentSlug: "business-case",
      stepLabel: "Generación",
    },
    select: { id: true },
  });

  try {
    // Guía efectiva por sección: el override del CSE en la Plantilla gana; si no, el
    // agente cae al brief por defecto de la config (BC_DEF_BY_KEY.brief).
    const briefsByKey = briefsByKeyFrom(template?.sections);
    const generated = await generateCanvasSections(context, briefsByKey); // LLM, FUERA de la tx

    // Cada "Generar" crea un CASO NUEVO (v1, v2, …). La Plantilla (v0) nunca se llena.
    const last = await prisma.projectCanvas.aggregate({
      where: { businessCaseId: id },
      _max: { version: true },
    });
    const version = (last._max.version ?? 0) + 1;

    // Atómico: crear el caso (+ desactivar el previo) y llenar los bloques con el data
    // generado, YA ACEPTADO (CONFIRMED), TODO o NADA. Si algo falla, no queda un caso
    // vacío activo ni se desactiva el caso bueno anterior.
    const canvasId = await prisma.$transaction(async (tx) => {
      const cid = await createBusinessCaseCanvas(id, version, tx);
      const sections = await tx.canvasSection.findMany({
        where: { canvasId: cid },
        select: { id: true, key: true, blocks: { select: { id: true }, orderBy: { order: "asc" }, take: 1 } },
      });
      const sectionByKey = new Map(sections.map((s) => [s.key, s]));
      for (const gs of generated) {
        const section = sectionByKey.get(gs.key);
        if (!section) continue;
        const blockId = section.blocks[0]?.id;
        const data = gs.data as Prisma.InputJsonValue;
        if (blockId) {
          await tx.canvasBlock.update({
            where: { id: blockId },
            data: { data, content: null, source: "AGENT", status: "CONFIRMED", agentRunId: run.id },
          });
        } else {
          await tx.canvasBlock.create({
            data: { sectionId: section.id, blockType: "CARD", content: null, data, order: 0, source: "AGENT", status: "CONFIRMED", agentRunId: run.id },
          });
        }
      }
      return cid;
    });

    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "DONE" } });
    return NextResponse.json({ canvasId, version });
  } catch (e) {
    const message = e instanceof Error ? e.message : "error desconocido";
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "ERROR", output: message } });
    return NextResponse.json({ error: "La generación falló: " + message }, { status: 500 });
  }
}
