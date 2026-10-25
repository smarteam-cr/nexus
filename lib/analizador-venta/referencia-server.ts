/**
 * lib/analizador-venta/referencia-server.ts — marcar una reunión como REFERENCIA de lo que sí es una reunión de venta
 * consultiva (S1, 2026-10-25). SERVIDOR. El único escritor de `ReunionDeReferenciaDeVenta`.
 *
 * Hoy la candidata es «Camosa l Exploración de retos operativos» (23 oct), hasta que la grabación de Grupo Avis entre por
 * T5. La referencia se muestra al lado de cada análisis para comparar; el agente NO la lee: es de otra empresa y su
 * conversación no puede entrar al análisis de una reunión ajena (invariante 1). Solo se marca una reunión de venta con
 * transcripción.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { laReunionDeVenta } from "./analizar-server";

export async function marcarReferencia(sessionId: string, o: { por: string; nota?: string | null }): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const r = await laReunionDeVenta(sessionId);
  if (!r) return { ok: false, status: 404, error: "Esa reunión no existe." };
  if (r.porQueNo) return { ok: false, status: 409, error: "Solo una reunión de venta puede ser la referencia." };
  if (!r.conTranscripcion) return { ok: false, status: 409, error: "Sin transcripción no sirve de referencia: no hay qué citar." };
  const nota = o.nota?.trim().slice(0, 500) || null;
  await prisma.reunionDeReferenciaDeVenta.upsert({
    where: { sessionId },
    create: { sessionId, marcadaPor: o.por.toLowerCase(), nota },
    update: { marcadaPor: o.por.toLowerCase(), nota },
  });
  return { ok: true };
}

export async function quitarReferencia(sessionId: string): Promise<void> {
  await prisma.reunionDeReferenciaDeVenta.deleteMany({ where: { sessionId } });
}

/** Las reuniones de referencia, para mostrarlas al lado del análisis (título, empresa y fecha; sin el texto). */
export async function reunionesDeReferencia(): Promise<{ sessionId: string; titulo: string; fecha: string; nota: string | null }[]> {
  const filas = await prisma.reunionDeReferenciaDeVenta
    .findMany({ orderBy: { createdAt: "desc" }, take: 5, select: { sessionId: true, nota: true, session: { select: { title: true, date: true } } } })
    .catch(() => []);
  return filas.map((f) => ({ sessionId: f.sessionId, titulo: f.session.title, fecha: f.session.date.toISOString(), nota: f.nota }));
}
