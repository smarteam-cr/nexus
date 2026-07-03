/**
 * lib/marketing/runs.ts
 *
 * Orquestador de corridas del módulo Contenido (server-only):
 *   INGEST   → scrapea las fuentes activas (secuencial, error por-fuente no tumba)
 *   GENERATE → corre el agente sobre lo guardado (últimos 3 meses)
 *   CHAIN    → ingesta + generación SIEMPRE (garantiza que el equipo tenga ideas
 *              frescas el lunes, aunque esa semana ninguna fuente haya publicado
 *              nada nuevo — genera igual con lo guardado en la ventana de 3
 *              meses). Si la ingesta falla del todo, NO cancela la generación:
 *              intenta igual con lo que ya había guardado (solo si no hay NADA
 *              guardado falla, con mensaje claro). Es la corrida que dispara el
 *              cron de los viernes — su confiabilidad es la promesa del lunes.
 *
 * Patrón async del repo: el endpoint crea el MarketingRun (RUNNING) y lanza
 * `runMarketingRun` fire-and-forget; el front pollea GET /api/marketing/runs/[id].
 * El progreso se persiste en `run.phase` (copy del polling).
 */
import { prisma } from "@/lib/db/prisma";
import type { MarketingRunKind, MarketingRunTrigger } from "@prisma/client";
import { getInspirationProvider, InspirationProviderError } from "./inspiration";
import { runGenerateIdeasAgent } from "./agents/generate-ideas";

const POSTS_PER_SOURCE = 20;
/** Un run RUNNING más viejo que esto se considera zombi (proceso reiniciado). */
const STALE_RUNNING_MS = 15 * 60 * 1000;

/** ¿Hay una corrida en curso (no zombi)? Para el guard 409 y el cron. */
export async function findActiveRun() {
  return prisma.marketingRun.findFirst({
    where: { status: "RUNNING", createdAt: { gte: new Date(Date.now() - STALE_RUNNING_MS) } },
    orderBy: { createdAt: "desc" },
  });
}

/** Crea el run y dispara el trabajo en background. Devuelve el run RUNNING. */
export async function startMarketingRun(
  kind: MarketingRunKind,
  trigger: MarketingRunTrigger,
  startedByEmail: string | null,
) {
  const run = await prisma.marketingRun.create({
    data: {
      kind,
      trigger,
      startedByEmail,
      phase: kind === "GENERATE" ? "generacion" : "ingesta",
    },
  });
  // Fire-and-forget (patrón updateCanvasAsync): el error queda en el run, no revienta nada.
  runMarketingRun(run.id, kind).catch((e) => {
    console.error(`[marketing/runs] run ${run.id} falló fuera del try:`, e);
  });
  return run;
}

async function runIngest(runId: string): Promise<{ newPosts: number }> {
  const provider = getInspirationProvider();
  const sources = await prisma.inspirationSource.findMany({
    where: { active: true },
    orderBy: { createdAt: "asc" },
  });
  if (sources.length === 0) {
    throw new Error("No hay fuentes de inspiración activas. Agregá perfiles en Marketing → Fuentes.");
  }

  let newPosts = 0;
  let fetched = 0;
  let ok = 0;
  let failed = 0;

  // Secuencial a propósito: gentil con el provider; el job es async, la latencia no importa.
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    await prisma.marketingRun.update({
      where: { id: runId },
      data: { phase: `ingesta ${i + 1}/${sources.length}` },
    });
    try {
      const posts = await provider.fetchRecentPosts(source.profileUrl, POSTS_PER_SOURCE);
      fetched += posts.length;
      // Dedup gratis: externalId es @unique y skipDuplicates ignora los ya guardados
      // → `count` = posts realmente NUEVOS.
      const created = await prisma.inspirationPost.createMany({
        data: posts.map((p) => ({
          sourceId: source.id,
          externalId: p.externalId,
          url: p.url ?? null,
          authorName: p.authorName ?? null,
          text: p.text,
          likeCount: p.likeCount,
          commentCount: p.commentCount,
          repostCount: p.repostCount,
          hasImage: p.hasImage,
          postedAt: p.postedAt,
        })),
        skipDuplicates: true,
      });
      newPosts += created.count;
      ok++;
      await prisma.inspirationSource.update({
        where: { id: source.id },
        data: { lastFetchedAt: new Date(), lastFetchError: null },
      });
    } catch (e) {
      failed++;
      const msg =
        e instanceof InspirationProviderError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Error desconocido";
      console.error(`[marketing/runs] fuente ${source.profileUrl} falló:`, msg);
      await prisma.inspirationSource.update({
        where: { id: source.id },
        data: { lastFetchedAt: new Date(), lastFetchError: msg.slice(0, 1000) },
      });
    }
  }

  await prisma.marketingRun.update({
    where: { id: runId },
    data: {
      newPostsCount: newPosts,
      fetchedPostsCount: fetched,
      sourcesOkCount: ok,
      sourcesErrorCount: failed,
    },
  });

  // Si TODAS las fuentes fallaron, la ingesta falló de verdad (típico: token mal).
  if (ok === 0) {
    const firstError = await prisma.inspirationSource.findFirst({
      where: { active: true, lastFetchError: { not: null } },
      select: { lastFetchError: true },
    });
    throw new Error(firstError?.lastFetchError ?? "Todas las fuentes fallaron durante la ingesta.");
  }

  return { newPosts };
}

async function runGenerate(runId: string): Promise<void> {
  await prisma.marketingRun.update({ where: { id: runId }, data: { phase: "generacion" } });
  try {
    const result = await runGenerateIdeasAgent(runId);
    await prisma.marketingRun.update({
      where: { id: runId },
      data: {
        contentIdeasCount: result.contentIdeasCount,
        campaignIdeasCount: result.campaignIdeasCount,
        pillarSuggestionsCount: result.pillarSuggestionsCount,
        rawOutput: result.rawOutput,
      },
    });
  } catch (e) {
    if (e instanceof Error && e.message === "NO_POSTS") {
      throw new Error("No hay posts de inspiración guardados. Corré la ingesta primero.");
    }
    throw e;
  }
}

/** El trabajo real (corre fire-and-forget). Todo error termina en run.error. */
export async function runMarketingRun(runId: string, kind: MarketingRunKind): Promise<void> {
  try {
    if (kind === "INGEST") {
      await runIngest(runId);
    } else if (kind === "GENERATE") {
      await runGenerate(runId);
    } else {
      // CHAIN: ingesta best-effort (un fallo total NO cancela la generación —
      // no dejamos al equipo sin ideas el lunes por un apagón de Apify) +
      // generación SIEMPRE, mientras haya algún post guardado en la ventana.
      try {
        await runIngest(runId);
      } catch (e) {
        console.error(
          `[marketing/runs] ingesta de la cadena ${runId} falló, se genera igual con lo guardado:`,
          e,
        );
      }
      await runGenerate(runId);
    }
    await prisma.marketingRun.update({
      where: { id: runId },
      data: { status: "DONE", phase: null, finishedAt: new Date() },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    await prisma.marketingRun
      .update({
        where: { id: runId },
        data: { status: "ERROR", phase: null, error: msg.slice(0, 4000), finishedAt: new Date() },
      })
      .catch(() => {});
  }
}
