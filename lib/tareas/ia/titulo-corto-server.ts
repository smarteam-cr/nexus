/**
 * lib/tareas/ia/titulo-corto-server.ts — escribe el nombre corto de las tareas abiertas que no lo tienen, o cuyo título
 * cambió (2026-10-20, decisión de Elías). SERVIDOR. Lo corre el job «titulos-cortos».
 *
 * Toma las tareas por decidir, pendientes o en curso cuyo `tituloCortoDe` no es su título de hoy (las más nuevas
 * primero), de a `TANDA` por pedido a Haiku. Cada tanda deja su `AgentRun` y su llamada medida con
 * `conContextoDeIA` (automática: `triggeredByEmail` null).
 *
 * ⚠ Escribe con SQL crudo y SOLO si el título sigue siendo el que se mandó: así no toca `updatedAt` (lo usa la
 * sincronización con HubSpot para saber qué lado cambió último) ni la `version` (un nombre corto no es un cambio de la
 * persona), y un título editado mientras tanto no recibe el nombre del anterior.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getAnthropic } from "@/lib/anthropic";
import { conContextoDeIA } from "@/lib/ai/contexto-de-corrida";
import { leerTitulosCortos, pedidoDeTitulosCortos, SLUG_DEL_TITULO_CORTO, TANDA, type TareaParaNombrar } from "./titulo-corto";

/** Cuántas tandas, como mucho, por corrida (la carga inicial termina en unas horas sin gastar de golpe). */
export const TANDAS_POR_CORRIDA = 5;
const SEGUNDOS = 60;

export interface ResultadoDeTitulosCortos {
  /** Falta el SQL 2026-10-20-titulo-corto-de-la-tarea.sql. */
  sinColumna: boolean;
  tandas: number;
  escritos: number;
  /** Las que la IA no nombró o cuyo título cambió mientras tanto: se intentan en la corrida siguiente. */
  sinNombre: number;
  errores: number;
}

/** PostgreSQL: «la columna no existe». */
const esColumnaFaltante = (e: unknown) => /42703|column .* does not exist/i.test(String((e as { code?: string; message?: string })?.code ?? "") + String((e as Error)?.message ?? ""));

async function tareasSinNombre(tope: number): Promise<TareaParaNombrar[]> {
  return prisma.$queryRaw<TareaParaNombrar[]>`
    SELECT t."id", t."titulo", c."name" AS "empresa"
    FROM "Tarea" t
    LEFT JOIN "Client" c ON c."id" = t."clientId"
    WHERE t."archivadaAt" IS NULL
      AND t."estado" IN ('propuesta', 'pendiente', 'en_curso')
      AND length(trim(t."titulo")) > 0
      AND (t."tituloCorto" IS NULL OR t."tituloCortoDe" IS DISTINCT FROM t."titulo")
    ORDER BY t."createdAt" DESC
    LIMIT ${tope}`;
}

export async function escribirTitulosCortos(o: { tandas?: number } = {}): Promise<ResultadoDeTitulosCortos> {
  const r: ResultadoDeTitulosCortos = { sinColumna: false, tandas: 0, escritos: 0, sinNombre: 0, errores: 0 };
  const maxTandas = Math.max(1, o.tandas ?? TANDAS_POR_CORRIDA);
  const vistas = new Set<string>();
  for (let i = 0; i < maxTandas; i++) {
    let tanda: TareaParaNombrar[];
    try {
      tanda = (await tareasSinNombre(TANDA + vistas.size)).filter((t) => !vistas.has(t.id)).slice(0, TANDA);
    } catch (e) {
      if (esColumnaFaltante(e)) return { ...r, sinColumna: true };
      throw e;
    }
    if (tanda.length === 0) break;
    for (const t of tanda) vistas.add(t.id);
    r.tandas++;

    const run = await prisma.agentRun.create({
      data: {
        agentSlug: SLUG_DEL_TITULO_CORTO,
        status: "RUNNING",
        triggeredByEmail: null,
        stepLabel: "Escribir el nombre corto de las tareas",
        currentPhase: `Nombrando ${tanda.length} tareas`,
      },
      select: { id: true },
    });
    try {
      const respuesta = await conContextoDeIA({ agentSlug: SLUG_DEL_TITULO_CORTO, agentRunId: run.id, triggeredByEmail: null, origen: "tareas › nombre corto" }, () =>
        getAnthropic().messages.create(pedidoDeTitulosCortos(tanda), { timeout: SEGUNDOS * 1_000, maxRetries: 1 }),
      );
      const nombres = leerTitulosCortos(respuesta, tanda);
      let escritos = 0;
      for (const t of tanda) {
        const corto = nombres.get(t.id);
        if (!corto) continue;
        escritos += await prisma.$executeRaw`
          UPDATE "Tarea" SET "tituloCorto" = ${corto}, "tituloCortoDe" = ${t.titulo}
          WHERE "id" = ${t.id} AND "titulo" = ${t.titulo}`;
      }
      r.escritos += escritos;
      r.sinNombre += tanda.length - escritos;
      await prisma.agentRun
        .update({ where: { id: run.id }, data: { status: "DONE", output: JSON.stringify({ pedidas: tanda.length, escritas: escritos }), currentPhase: null } })
        .catch(() => undefined);
    } catch (e) {
      r.errores++;
      await prisma.agentRun
        .update({ where: { id: run.id }, data: { status: "ERROR", output: JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), currentPhase: null } })
        .catch(() => undefined);
      break;
    }
  }
  return r;
}
