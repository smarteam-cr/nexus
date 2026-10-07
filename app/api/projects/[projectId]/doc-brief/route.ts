import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject, guardContextoDelDocumento, guardTimelineEdit } from "@/lib/auth/api-guards";
import { documentoConContexto } from "@/lib/contexto/documento";
import { prisma } from "@/lib/db/prisma";
import { canvasOf } from "@/lib/pieces/canvas-query";
import { pieceBySlug } from "@/lib/pieces/registry";
import {
  DOC_BRIEF_KEY,
  TOPE_INSTRUCCIONES_DEL_DOC,
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
 * generación lo inyecta con `bloqueDeInstruccionesDeDoc` (el cronograma, el handoff y los documentos con contexto).
 *
 * Genérico POR SLUG a propósito: la pantalla no necesita conocer el canvasId, y sumar la
 * caja a otra pieza mañana es solo montar la UI — este endpoint ya la atiende.
 *
 * ⚠ PATCH quirúrgico, no un PUT de `sections` entero: el PUT genérico del canvas deja
 * reemplazar el Json completo, y un draft viejo del navegador pisaría los briefs por
 * sección que otro editó. `withBriefUpdated` toca SOLO la entry `__doc`.
 *
 * Desde el 2026-10-07 («el contexto adicional es de cada artefacto») lo usan también el handoff y
 * los documentos de lib/contexto/documento.ts. Cada uno se escribe con la celda de GENERAR ese
 * documento (`guardContextoDelDocumento`), la misma que cura sus reuniones y sus notas; el
 * cronograma sigue con la suya. Un documento sin «Contexto adicional» no tiene instrucciones: 400.
 */

type Params = Promise<{ projectId: string }>;
// El mismo tope que la caja de la pantalla (su `maxLength` y su contador): una sola constante.
const CAP = TOPE_INSTRUCCIONES_DEL_DOC;

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
  const body = (await req.json().catch(() => ({}))) as { slug?: string; brief?: string | null };
  const slug = body.slug ?? "";
  if (!pieceBySlug(slug)) return NextResponse.json({ error: "unknown_slug" }, { status: 400 });

  /* ⚠ Escribir reglas duras del prompt pide la celda del documento (auditoría 2026-08-08: un
     endpoint gateado solo por acceso dejaba que un rol de solo-lectura las escribiera por curl). El
     cronograma, con `editTimeline` (la caja de su pantalla se pinta con esa); el handoff y los
     documentos con contexto, con la de generarlos. Leer (GET) sigue siendo por acceso — mirar
     instrucciones no edita nada. */
  const doc = documentoConContexto(slug);
  const guard =
    slug === "timeline"
      ? await guardTimelineEdit(projectId)
      : slug === "handoff"
        ? await guardContextoDelDocumento(projectId, "handoff")
        : doc
          ? await guardContextoDelDocumento(projectId, doc.seccion)
          : NextResponse.json({ error: "Este documento no tiene instrucciones adicionales." }, { status: 400 });
  if (guard instanceof NextResponse) return guard;
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
