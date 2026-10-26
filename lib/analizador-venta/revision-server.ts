/**
 * lib/analizador-venta/revision-server.ts — comentar, confirmar y desconfirmar el análisis de una reunión de venta (S4,
 * 2026-10-27). SERVIDOR. El único escritor de `AnalisisDeVenta.comentarios`, `confirmadoPor`, `confirmadoAt`,
 * `notaDeConfirmacion` y `paraLaProxima` (volver a analizar los borra: analizar-server.ts).
 *
 * El vendedor comenta o discrepa; una persona confirma. Se confirma un análisis que existe, es de la empresa dueña de la
 * reunión HOY (invariante 1: uno colgado de otra empresa no se toca, lo reclama INV57) y no terminó en error. Al confirmar
 * se elige qué va «para la próxima»: lo que la pantalla ofrece llevar a la guía de la siguiente sesión.
 * Un comentario se guarda con quién y cuándo; no se edita ni se borra (es la conversación del coaching). Dos comentarios a la
 * vez no se pisan: se lee y se escribe con la fila bloqueada.
 * Se confirma SOLO el análisis que la persona tiene enfrente (`analizadoAt`): si entretanto alguien (o el job) lo volvió a
 * analizar, la confirmación no cae sobre un análisis que nadie leyó (409, «el análisis cambió»). INV62 vigila el resto.
 */
import "server-only";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { duenoDeLaSesion } from "@/lib/sessions/project-sources";
import { leerResultadoGuardado } from "./analisis";
import { leerComentarios, sumarComentario, type PuntoDelComentario, type TipoDeComentario } from "./revision";

export type ResultadoDeRevisar = { ok: true } | { ok: false; status: number; error: string };

/** El análisis vigente de la reunión (de su dueña de hoy), o por qué no se puede revisar. */
async function vigente(sessionId: string) {
  const a = await prisma.analisisDeVenta.findUnique({
    where: { sessionId },
    select: { clientId: true, estado: true, resultado: true, comentarios: true, confirmadoPor: true, session: { select: { resolvedClientId: true, manualClientId: true } } },
  });
  if (!a) return { error: { ok: false as const, status: 404, error: "Esa reunión todavía no tiene análisis." } };
  if (duenoDeLaSesion(a.session) !== a.clientId) return { error: { ok: false as const, status: 409, error: "El análisis es de cuando la reunión era de otra empresa: vuelve a analizarla." } };
  return { a };
}

export async function comentarAnalisis(sessionId: string, o: { por: string; tipo: TipoDeComentario; punto: PuntoDelComentario; texto: string }): Promise<ResultadoDeRevisar> {
  const { error } = await vigente(sessionId);
  if (error) return error;
  await prisma.$transaction(async (tx) => {
    // La fila bloqueada: otro comentario al mismo tiempo espera y suma sobre este, no lo pisa.
    await tx.$executeRaw`SELECT 1 FROM "AnalisisDeVenta" WHERE "sessionId" = ${sessionId} FOR UPDATE`;
    const a = await tx.analisisDeVenta.findUniqueOrThrow({ where: { sessionId }, select: { comentarios: true } });
    const comentarios = sumarComentario(leerComentarios(a.comentarios), {
      id: randomUUID(),
      por: o.por.toLowerCase(),
      tipo: o.tipo,
      punto: o.punto,
      texto: o.texto.trim(),
      en: new Date().toISOString(),
    });
    await tx.analisisDeVenta.update({ where: { sessionId }, data: { comentarios: comentarios as unknown as Prisma.InputJsonValue } });
  });
  return { ok: true };
}

/** El aviso cuando el análisis cambió entre que la persona lo leyó y lo confirmó. */
export const ANALISIS_CAMBIO = "El análisis cambió desde que lo abriste (alguien lo volvió a analizar): vuelve a leerlo antes de confirmarlo.";

export async function confirmarAnalisis(
  sessionId: string,
  o: { por: string; nota?: string | null; paraLaProxima: readonly string[]; analizadoAt: string },
): Promise<ResultadoDeRevisar> {
  const { a, error } = await vigente(sessionId);
  if (error) return error;
  if (a.estado !== "PROPUESTO" || !leerResultadoGuardado(a.resultado)) return { ok: false, status: 409, error: "El último análisis falló: vuelve a analizar la reunión antes de confirmarlo." };
  const leido = new Date(o.analizadoAt);
  if (Number.isNaN(+leido)) return { ok: false, status: 400, error: "Falta la fecha del análisis que leíste." };
  const paraLaProxima = [...new Set(o.paraLaProxima.map((t) => t.trim()).filter(Boolean))];
  // Solo si sigue siendo EL análisis que se leyó: volver a analizar cambia `analizadoAt` (y borra la confirmación).
  const { count } = await prisma.analisisDeVenta.updateMany({
    where: { sessionId, clientId: a.clientId, estado: "PROPUESTO", analizadoAt: leido },
    data: {
      confirmadoPor: o.por.toLowerCase(),
      confirmadoAt: new Date(),
      notaDeConfirmacion: o.nota?.trim() || null,
      paraLaProxima: paraLaProxima.length ? (paraLaProxima as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    },
  });
  if (!count) return { ok: false, status: 409, error: ANALISIS_CAMBIO };
  return { ok: true };
}

export async function desconfirmarAnalisis(sessionId: string): Promise<ResultadoDeRevisar> {
  const { error } = await vigente(sessionId);
  if (error) return error;
  await prisma.analisisDeVenta.update({
    where: { sessionId },
    data: { confirmadoPor: null, confirmadoAt: null, notaDeConfirmacion: null, paraLaProxima: Prisma.DbNull },
  });
  return { ok: true };
}
