/**
 * lib/ai/proyeccion-server.ts — LA BASE MEDIDA DE LA PROYECCIÓN: lee de `LlmCall`, `AgentRun` y la cartera las sumas de
 * los últimos 30 días. SERVIDOR, solo lectura. La cuenta la hacen lib/ai/proyeccion-base.ts y lib/ai/proyeccion.ts.
 */
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { PROYECTO_DE_CARTERA_WHERE } from "@/lib/projects/scope";
import { hechosPrendidos } from "@/lib/seguimiento/hechos/reglas";
import { armarLaBase, ETIQUETA_DEL_BARRIDO, SONNET, type BaseDeLaProyeccion, type FilaAgente } from "./proyeccion-base";

export type { BaseDeLaProyeccion } from "./proyeccion-base";

const DIA_MS = 86_400_000;
const VENTANA_DIAS = 30;
const SLUGS_DE_HECHOS = ["seguimiento-hechos", "sondeo-de-hechos"] as const;

export async function baseDeLaProyeccion(ahora = new Date()): Promise<BaseDeLaProyeccion> {
  const desde = new Date(ahora.getTime() - VENTANA_DIAS * DIA_MS);
  const [agentes, hechos, barrido, prompt, proyectosActivos] = await Promise.all([
    prisma.$queryRaw<FilaAgente[]>(Prisma.sql`
      SELECT l."agentSlug" AS "agentSlug",
        coalesce(l."origen" LIKE '%avance%', false) AS "esAvance",
        coalesce(l."origen" LIKE '%sessions/post-process%', false) AS "esLectura",
        l."model" AS model,
        coalesce(sum(l."costUsd"), 0)::float8 AS costo,
        count(*)::int AS llamadas,
        count(DISTINCT l."agentRunId")::int AS corridas,
        coalesce(sum(l."inputTokens" + l."cacheReadTokens" + l."cacheCreationTokens"), 0)::float8 AS entrada
      FROM "LlmCall" l
      WHERE l."at" >= ${desde} AND l."at" < ${ahora}
      GROUP BY 1, 2, 3, 4`),
    // Los hechos todavía no corren en producción (2026-10-18): se mira el sondeo con Sonnet, de cualquier fecha.
    prisma.$queryRaw<{ agentSlug: string; costo: number; llamadas: number; entrada: number }[]>(Prisma.sql`
      SELECT l."agentSlug" AS "agentSlug", coalesce(sum(l."costUsd"), 0)::float8 AS costo, count(*)::int AS llamadas,
        coalesce(sum(l."inputTokens" + l."cacheReadTokens" + l."cacheCreationTokens"), 0)::float8 AS entrada
      FROM "LlmCall" l
      WHERE l."agentSlug" IN (${Prisma.join([...SLUGS_DE_HECHOS])}) AND l."model" = ${SONNET} AND l."ok" AND l."outputTokens" > 0
      GROUP BY 1`),
    // Cuántas corridas del vigía vienen del barrido diario y cuántos días hubo barrido.
    prisma.agentRun.groupBy({
      by: ["stepLabel"],
      where: { agentSlug: "cs-watchdog", createdAt: { gte: desde } },
      _count: { _all: true },
    }),
    prisma.agent.findUnique({ where: { id: "agent-cs-watchdog" }, select: { systemPrompt: true } }),
    prisma.project.count({ where: PROYECTO_DE_CARTERA_WHERE }),
  ]);
  // Una tanda = las corridas que salen juntas: el barrido de un día, o los proyectos de un cliente en la misma hora.
  const tandas = await prisma.$queryRaw<{ tandas: number }[]>(Prisma.sql`
    SELECT count(DISTINCT (CASE WHEN "stepLabel" = ${ETIQUETA_DEL_BARRIDO} THEN '' ELSE coalesce("clientId", '') END) || to_char("createdAt" - interval '6 hours', 'YYYY-MM-DD HH24'))::int AS tandas
    FROM "AgentRun" WHERE "agentSlug" = 'cs-watchdog' AND "createdAt" >= ${desde}`);

  return armarLaBase({
    ahora,
    desde,
    agentes,
    hechos,
    corridasDelVigia: Object.fromEntries(barrido.map((b) => [b.stepLabel ?? "", b._count._all])),
    tandasDelVigia: tandas[0]?.tandas ?? 0,
    largoDelPromptDelVigia: prompt?.systemPrompt.length ?? 0,
    proyectosActivos,
    hechosPrendidosHoy: hechosPrendidos(process.env),
  });
}

