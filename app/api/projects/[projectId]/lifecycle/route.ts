/**
 * GET /api/projects/[projectId]/lifecycle
 *
 * Ciclo de vida del proyecto para la UI (workspace + página CS): etapa efectiva
 * (override ?? inferida) + razones + gates cumplidos + modalidad de adopción
 * (sugerida/confirmada) + UUS. Lee lib/lifecycle (fuente de verdad).
 */
import { NextResponse } from "next/server";
import { withProjectAccess } from "@/lib/api";
import { getProjectLifecycle } from "@/lib/lifecycle";

export const GET = withProjectAccess<{ params: Promise<{ projectId: string }> }>(
  async (_req, { params }) => {
    const { projectId } = await params;
    const lc = await getProjectLifecycle(projectId);
    if (!lc) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
    return NextResponse.json({
      effective: lc.effective,
      inferred: lc.inferred,
      source: lc.source,
      label: lc.label,
      position: lc.position,
      cycle: lc.cycle,
      reasons: lc.reasons,
      override: lc.override
        ? {
            stage: lc.override.stage,
            reason: lc.override.reason,
            at: lc.override.at?.toISOString() ?? null,
            by: lc.override.by,
          }
        : null,
      gates: lc.gates.map((g) => ({
        gate: g.gate,
        markedAt: g.markedAt.toISOString(),
        markedBy: g.markedBy,
        source: g.source,
        note: g.note,
      })),
      kickoffPublishedAt: lc.kickoffPublishedAt?.toISOString() ?? null,
      kickoffSessionAt: lc.kickoffSessionAt?.toISOString() ?? null,
      adoptionMode: {
        confirmed: lc.adoptionMode.confirmed,
        suggested: lc.adoptionMode.suggested,
        confirmedAt: lc.adoptionMode.confirmedAt?.toISOString() ?? null,
        confirmedBy: lc.adoptionMode.confirmedBy,
      },
      uus: lc.uus,
      isSuccessCase: lc.isSuccessCase,
    });
  },
);
