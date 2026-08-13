/**
 * GET /api/projects/[projectId]/delivery/readiness
 *
 * Qué va a decir el documento de Entrega ANTES de generarlo, y qué va a omitir.
 *
 * Existe porque un documento honesto puede seguir siendo vergonzoso: la primera corrida real
 * sobre Wherex salió diciendo «1 de 10 fases cerradas». Es cierto —el cronograma dice eso— pero
 * el CSE tiene derecho a verlo antes de apretar Generar, no después de leerlo en el papel.
 *
 * Solo lee. La decisión de generar igual es del CSE; lo único que este dato traba es publicar
 * (ver `lib/delivery/readiness.ts`).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { loadProjectSummary } from "@/lib/portfolio/load";
import { getProjectMemberSessions } from "@/lib/sessions/project-sources";
import { tagLabels } from "@/lib/tags/catalog";
import { buildDeliveryClaims, cronogramaSinMarcar, type FaseParaEntrega } from "@/lib/delivery/claims";
import { deliveryReadiness } from "@/lib/delivery/readiness";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const [project, summary, membresia] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: {
        tags: true,
        timeline: {
          select: {
            anchorStartDate: true,
            closeDateOverride: true,
            phases: {
              orderBy: { order: "asc" },
              select: {
                name: true,
                status: true,
                durationWeeks: true,
                startWeek: true,
                tasks: { select: { title: true, status: true, party: true } },
              },
            },
          },
        },
      },
    }),
    loadProjectSummary(projectId).catch(() => null),
    getProjectMemberSessions(projectId).catch(() => ({ sessions: [] as Array<{ id: string }> })),
  ]);

  const fases: FaseParaEntrega[] = (project?.timeline?.phases ?? []).map((f) => ({
    name: f.name,
    status: f.status,
    durationWeeks: f.durationWeeks,
    startWeek: f.startWeek,
    tasks: f.tasks.map((t) => ({ title: t.title, status: t.status, party: t.party })),
  }));

  const claims = buildDeliveryClaims({
    fases,
    anchorStartDate: project?.timeline?.anchorStartDate?.toISOString() ?? null,
    closeDateOverride: project?.timeline?.closeDateOverride?.toISOString() ?? null,
    closing: summary?.closing ?? { projectedISO: null, promisedISO: null, driftDays: null },
    reuniones: membresia.sessions.length,
    corrimiento: null,
    hubs: tagLabels(project?.tags ?? []),
  });

  /* ⚠ La cobertura REAL (cuántas reuniones tienen transcripción) exigiría leer el contenido de
     todas — caro para una pantalla que se pinta al entrar. Se aproxima con el total, y el
     runner —que sí las lee— le pasa la cobertura exacta al agente. El aviso de cobertura baja
     por lo tanto es conservador: avisa de menos, nunca de más. */
  const readiness = deliveryReadiness({
    claims,
    cobertura: { conContenido: membresia.sessions.length, total: membresia.sessions.length },
    sinMarcar: cronogramaSinMarcar(fases),
  });

  return NextResponse.json(readiness);
}
