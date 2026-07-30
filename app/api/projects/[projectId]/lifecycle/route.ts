/**
 * GET /api/projects/[projectId]/lifecycle
 *
 * Ciclo de vida del proyecto para la UI (workspace + página CS). Lee lib/lifecycle
 * (fuente de verdad) y devuelve UNA DE DOS FORMAS, discriminadas por `fuente`:
 *
 *  · `"customer-success"` → el ciclo de 8 etapas de Nexus: etapa efectiva (override ??
 *    inferida) + razones + compuertas cumplidas + modalidad de adopción + UUS.
 *  · `"pipeline"` → la etapa la mueve el equipo EN HUBSPOT y Nexus la espeja: su línea de
 *    etapas, la posición, y cuándo se sincronizó. Nada que marcar acá.
 *
 * El DTO no se "unifica" a propósito. Mandar los dos con los mismos campos obligaría a
 * rellenar compuertas vacías y una etapa inventada para el segundo caso, y la pantalla no
 * tendría cómo saber que esos ceros no significan nada.
 */
import { NextResponse } from "next/server";
import { withProjectAccess } from "@/lib/api";
import { getProjectLifecycle } from "@/lib/lifecycle";

export const GET = withProjectAccess<{ params: Promise<{ projectId: string }> }>(
  async (_req, { params }) => {
    const { projectId } = await params;
    const lc = await getProjectLifecycle(projectId);
    if (!lc) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

    if (lc.fuente === "pipeline") {
      return NextResponse.json({
        fuente: "pipeline",
        pipeline: lc.pipeline,
        label: lc.label,
        stageId: lc.stageId,
        // Fuera de línea = Cancelado / Bloqueado / etapa que la tabla no declara. La
        // pantalla la pinta en tono neutro y sin "Etapa i/N".
        enLinea: lc.etapa?.enLinea ?? false,
        position: lc.position,
        order: lc.linea.map((s) => ({ id: s.id, label: s.label })),
        stageSyncedAt: lc.stageSyncedAt?.toISOString() ?? null,
      });
    }

    return NextResponse.json({
      fuente: "customer-success",
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
