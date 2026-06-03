/**
 * /api/projects/[projectId]/timeline
 *
 * Endpoints del cronograma estructurado del proyecto (Fase 2 módulo externo).
 *
 *   GET    → estado actual del cronograma (o { exists: false } si no hay)
 *   PUT    → bulk edit: crea/edita/borra fases en una transacción según diff
 *   DELETE → borra todo el cronograma (cascade borra las phases)
 *
 * Todos guarded con guardAccessToProject. El acceso es interno (CSE) —
 * el cliente externo NUNCA toca este endpoint; cuando se construya el landing
 * de Fase 3, decidiremos cómo expone esta data al cliente (read-only, con
 * fechas calculadas a partir de anchorStartDate).
 *
 * Patrón de PUT bulk: el frontend manda el array completo de phases con cada
 * edición. Las phases con `id` que matchea existente → UPDATE (source pasa de
 * AGENT a MODIFIED si lo era). Phases existentes que no aparecen en el body
 * → DELETE. Phases del body sin `id` → CREATE con source=HUMAN.
 *
 * Si no existía cronograma y llega un PUT, se crea sobre la marcha
 * (lastEditedByHuman = now, todas las phases nacen como HUMAN).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import type { TimelinePhaseSource } from "@prisma/client";

// ── Tipos del body ───────────────────────────────────────────────────────────

interface PhaseInput {
  id?: string;
  name: string;
  order: number;
  durationWeeks: number;
  sessionCount?: number | null;
  notes?: string | null;
}

interface PutBody {
  anchorStartDate?: string | null;
  phases: PhaseInput[];
}

// ── Validador inline ─────────────────────────────────────────────────────────

interface ValidationResult {
  valid: boolean;
  errors?: string[];
  parsed?: PutBody;
}

function validateTimelinePayload(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object") {
    return { valid: false, errors: ["Body debe ser un objeto JSON"] };
  }
  const body = raw as Record<string, unknown>;

  // anchorStartDate (opcional)
  let anchorStartDate: string | null = null;
  if (body.anchorStartDate !== undefined && body.anchorStartDate !== null) {
    if (typeof body.anchorStartDate !== "string") {
      errors.push("anchorStartDate debe ser string ISO o null");
    } else {
      const d = new Date(body.anchorStartDate);
      if (isNaN(d.getTime())) {
        errors.push("anchorStartDate no es una fecha ISO válida");
      } else {
        anchorStartDate = body.anchorStartDate;
      }
    }
  }

  // phases (obligatorio, array)
  if (!Array.isArray(body.phases)) {
    errors.push("phases debe ser un array");
    return { valid: false, errors };
  }

  const parsedPhases: PhaseInput[] = [];
  body.phases.forEach((p, idx) => {
    if (!p || typeof p !== "object") {
      errors.push(`phases[${idx}] debe ser un objeto`);
      return;
    }
    const ph = p as Record<string, unknown>;
    if (typeof ph.name !== "string" || ph.name.trim().length === 0) {
      errors.push(`phases[${idx}].name requerido (string no vacío)`);
      return;
    }
    if (typeof ph.order !== "number" || !Number.isInteger(ph.order) || ph.order < 0) {
      errors.push(`phases[${idx}].order requerido (entero >= 0)`);
      return;
    }
    if (typeof ph.durationWeeks !== "number" || !Number.isInteger(ph.durationWeeks) || ph.durationWeeks <= 0) {
      errors.push(`phases[${idx}].durationWeeks requerido (entero > 0)`);
      return;
    }
    let sessionCount: number | null = null;
    if (ph.sessionCount !== undefined && ph.sessionCount !== null) {
      if (typeof ph.sessionCount !== "number" || !Number.isInteger(ph.sessionCount) || ph.sessionCount <= 0) {
        errors.push(`phases[${idx}].sessionCount debe ser entero > 0 o null`);
        return;
      }
      sessionCount = ph.sessionCount;
    }
    let notes: string | null = null;
    if (ph.notes !== undefined && ph.notes !== null) {
      if (typeof ph.notes !== "string") {
        errors.push(`phases[${idx}].notes debe ser string o null`);
        return;
      }
      notes = ph.notes;
    }
    let id: string | undefined;
    if (ph.id !== undefined) {
      if (typeof ph.id !== "string" || ph.id.length === 0) {
        errors.push(`phases[${idx}].id debe ser string no vacío si está presente`);
        return;
      }
      id = ph.id;
    }
    parsedPhases.push({ id, name: ph.name.trim(), order: ph.order, durationWeeks: ph.durationWeeks, sessionCount, notes });
  });

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, parsed: { anchorStartDate, phases: parsedPhases } };
}

// ── Helpers de respuesta ─────────────────────────────────────────────────────

interface TimelineResponse {
  exists: true;
  anchorStartDate: string | null;
  lastEditedByHuman: string | null;
  generatedByAgentRunId: string | null;
  phases: Array<{
    id: string;
    name: string;
    order: number;
    durationWeeks: number;
    sessionCount: number | null;
    notes: string | null;
    source: TimelinePhaseSource;
  }>;
}

async function loadTimeline(projectId: string): Promise<TimelineResponse | { exists: false }> {
  const tl = await prisma.projectTimeline.findUnique({
    where: { projectId },
    select: {
      anchorStartDate: true,
      lastEditedByHuman: true,
      generatedByAgentRunId: true,
      phases: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          name: true,
          order: true,
          durationWeeks: true,
          sessionCount: true,
          notes: true,
          source: true,
        },
      },
    },
  });
  if (!tl) return { exists: false };
  return {
    exists: true,
    anchorStartDate: tl.anchorStartDate?.toISOString() ?? null,
    lastEditedByHuman: tl.lastEditedByHuman?.toISOString() ?? null,
    generatedByAgentRunId: tl.generatedByAgentRunId,
    phases: tl.phases,
  };
}

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const result = await loadTimeline(projectId);
  return NextResponse.json(result);
}

// ── PUT (bulk edit con diff) ─────────────────────────────────────────────────

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const validation = validateTimelinePayload(raw);
  if (!validation.valid || !validation.parsed) {
    return NextResponse.json(
      { error: "Body inválido", details: validation.errors },
      { status: 400 },
    );
  }
  const { anchorStartDate, phases: incomingPhases } = validation.parsed;

  const now = new Date();
  const anchorDate = anchorStartDate ? new Date(anchorStartDate) : null;

  // Transacción: upsert del timeline + diff de phases (delete + update + create)
  await prisma.$transaction(async (tx) => {
    // 1. Upsert del timeline
    const tl = await tx.projectTimeline.upsert({
      where: { projectId },
      create: {
        projectId,
        anchorStartDate: anchorDate,
        lastEditedByHuman: now,
        // generatedByAgentRunId queda null — este es un cronograma creado a mano sin agente
      },
      update: {
        anchorStartDate: anchorDate,
        lastEditedByHuman: now,
      },
      select: { id: true },
    });

    // 2. Phases existentes en DB
    const existingPhases = await tx.timelinePhase.findMany({
      where: { timelineId: tl.id },
      select: { id: true, source: true },
    });
    const existingIds = new Set(existingPhases.map((p) => p.id));
    const incomingIds = new Set(
      incomingPhases.filter((p) => p.id).map((p) => p.id as string),
    );

    // 3. DELETE: phases en DB que no aparecen en el body
    const idsToDelete = existingPhases
      .filter((p) => !incomingIds.has(p.id))
      .map((p) => p.id);
    if (idsToDelete.length > 0) {
      await tx.timelinePhase.deleteMany({
        where: { id: { in: idsToDelete } },
      });
    }

    // 4. UPDATE + CREATE
    for (const p of incomingPhases) {
      if (p.id && existingIds.has(p.id)) {
        // UPDATE: source AGENT → MODIFIED si fue editado por humano
        const existing = existingPhases.find((e) => e.id === p.id);
        const newSource: TimelinePhaseSource =
          existing?.source === "AGENT" ? "MODIFIED" : existing?.source ?? "MODIFIED";
        await tx.timelinePhase.update({
          where: { id: p.id },
          data: {
            name: p.name,
            order: p.order,
            durationWeeks: p.durationWeeks,
            sessionCount: p.sessionCount,
            notes: p.notes,
            source: newSource,
          },
        });
      } else {
        // CREATE: phase nueva, source=HUMAN
        await tx.timelinePhase.create({
          data: {
            timelineId: tl.id,
            name: p.name,
            order: p.order,
            durationWeeks: p.durationWeeks,
            sessionCount: p.sessionCount,
            notes: p.notes,
            source: "HUMAN",
          },
        });
      }
    }
  });

  // 5. Re-cargar y devolver el estado final
  const updated = await loadTimeline(projectId);
  return NextResponse.json(updated);
}

// ── DELETE (cascade borra todas las phases) ──────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const existing = await prisma.projectTimeline.findUnique({
    where: { projectId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ deleted: false, reason: "no_timeline" }, { status: 404 });
  }

  await prisma.projectTimeline.delete({
    where: { projectId },
  });

  return NextResponse.json({ deleted: true });
}
