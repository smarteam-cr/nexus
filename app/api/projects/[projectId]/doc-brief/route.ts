import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject, guardTimelineEdit } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { canvasOf } from "@/lib/pieces/canvas-query";
import { pieceBySlug } from "@/lib/pieces/registry";
import {
  DOC_BRIEF_KEY,
  docBriefFrom,
  withBriefUpdated,
} from "@/lib/business-cases/section-briefs";

/**
 * app/api/projects/[projectId]/doc-brief — LAS INSTRUCCIONES DEL CSE PARA UNA PIEZA.
 *
 * (Tanda X1, 2026-08-08.) El texto libre que el CSE le deja a la IA de UN documento («las
 * fases de QA van al final», «este cronograma no incluye capacitaciones»). Se guarda como la
 * entry reservada `__doc` del Json `ProjectCanvas.sections` — cero migración, sobrevive el
 * setup two-PC, y es extensible a cualquier pieza porque toda pieza tiene canvas. La
 * generación lo inyecta con `bloqueDeInstruccionesDeDoc` (hoy: el detalle del cronograma).
 *
 * Genérico POR SLUG a propósito: la pantalla no necesita conocer el canvasId, y sumar la
 * caja a otra pieza mañana es solo montar la UI — este endpoint ya la atiende.
 *
 * ⚠ PATCH quirúrgico, no un PUT de `sections` entero: el PUT genérico del canvas deja
 * reemplazar el Json completo, y un draft viejo del navegador pisaría los briefs por
 * sección que otro editó. `withBriefUpdated` toca SOLO la entry `__doc`.
 */

type Params = Promise<{ projectId: string }>;
const CAP = 5_000; // mismo techo que las exclusiones del handoff

async function canvasDe(projectId: string, slug: string) {
  return prisma.projectCanvas.findFirst({
    where: { projectId, ...canvasOf(slug) },
    select: { id: true, sections: true },
  });
}

export async function GET(req: NextRequest, { params }: { params: Params }) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  if (!pieceBySlug(slug)) return NextResponse.json({ error: "unknown_slug" }, { status: 400 });

  const canvas = await canvasDe(projectId, slug);
  return NextResponse.json({ brief: canvas ? docBriefFrom(canvas.sections) : null });
}

export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const { projectId } = await params;
  /* ⚠ La MISMA celda que edita el cronograma (auditoría 2026-08-08): la caja de la UI se
     pinta con `editTimeline`, y un endpoint gateado solo por acceso dejaba que un rol de
     solo-lectura escribiera reglas duras del prompt por curl. Leer (GET) sigue siendo por
     acceso — mirar instrucciones no edita nada. */
  const guard = await guardTimelineEdit(projectId);
  if (guard instanceof NextResponse) return guard;

  const body = (await req.json().catch(() => ({}))) as { slug?: string; brief?: string | null };
  const slug = body.slug ?? "";
  if (!pieceBySlug(slug)) return NextResponse.json({ error: "unknown_slug" }, { status: 400 });
  if (body.brief != null && typeof body.brief !== "string") {
    return NextResponse.json({ error: "invalid_brief" }, { status: 400 });
  }
  const brief = body.brief?.trim().slice(0, CAP) || null;

  const canvas = await canvasDe(projectId, slug);
  if (!canvas) return NextResponse.json({ error: "canvas_not_found" }, { status: 404 });

  // `withBriefUpdated` guarda el valor anterior en previousBrief (deshacer de 1 nivel) y
  // NO toca ninguna otra entry — es el mismo molde de los briefs por sección del BC.
  const previo = docBriefFrom(canvas.sections);
  const sections = withBriefUpdated(canvas.sections, DOC_BRIEF_KEY, brief, previo);
  await prisma.projectCanvas.update({
    where: { id: canvas.id },
    data: { sections: sections as object[] },
  });

  return NextResponse.json({ brief });
}
