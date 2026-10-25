/**
 * lib/sessions/motivo-sin-texto-server.ts — guarda POR QUÉ cada reunión no dejó texto (T4, 2026-10-25). SERVIDOR.
 *
 * Lo corre el job `reuniones-motivos` (cada 10 minutos; para mirar sin escribir, scripts/medir-motivos-sin-texto.ts). Una
 * sola consulta sin traer los textos (la clase sale de `sqlClaseDeTexto`, el predicado único): cada reunión de los
 * últimos `DIAS_DEL_MOTIVO` días que ya empezó y no tiene texto recibe su motivo (lib/google/por-que-falta.ts); a la que
 * ya tiene texto (o lo que contó una persona, la marca `aMano`) se le borra el que tenía. Solo escribe lo que cambió,
 * agrupado por motivo. No arma contexto para ningún agente ni elige dueño: es un dato de la reunión.
 */
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { MotivoDeLaFalta } from "@/lib/google/por-que-falta";
import { sqlClaseDeTexto } from "./tiene-texto";
import { cambiosDeMotivo, motivoQueLeToca, type FilaParaElMotivo } from "./motivo-sin-texto";

/** Cuántos días hacia atrás se mira: los del tablero de salud (su periodo más largo). */
export const DIAS_DEL_MOTIVO = 90;
const DIA_MS = 86_400_000;

export interface ResultadoDeLosMotivos {
  miradas: number;
  escritas: number;
  borradas: number;
  /** Cuántas quedaron con cada motivo (de las que no tienen texto). */
  porMotivo: Partial<Record<MotivoDeLaFalta, number>>;
}

/** Lee las reuniones de la ventana (sin los textos). */
export async function filasParaElMotivo(ahora: Date, dias = DIAS_DEL_MOTIVO): Promise<FilaParaElMotivo[]> {
  const desde = new Date(+ahora - dias * DIA_MS);
  return prisma.$queryRaw<FilaParaElMotivo[]>`
    SELECT s."id", s."date", s."duration", s."organizerEmail", s."participants", s."enrichedAt", s."enrichAttempts",
      s."enrichError", s."googleDocId", s."canceladaEn",
      ${sqlClaseDeTexto("s")} AS "clase",
      coalesce(jsonb_typeof(s."summary") = 'object' AND s."summary" ? 'aMano', false) AS "aMano",
      coalesce(jsonb_typeof(s."summary") = 'object' AND coalesce(btrim(s."summary"->>'overview'), '') <> '', false) AS "tieneNotas",
      s."motivoSinTexto"
    FROM "FirefliesSession" s
    WHERE s."date" >= ${desde} AND s."date" <= ${ahora}`;
}

/**
 * Guarda el motivo de cada reunión sin texto de la ventana y borra el de las que ya tienen. Con `simulacro`, solo
 * cuenta. Devuelve cuántas miró, escribió y borró.
 */
export async function guardarMotivosSinTexto(o: { ahora?: Date; dias?: number; simulacro?: boolean } = {}): Promise<ResultadoDeLosMotivos> {
  const ahora = o.ahora ?? new Date();
  const filas = await filasParaElMotivo(ahora, o.dias);
  const cambios = cambiosDeMotivo(filas, ahora);
  const porMotivo: Partial<Record<MotivoDeLaFalta, number>> = {};
  for (const f of filas) {
    const m = motivoQueLeToca(f, ahora);
    if (m) porMotivo[m] = (porMotivo[m] ?? 0) + 1;
  }
  let escritas = 0;
  let borradas = 0;
  for (const [motivo, ids] of cambios) {
    if (motivo === null) borradas += ids.length;
    else escritas += ids.length;
    if (o.simulacro) continue;
    for (let i = 0; i < ids.length; i += 500) {
      await prisma.firefliesSession.updateMany({
        where: { id: { in: ids.slice(i, i + 500) } },
        data: { motivoSinTexto: motivo, motivoSinTextoAt: motivo ? ahora : null },
      });
    }
  }
  return { miradas: filas.length, escritas, borradas, porMotivo };
}

/** ¿Está el SQL de T4? (sin él, el job avisa y no hace nada). */
export async function hayColumnaDelMotivo(): Promise<boolean> {
  const r = await prisma.$queryRaw<{ existe: boolean }[]>(
    Prisma.sql`SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'FirefliesSession' AND column_name = 'motivoSinTexto') AS "existe"`,
  );
  return !!r[0]?.existe;
}
