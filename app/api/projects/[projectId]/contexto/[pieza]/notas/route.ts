/**
 * /api/projects/[projectId]/contexto/[pieza]/notas — NOTAS del «Contexto» de un DOCUMENTO (2026-09-28).
 *
 * Lo que el CSE pega a mano para el agente del documento: una decisión que no quedó en ninguna
 * reunión, un dato que el cliente mandó por correo, una aclaración. Hoy solo `diagnosis`.
 *
 *   GET  → { sources } (no borradas, en orden de carga) — el nombre `sources` es el que ya lee
 *          `FuentesManualesColumn`, la misma columna del cronograma.
 *   POST { title?, content } → crea una nota.
 *
 * Tabla genérica `NotaDeContexto` (por `pieza`), NO `HandoffSource` ni `TimelineSource`: cada una la
 * leen otros agentes sin filtrar, y una nota del diagnóstico se habría colado ahí.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject, guardContextoDelDocumento } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado, modeloDisponible } from "@/lib/db/esquema";
import { TOPE_NOTAS_DEL_DOCUMENTO, documentoConContexto } from "@/lib/contexto/documento";

const SELECT = { id: true, title: true, content: true, createdByEmail: true, createdAt: true } as const;

type Params = { params: Promise<{ projectId: string; pieza: string }> };

const esquemaAtrasado = () =>
  NextResponse.json(
    {
      error: "Falta aplicar la migración del contexto del diagnóstico (scripts/sql/2026-09-28-contexto-diagnostico.sql).",
      esquemaAtrasado: true,
    },
    { status: 503 },
  );

const sinContexto = () => NextResponse.json({ error: "Este documento no tiene contexto propio." }, { status: 404 });

export async function GET(_req: NextRequest, { params }: Params) {
  const { projectId, pieza } = await params;
  const doc = documentoConContexto(pieza);
  if (!doc) return sinContexto();
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  if (!modeloDisponible(prisma.notaDeContexto)) return esquemaAtrasado();
  try {
    const sources = await prisma.notaDeContexto.findMany({
      where: { projectId, pieza: doc.pieza, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: SELECT,
    });
    return NextResponse.json({ sources });
  } catch (e) {
    if (esquemaDesactualizado(e)) return esquemaAtrasado();
    throw e;
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const { projectId, pieza } = await params;
  const doc = documentoConContexto(pieza);
  if (!doc) return sinContexto();
  const guard = await guardContextoDelDocumento(projectId, doc.seccion);
  if (guard instanceof NextResponse) return guard;

  let body: { title?: unknown; content?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 200) : null;
  if (!content) return NextResponse.json({ error: "El contenido no puede estar vacío." }, { status: 400 });
  if (content.length > TOPE_NOTAS_DEL_DOCUMENTO) {
    return NextResponse.json(
      {
        error: `La nota tiene ${content.length.toLocaleString("es-CR")} caracteres y el agente lee hasta ${TOPE_NOTAS_DEL_DOCUMENTO.toLocaleString("es-CR")} en total. Resúmela o pártela.`,
      },
      { status: 400 },
    );
  }

  if (!modeloDisponible(prisma.notaDeContexto)) return esquemaAtrasado();
  try {
    const created = await prisma.notaDeContexto.create({
      data: { projectId, pieza: doc.pieza, title, content, createdByEmail: guard.teamMember.email ?? null },
      select: SELECT,
    });
    return NextResponse.json({ source: created }, { status: 201 });
  } catch (e) {
    if (esquemaDesactualizado(e)) return esquemaAtrasado();
    throw e;
  }
}
