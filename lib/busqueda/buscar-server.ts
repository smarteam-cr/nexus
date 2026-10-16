/**
 * lib/busqueda/buscar-server.ts — buscar en lo que se dijo en las reuniones con UNA empresa (etapa 4c de
 * docs/mi-dia-plan.md). Solo lectura.
 *
 * ⛔ Invariante 1: solo las reuniones de ESA empresa, con la regla única de pertenencia (`resolvedClientId` o
 * `manualClientId`, la misma que `whereBelongsToClient` de lib/sessions/project-sources.ts). Quien pide ya pasó por
 * `requireAccessToClient`. Solo se busca en reuniones con transcripción: ya ocurrieron.
 */
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { modeloDisponible } from "@/lib/db/esquema";
import { normalizarParaBuscar } from "./turnos";

export interface ResultadoDeBusqueda {
  sessionId: string;
  titulo: string;
  /** ISO. */
  fecha: string;
  hablante: string;
  texto: string;
}

export const MAX_RESULTADOS = 20;

/** Busca `q` (palabras sueltas o «una frase entre comillas») en las reuniones de una empresa. null = sin la tabla. */
export async function buscarEnReunionesDe(clientId: string, q: string, limite = 10): Promise<ResultadoDeBusqueda[] | null> {
  if (!modeloDisponible(prisma.turnoDeReunion)) return null;
  const consulta = normalizarParaBuscar(q).trim().slice(0, 200);
  if (consulta.length < 3) return [];
  const tope = Math.min(Math.max(1, limite), MAX_RESULTADOS);
  try {
    const filas = await prisma.$queryRaw<{ sessionId: string; titulo: string; fecha: Date; hablante: string; texto: string }[]>(Prisma.sql`
      SELECT s.id AS "sessionId", s.title AS titulo, s.date AS fecha, t.hablante, t.texto
      FROM "FirefliesSession" s
      JOIN "TurnoDeReunion" t ON t."sessionId" = s.id
      WHERE (s."resolvedClientId" = ${clientId} OR s."manualClientId" = ${clientId})
        AND t.tsv @@ websearch_to_tsquery('spanish', ${consulta})
      ORDER BY ts_rank(t.tsv, websearch_to_tsquery('spanish', ${consulta})) DESC, s.date DESC
      LIMIT ${tope}`);
    return filas.map((f) => ({ sessionId: f.sessionId, titulo: f.titulo, fecha: f.fecha.toISOString(), hablante: f.hablante, texto: f.texto }));
  } catch (e) {
    // Sin la columna generada (la base sin el SQL) o una consulta que Postgres no entiende: sin resultados, sin caerse.
    console.error("[busqueda] no se pudo buscar", e instanceof Error ? e.message : e);
    return [];
  }
}

/** Lo que se dijo de alguna de estas palabras (cualquiera), para el resumen antes de una reunión. */
export async function loQueSeDijoDe(clientId: string, palabras: readonly string[], limite = 3): Promise<ResultadoDeBusqueda[]> {
  if (!palabras.length) return [];
  return (await buscarEnReunionesDe(clientId, palabras.join(" or "), limite)) ?? [];
}
