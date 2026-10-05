/**
 * lib/marketing/queries.ts
 *
 * Lecturas Prisma del módulo Marketing + Contenido (server-only).
 * Single-tenant: ninguna query cuelga de Client.
 */
import { prisma } from "@/lib/db/prisma";
import type { IcpSection, Prisma } from "@prisma/client";
import { ICP_SECTION_ORDER } from "./seed-data";
import { CONTENT_IDEA_STATES } from "./schema";
import type { ContentIdeaState, MarketingPostTypeValue, MarketingJourneyStageValue } from "./schema";

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

/** Los números de las pestañas de Audiencia. */
export async function getConteosAudiencia() {
  const [icp, personas] = await Promise.all([prisma.icpItem.count(), prisma.buyerPersona.count()]);
  return { icp, personas };
}

export async function getPersonas() {
  return prisma.buyerPersona.findMany({ orderBy: [{ order: "asc" }, { createdAt: "asc" }] });
}

export async function getPillars() {
  const [pillars, sinRevisar] = await Promise.all([
    prisma.contentPillar.findMany({
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      include: { _count: { select: { ideas: true } } },
    }),
    // Las sugeridas que nadie miró, por tema: dice qué tema está llenando la cola.
    prisma.contentIdea.groupBy({ by: ["pillarId"], where: whereDeEstado("sugerida"), _count: { _all: true } }),
  ]);
  const porTema = new Map(sinRevisar.map((g) => [g.pillarId, g._count._all]));
  return pillars.map((p) => ({ ...p, sinRevisar: porTema.get(p.id) ?? 0 }));
}

export async function getSources() {
  return prisma.inspirationSource.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { posts: true } } },
  });
}

/**
 * Las fuentes con lo que aportan: posts de los últimos 3 meses (los que entran a la tanda) y cuántas publicaciones
 * del agente citan al menos un post suyo. Medido el 2026-10-04: una sola fuente aparecía en las 112 publicaciones.
 */
export async function getSourcesConUso(now = new Date()) {
  const windowStart = inspirationWindowStart(now);
  const [sources, enVentana, citas, totalIdeas] = await Promise.all([
    getSources(),
    prisma.inspirationPost.groupBy({
      by: ["sourceId"],
      where: { postedAt: { gte: windowStart } },
      _count: { _all: true },
    }),
    prisma.contentIdeaSource.findMany({ select: { ideaId: true, post: { select: { sourceId: true } } } }),
    prisma.contentIdea.count(),
  ]);
  const ventana = new Map(enVentana.map((g) => [g.sourceId, g._count._all]));
  const ideasPorFuente = new Map<string, Set<string>>();
  for (const c of citas) {
    const set = ideasPorFuente.get(c.post.sourceId) ?? new Set<string>();
    set.add(c.ideaId);
    ideasPorFuente.set(c.post.sourceId, set);
  }
  return {
    totalIdeas,
    sources: sources.map((s) => ({
      ...s,
      postsEnVentana: ventana.get(s.id) ?? 0,
      ideasInspiradas: ideasPorFuente.get(s.id)?.size ?? 0,
    })),
  };
}

export async function getSettings() {
  return prisma.marketingSettings.findUnique({ where: { id: "marketing" } });
}

/**
 * Lo que lee el agente en cada tanda, contado: el panel de Voz de marca y la tarjeta «Lo que entra» de Generación.
 */
export async function getResumenInsumos(now = new Date()) {
  const [temas, icpItems, personasActivas, fuentesActivas, postsEnVentana, postsTotal, settings] = await Promise.all([
    prisma.contentPillar.findMany({ where: { active: true }, select: { name: true, isCampaign: true } }),
    prisma.icpItem.count(),
    prisma.buyerPersona.count({ where: { active: true } }),
    prisma.inspirationSource.count({ where: { active: true } }),
    prisma.inspirationPost.count({ where: { postedAt: { gte: inspirationWindowStart(now) } } }),
    prisma.inspirationPost.count(),
    getSettings(),
  ]);
  return {
    temasActivos: temas.length,
    temasEnCampana: temas.filter((t) => t.isCampaign).map((t) => t.name),
    icpItems,
    personasActivas,
    fuentesActivas,
    postsEnVentana,
    postsTotal,
    genEmpresaTarget: settings?.genEmpresaTarget ?? null,
    genPersonaTarget: settings?.genPersonaTarget ?? null,
    lastCronDateKey: settings?.lastCronDateKey ?? null,
  };
}

export type ResumenInsumos = Awaited<ReturnType<typeof getResumenInsumos>>;

// ── Salidas del agente ─────────────────────────────────────────────────────────

/**
 * Estado derivado (misma prioridad que ideaState): descartada=discardedAt set · aprobada=usedAt set y no descartada ·
 * seleccionada=selectedAt set y no aprobada ni descartada · sugerida=todos null.
 */
function whereDeEstado(state: ContentIdeaState): Prisma.ContentIdeaWhereInput {
  switch (state) {
    case "descartada":
      return { discardedAt: { not: null } };
    case "aprobada":
      return { discardedAt: null, usedAt: { not: null } };
    case "seleccionada":
      return { discardedAt: null, usedAt: null, selectedAt: { not: null } };
    case "sugerida":
      return { discardedAt: null, usedAt: null, selectedAt: null };
  }
}

export interface ConteoPorTipo {
  total: number;
  EMPRESA: number;
  PERSONA: number;
}

/** Cuántas publicaciones hay en cada estado, y de qué tipo: los números de las pestañas y del segmentado. */
export async function getIdeaCounts(): Promise<Record<ContentIdeaState, ConteoPorTipo>> {
  const porEstado = await Promise.all(
    CONTENT_IDEA_STATES.map((state) =>
      prisma.contentIdea.groupBy({ by: ["postType"], where: whereDeEstado(state), _count: { _all: true } }),
    ),
  );
  const out = {} as Record<ContentIdeaState, ConteoPorTipo>;
  CONTENT_IDEA_STATES.forEach((state, i) => {
    const c: ConteoPorTipo = { total: 0, EMPRESA: 0, PERSONA: 0 };
    for (const g of porEstado[i]) {
      c[g.postType] = g._count._all;
      c.total += g._count._all;
    }
    out[state] = c;
  });
  return out;
}

export async function getIdeas(filter?: {
  pillarId?: string;
  runId?: string;
  state?: ContentIdeaState;
  postType?: MarketingPostTypeValue;
  journeyStage?: MarketingJourneyStageValue;
}) {
  const ideas = await prisma.contentIdea.findMany({
    where: {
      ...(filter?.pillarId ? { pillarId: filter.pillarId } : {}),
      ...(filter?.runId ? { runId: filter.runId } : {}),
      ...(filter?.postType ? { postType: filter.postType } : {}),
      ...(filter?.journeyStage ? { journeyStage: filter.journeyStage } : {}),
      ...(filter?.state ? whereDeEstado(filter.state) : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      pillar: { select: { id: true, name: true } },
      // El texto del post NO viaja (pesaba ~1.500 caracteres por post y nadie lo pintaba): la pantalla dice de qué
      // fuente sale y enlaza al post.
      sources: {
        include: {
          post: {
            select: {
              id: true,
              url: true,
              authorName: true,
              postedAt: true,
              source: { select: { label: true, profileUrl: true } },
            },
          },
        },
      },
    },
  });

  // Resolver el email de quien aceptó → nombre del TeamMember (para "Usada por X").
  const emails = [...new Set(ideas.map((i) => i.acceptedByEmail).filter((e): e is string => !!e))];
  const members = emails.length
    ? await prisma.teamMember.findMany({
        where: { email: { in: emails } },
        select: { email: true, name: true },
      })
    : [];
  const nameByEmail = new Map(members.map((m) => [m.email, m.name]));

  return ideas.map((idea) => ({
    ...idea,
    // null si el email no matchea un TeamMember (p.ej. cuenta dada de baja).
    acceptedByName: idea.acceptedByEmail ? (nameByEmail.get(idea.acceptedByEmail) ?? null) : null,
  }));
}

export async function getCampaigns(status?: "PENDING" | "APPROVED" | "DISCARDED") {
  return prisma.campaignIdea.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: "desc" },
  });
}

/** Cuántas ideas de SEM hay por estado y canal: los números de las pestañas y del segmentado. */
export async function getCampaignCounts() {
  const filas = await prisma.campaignIdea.groupBy({ by: ["status", "channel"], _count: { _all: true } });
  const out: Record<"PENDING" | "APPROVED" | "DISCARDED", { total: number; porCanal: Record<string, number> }> = {
    PENDING: { total: 0, porCanal: {} },
    APPROVED: { total: 0, porCanal: {} },
    DISCARDED: { total: 0, porCanal: {} },
  };
  for (const f of filas) {
    out[f.status].total += f._count._all;
    out[f.status].porCanal[f.channel] = (out[f.status].porCanal[f.channel] ?? 0) + f._count._all;
  }
  return out;
}

export async function getPendingSuggestions() {
  return prisma.pillarSuggestion.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
}

// ── Posts / runs (para Generación) ─────────────────────────────────────────────

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
  const runs = await prisma.marketingRun.findMany({
    orderBy: { createdAt: "desc" },
    take,
    // rawOutput es el JSON crudo de Claude (decenas de kB por corrida): la pantalla no lo usa.
    omit: { rawOutput: true },
  });
  const emails = [...new Set(runs.map((r) => r.startedByEmail).filter((e): e is string => !!e))];
  const members = emails.length
    ? await prisma.teamMember.findMany({ where: { email: { in: emails } }, select: { email: true, name: true } })
    : [];
  const nombre = new Map(members.map((m) => [m.email, m.name]));
  return runs.map((r) => ({ ...r, startedByName: r.startedByEmail ? (nombre.get(r.startedByEmail) ?? null) : null }));
}
