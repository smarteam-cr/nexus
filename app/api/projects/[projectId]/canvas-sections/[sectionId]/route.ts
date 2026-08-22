import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { guardAccessToProject, denyHandoffCanvasEditForCse } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { touchCanvasContent } from "@/lib/canvas/touch-content";
import { patchSectionEntry, parseSectionEntries } from "@/lib/business-cases/section-briefs";
import { esCustomKey } from "@/lib/landing/custom-sections";

type Params = Promise<{ projectId: string; sectionId: string }>;

/**
 * PATCH /api/projects/[projectId]/canvas-sections/[sectionId]
 *
 * Metadatos de cara al cliente de una sección (landing Kickoff), editados por el CSE:
 *   - { titleOverride }   → título grande (null/"" = vuelve al default de la plantilla)
 *   - { eyebrowOverride } → eyebrow / título pequeño (null/"" = default)
 *   - { undo: "title" | "eyebrow" } → deshacer de 1 nivel: intercambia el valor actual con
 *     `previous*` (toggle; permite deshacer y rehacer el último cambio).
 *   - { hidden }          → la sección no se le muestra al cliente (2026-08-12).
 *
 * Al setear title/eyebrow se guarda el valor ACTUAL en `previous*` para habilitar el undo.
 * Guarded (interno/CSE).
 *
 * ── POR QUÉ `hidden` NO ES UNA COLUMNA ───────────────────────────────────────
 * Vive en el Json `ProjectCanvas.sections`, igual que en el business case y con los MISMOS
 * helpers (`lib/business-cases/section-briefs.ts` — el nombre del archivo engaña: son
 * genéricos). Tres razones, y ninguna es preferencia:
 *   1. `lib/print/load-doc.ts:205,227` ya lee `hiddenKeysFrom(canvas?.sections)` en la rama
 *      GENÉRICA de piezas de proyecto — la que sirve a las 8. El PDF respeta lo oculto sin
 *      escribir una línea. Una columna nueva sería una TERCERA fuente de "oculta", que es
 *      justo lo que `lib/print/print-visibilidad.test.ts` existe para evitar.
 *   2. Cero SQL. La columna ya existe con `@default("[]")`, y el setup de dos PCs sobre la
 *      base de producción castiga las columnas nuevas (`section-briefs.ts:5-12`).
 *   3. La clave es la `key` de la sección, no su id: sobrevive a un re-sembrado del canvas.
 *
 * ⚠ Hasta hoy este PATCH no tenía esta rama: un `{hidden:true}` caía al "nothing to update"
 * y devolvía 400. O sea que ocultar una sección NO funcionaba en NINGÚN canvas de proyecto,
 * aunque el motor (`LandingView`) y el hook (`useCanvasSections`) ya lo soportaban enteros.
 */
export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const { projectId, sectionId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  // La sección debe pertenecer a un canvas de ESTE proyecto. Traemos también los valores
  // actuales para poblar previous* (undo) en el mismo round-trip.
  const section = await prisma.canvasSection.findUnique({
    where: { id: sectionId },
    select: {
      id: true,
      titleOverride: true,
      eyebrowOverride: true,
      previousTitleOverride: true,
      previousEyebrowOverride: true,
      key: true,
      canvasId: true,
      canvas: { select: { projectId: true, name: true, sections: true } },
    },
  });
  if (!section || section.canvas.projectId !== projectId) {
    return NextResponse.json({ error: "section not found" }, { status: 404 });
  }
  const denied = await denyHandoffCanvasEditForCse(section.canvas.name);
  if (denied) return denied;

  let body: { titleOverride?: unknown; eyebrowOverride?: unknown; hidden?: unknown; undo?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const RESP_SELECT = { id: true, titleOverride: true, eyebrowOverride: true } as const;
  const norm = (raw: unknown): string | null =>
    typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;

  /* ── Rama OCULTAR ───────────────────────────────────────────────────────────
     `touchCanvasContent` NO es opcional acá: es lo que enciende "cambios sin subir"
     (`contentUpdatedAt > publishedSnapshotAt`). Con publicación por snapshot, ocultar una
     sección tiene que pedir re-publicar; sin esto el CSE tapa algo y el enlace del cliente
     lo sigue mostrando hasta la próxima publicación por otro motivo. */
  if ("hidden" in body) {
    const hidden = body.hidden === true;
    const entries = patchSectionEntry(section.canvas.sections, section.key, { hidden });
    await prisma.projectCanvas.update({
      where: { id: section.canvasId },
      data: { sections: entries as unknown as Prisma.InputJsonValue },
    });
    await touchCanvasContent(sectionId);
    return NextResponse.json({ id: section.id, hidden });
  }

  // ── Deshacer (toggle actual↔previous) ───────────────────────────────────────
  if (body.undo === "title" || body.undo === "eyebrow") {
    const data =
      body.undo === "title"
        ? { titleOverride: section.previousTitleOverride, previousTitleOverride: section.titleOverride }
        : { eyebrowOverride: section.previousEyebrowOverride, previousEyebrowOverride: section.eyebrowOverride };
    const updated = await prisma.canvasSection.update({ where: { id: sectionId }, data, select: RESP_SELECT });
    await touchCanvasContent(sectionId);
    return NextResponse.json(updated);
  }

  // ── Set de title / eyebrow (guardando previous para el undo) ─────────────────
  const data: Record<string, unknown> = {};
  if ("titleOverride" in body) {
    data.titleOverride = norm(body.titleOverride);
    data.previousTitleOverride = section.titleOverride;
  }
  if ("eyebrowOverride" in body) {
    data.eyebrowOverride = norm(body.eyebrowOverride);
    data.previousEyebrowOverride = section.eyebrowOverride;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const updated = await prisma.canvasSection.update({ where: { id: sectionId }, data, select: RESP_SELECT });
  await touchCanvasContent(sectionId);
  return NextResponse.json(updated);
}


/**
 * DELETE — borra una sección PROPIA con su bloque y su entry del Json.
 *
 * Por qué ocultar no alcanza: para las secciones de la plantilla el universo es cerrado y apagar
 * el ojo es la operación correcta. Para las que crea una persona el universo lo crea ella, así que
 * tres nombres equivocados dejarían tres fantasmas colapsados para siempre en el editor.
 *
 * ⛔ EL GUARD `esCustomKey` ES LO MÁS IMPORTANTE DEL HANDLER. Un DELETE genérico sobre
 * `canvas-sections` dejaría borrar la portada o el cierre de un kickoff, y el documento quedaría
 * mutilado sin más salida que regenerarlo entero. La misma regla que ya sostiene el del Business
 * Case, y por el mismo motivo.
 *
 * ⚠ El `touch` va ANTES del delete: necesita leer la fila para dar con el canvas.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Params }) {
  const { projectId, sectionId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const section = await prisma.canvasSection.findUnique({
    where: { id: sectionId },
    select: {
      key: true,
      canvasId: true,
      canvas: { select: { projectId: true, name: true, sections: true } },
    },
  });
  if (!section || section.canvas.projectId !== projectId) {
    return NextResponse.json({ error: "section not found" }, { status: 404 });
  }
  const denied = await denyHandoffCanvasEditForCse(section.canvas.name);
  if (denied) return denied;

  if (!esCustomKey(section.key)) {
    return NextResponse.json(
      { error: "Solo se pueden borrar las secciones propias. Las de la plantilla se ocultan." },
      { status: 400 },
    );
  }

  await touchCanvasContent(sectionId);
  await prisma.$transaction([
    // Los bloques caen por `onDelete: Cascade`.
    prisma.canvasSection.delete({ where: { id: sectionId } }),
    prisma.projectCanvas.update({
      where: { id: section.canvasId },
      data: {
        sections: parseSectionEntries(section.canvas.sections).filter(
          (e) => e.key !== section.key,
        ) as unknown as Prisma.InputJsonValue,
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
