/**
 * lib/marketing/queries.ts
 *
 * Lecturas Prisma del módulo Marketing + Contenido (server-only).
 * Single-tenant: ninguna query cuelga de Client.
 */
import { prisma } from "@/lib/db/prisma";
import type { IcpSection } from "@prisma/client";
import { ICP_SECTION_ORDER } from "./seed-data";

/** Ventana de inspiración para la generación: posts de los últimos 3 meses. */
export function inspirationWindowStart(now = new Date()): Date {
  const d = new Date(now);
  d.setMonth(d.getMonth() - 3);
  return d;
}

// ── Insumos ────────────────────────────────────────────────────────────────────

export async function getIcpItems() {
  return prisma.icpItem.findMany({ orderBy: [{ section: "asc" }, { order: "asc" }] });
}

/** ICP agrupado por sección, en el orden canónico de render (para /icp y el CRUD). */
export async function getIcpItemsGrouped(): Promise<
  Array<{ section: IcpSection; items: Array<{ id: string; label: string; order: number }> }>
> {
  const items = await getIcpItems();
  return ICP_SECTION_ORDER.map((section) => ({
    section,
    items: items
      .filter((i) => i.section === section)
      .sort((a, b) => a.order - b.order)
      .map((i) => ({ id: i.id, label: i.label, order: i.order })),
  }));
}

export async function getPersonas() {
  return prisma.buyerPersona.findMany({ orderBy: [{ order: "asc" }, { createdAt: "asc" }] });
}

export async function getPillars() {
  return prisma.contentPillar.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { ideas: true } } },
  });
}

export async function getSources() {
  return prisma.inspirationSource.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { posts: true } } },
  });
}

export async function getSettings() {
  return prisma.marketingSettings.findUnique({ where: { id: "marketing" } });
}

// ── Salidas del agente ─────────────────────────────────────────────────────────

export async function getIdeas(filter?: {
  pillarId?: string;
  runId?: string;
  state?: "sugerida" | "seleccionada" | "aprobada" | "descartada";
}) {
  // Estado derivado (misma prioridad que ideaState): descartada=discardedAt set ·
  // aprobada=usedAt set y no descartada · seleccionada=selectedAt set y no aprobada
  // ni descartada · sugerida=todos null.
  const stateWhere =
    filter?.state === "descartada"
      ? { discardedAt: { not: null } }
      : filter?.state === "aprobada"
        ? { discardedAt: null, usedAt: { not: null } }
        : filter?.state === "seleccionada"
          ? { discardedAt: null, usedAt: null, selectedAt: { not: null } }
          : filter?.state === "sugerida"
            ? { discardedAt: null, usedAt: null, selectedAt: null }
            : {};
  return prisma.contentIdea.findMany({
    where: {
      ...(filter?.pillarId ? { pillarId: filter.pillarId } : {}),
      ...(filter?.runId ? { runId: filter.runId } : {}),
      ...stateWhere,
    },
    orderBy: { createdAt: "desc" },
    include: {
      pillar: { select: { id: true, name: true } },
      sources: {
        include: {
          post: { select: { id: true, url: true, authorName: true, text: true } },
        },
      },
    },
  });
}

export async function getCampaigns(status?: "PENDING" | "APPROVED" | "DISCARDED") {
  return prisma.campaignIdea.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: "desc" },
  });
}

export async function getPendingSuggestions() {
  return prisma.pillarSuggestion.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
}

// ── Posts / runs (para /contenido) ─────────────────────────────────────────────

export async function getPostsStats(now = new Date()) {
  const windowStart = inspirationWindowStart(now);
  const [total, inWindow, bySource] = await Promise.all([
    prisma.inspirationPost.count(),
    prisma.inspirationPost.count({ where: { postedAt: { gte: windowStart } } }),
    prisma.inspirationPost.groupBy({
      by: ["sourceId"],
      _count: { _all: true },
    }),
  ]);
  return { total, inWindow, bySource: bySource.map((s) => ({ sourceId: s.sourceId, count: s._count._all })) };
}

export async function getLatestRun() {
  return prisma.marketingRun.findFirst({ orderBy: { createdAt: "desc" } });
}

export async function getRunHistory(take = 10) {
  return prisma.marketingRun.findMany({ orderBy: { createdAt: "desc" }, take });
}
