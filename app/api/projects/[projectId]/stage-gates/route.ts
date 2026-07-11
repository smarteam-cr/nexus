/**
 * /api/projects/[projectId]/stage-gates
 *
 * Ciclo de vida — el CSE marca/desmarca las VALIDACIONES DE SALIDA de etapa
 * (ProjectStageGate). Marcar mueve la etapa inferida; desmarcar la retrocede
 * (DELETE de la fila — reversible por diseño).
 *
 *   POST   { gate: <ProjectStageGateKey>, note? } → upsert (source "cse")
 *   DELETE { gate }                               → desmarca
 *
 * Guard: acceso al proyecto (los gates son trabajo operativo del CSE, no
 * curación de cartera — el override de etapa sí exige seeAllClients).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import type { ProjectStageGateKey } from "@prisma/client";

const GATES: ProjectStageGateKey[] = [
  "ENTENDIMIENTO_CERRADO", "DIAGNOSTICO_COMPARTIDO", "CRONOGRAMA_CONSENSUADO",
  "DEMO_APROBADA", "CLIENTE_OPERANDO", "USO_VALIDADO", "ENTREGA_REALIZADA",
];

function parseGate(v: unknown): ProjectStageGateKey | null {
  return typeof v === "string" && (GATES as string[]).includes(v) ? (v as ProjectStageGateKey) : null;
}

export async function POST(
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
    raw = {};
  }
  const body = (raw ?? {}) as { gate?: unknown; note?: unknown };
  const gate = parseGate(body.gate);
  if (!gate) return NextResponse.json({ error: `gate debe ser uno de ${GATES.join("|")}` }, { status: 400 });
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 2000) : null;

  const row = await prisma.projectStageGate.upsert({
    where: { projectId_gate: { projectId, gate } },
    // Ya marcado: solo refrescar la nota si vino (no pisar markedAt/markedBy).
    update: note ? { note } : {},
    create: {
      projectId,
      gate,
      markedBy: guard.user.email ?? null,
      source: "cse",
      note,
    },
  });
  return NextResponse.json({ ok: true, gate: row.gate, markedAt: row.markedAt.toISOString() });
}

export async function DELETE(
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
    raw = {};
  }
  const gate = parseGate((raw as { gate?: unknown })?.gate);
  if (!gate) return NextResponse.json({ error: `gate debe ser uno de ${GATES.join("|")}` }, { status: 400 });

  const deleted = await prisma.projectStageGate.deleteMany({ where: { projectId, gate } });
  console.log(`[stage-gates] ${guard.user.email ?? "?"} desmarcó ${gate} de ${projectId} (${deleted.count} fila)`);
  return NextResponse.json({ ok: true, removed: deleted.count > 0 });
}
