/**
 * lib/portfolio/load.ts
 *
 * D.3 panel de cartera — carga BATCH de todos los proyectos visibles con su resumen.
 * UNA sola query anidada (Project → timeline → phases/tasks + baseline activo + último
 * PROGRESS), y luego mapea cada proyecto por computeProjectSummary (puro). Sin N+1.
 *
 * `clientWhere` viene de accessibleClientWhere(user): null para roles see-all (toda la
 * cartera), o un filtro scopeado. El panel es de seeAllClients, pero el filtro se respeta
 * por si en el futuro un rol scopeado lo usa.
 */
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { computeProjectSummary, type ProjectSummary } from "./summary";
import type { BaselineSnapshot } from "@/lib/timeline/baseline";

export interface PortfolioRow {
  projectId: string;
  projectName: string;
  clientId: string;
  clientName: string;
  clientCompany: string | null;
  cseName: string | null;
  cseEmail: string | null;
  stageLabel: string | null;
  status: string;
  timelinePublished: boolean;
  createdAt: string;
  summary: ProjectSummary;
  healthOverrideReason: string | null;
  healthOverrideAt: string | null;
  healthOverrideBy: string | null;
}

export async function loadPortfolio(
  clientWhere: Prisma.ClientWhereInput | null,
): Promise<PortfolioRow[]> {
  const projects = await prisma.project.findMany({
    where: clientWhere ? { client: clientWhere } : undefined,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      clientId: true,
      status: true,
      hubspotOwnerName: true,
      hubspotOwnerEmail: true,
      hubspotPipelineStageLabel: true,
      timelinePublishedAt: true,
      createdAt: true,
      healthStatusOverride: true,
      healthStatusOverrideReason: true,
      healthStatusOverrideAt: true,
      healthStatusOverrideBy: true,
      client: { select: { name: true, company: true } },
      timeline: {
        select: {
          anchorStartDate: true,
          phases: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              status: true,
              order: true,
              durationWeeks: true,
              actualStart: true,
              actualEnd: true,
              tasks: {
                select: {
                  id: true,
                  status: true,
                  weekIndex: true,
                  actualStart: true,
                  actualEnd: true,
                  needsValidation: true,
                },
              },
            },
          },
          baselines: { where: { isActive: true }, take: 1, select: { snapshot: true, firmness: true } },
          changes: {
            where: { kind: "PROGRESS" },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { createdAt: true },
          },
        },
      },
    },
  });

  const now = new Date();
  return projects.map((p) => {
    const tl = p.timeline;
    const activeBaseline = tl?.baselines?.[0] ?? null;
    const summary = computeProjectSummary({
      status: p.status,
      anchorStartDate: tl?.anchorStartDate ?? null,
      phases: (tl?.phases ?? []).map((ph) => ({
        id: ph.id,
        status: ph.status,
        order: ph.order,
        durationWeeks: ph.durationWeeks,
        actualStart: ph.actualStart,
        actualEnd: ph.actualEnd,
        tasks: ph.tasks.map((t) => ({
          id: t.id,
          status: t.status,
          weekIndex: t.weekIndex,
          actualStart: t.actualStart,
          actualEnd: t.actualEnd,
          needsValidation: t.needsValidation,
        })),
      })),
      baseline: activeBaseline
        ? {
            snapshot: activeBaseline.snapshot as unknown as BaselineSnapshot,
            firmnessLabel: (activeBaseline.firmness as { label?: string } | null)?.label ?? "WEAK",
          }
        : null,
      lastProgressAt: tl?.changes?.[0]?.createdAt ?? null,
      healthOverride: p.healthStatusOverride,
      now,
    });
    return {
      projectId: p.id,
      projectName: p.name,
      clientId: p.clientId,
      clientName: p.client.name,
      clientCompany: p.client.company,
      cseName: p.hubspotOwnerName,
      cseEmail: p.hubspotOwnerEmail,
      stageLabel: p.hubspotPipelineStageLabel,
      status: p.status,
      timelinePublished: !!p.timelinePublishedAt,
      createdAt: p.createdAt.toISOString(),
      summary,
      healthOverrideReason: p.healthStatusOverrideReason,
      healthOverrideAt: p.healthStatusOverrideAt?.toISOString() ?? null,
      healthOverrideBy: p.healthStatusOverrideBy,
    };
  });
}
