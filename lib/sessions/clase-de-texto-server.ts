/**
 * lib/sessions/clase-de-texto-server.ts — LA CLASE DE TEXTO de unas reuniones ya conocidas, con el predicado único
 * (`sqlClaseDeTexto`, lib/sessions/tiene-texto.ts) y sin traer los textos. SERVIDOR, solo lectura.
 *
 * ⛔ No decide de quién es una reunión: recibe ids que ya salieron de la membresía de un proyecto (el chokepoint,
 * lib/sessions/project-sources.ts) y solo dice si dejaron texto. La usa el Contexto del diagnóstico (L1 etapa 2,
 * 2026-10-24): entran solas las reuniones del proyecto con transcripción o con notas de Gemini.
 */
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { sqlClaseDeTexto, type ClaseDeTexto } from "./tiene-texto";

export async function clasesDeTextoDeLasReuniones(ids: readonly string[]): Promise<Map<string, ClaseDeTexto>> {
  if (!ids.length) return new Map();
  const filas = await prisma.$queryRaw<{ id: string; clase: ClaseDeTexto }[]>`
    SELECT s."id", ${sqlClaseDeTexto("s")} AS "clase"
    FROM "FirefliesSession" s
    WHERE s."id" IN (${Prisma.join([...ids])})`;
  return new Map(filas.map((f) => [f.id, f.clase]));
}
