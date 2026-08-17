/**
 * POST /api/projects/[projectId]/timeline/approve — «este es el plan».
 *
 * ── QUÉ ES, Y POR QUÉ NO ALCANZABA CON PUBLICAR ──────────────────────────────
 * Congelar la FOTO DEL PLAN es lo que hace medible el alcance: sin ella, «creció el trabajo» no
 * se puede afirmar contra nada. Hasta ahora esa foto solo se tomaba al PUBLICAR, y publicar es un
 * acto de cara al cliente. Resultado medido: **14 de 132 proyectos activos** tienen foto — en 9
 * de cada 10 el alcance excedido es inmedible, no porque nadie lo mire sino porque no hay contra
 * qué compararlo.
 *
 * Aprobar separa las dos cosas: el CSE puede decir «este es el plan» sin mostrárselo a nadie.
 *
 * ── ⚠ ACÁ FALLA RUIDOSO, Y AL PUBLICAR NO ───────────────────────────────────
 * En `publish-timeline` el congelado es FAIL-OPEN a propósito: el baseline es auditoría interna,
 * y bloquear una publicación al cliente por un fallo de auditoría sería peor que reintentarla
 * después. Acá es al revés: congelar ES el acto. Si no pudo, no aprobó — y responder «listo»
 * dejaría al equipo creyendo que hay una promesa registrada mientras el alcance se mide contra
 * una foto que no existe.
 *
 * ── EL GATE ──────────────────────────────────────────────────────────────────
 * `guardTimelineEdit` (`cronograma.write`), el mismo que confirmar el detalle. SIN celda nueva:
 * el CSE ya confirma el detalle y ya publica al cliente; aprobar el plan es el mismo dueño.
 *
 * ⚠ Y su propio gate de fecha de arranque. El de `publish-timeline` vive EN esa ruta, no en el
 * congelador, así que este acto necesita el suyo: sin ancla la foto congela semanas relativas y
 * no fechas, y entonces «se atrasó» no se puede decir.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardTimelineEdit } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { freezeBaseline } from "@/lib/timeline/baseline";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardTimelineEdit(projectId);
  if (guard instanceof NextResponse) return guard;

  const tl = await prisma.projectTimeline.findUnique({
    where: { projectId },
    select: { anchorStartDate: true, _count: { select: { phases: true } } },
  });
  if (!tl) {
    return NextResponse.json({ error: "Este proyecto todavía no tiene cronograma." }, { status: 404 });
  }
  if (tl._count.phases === 0) {
    /* Aprobar un cronograma vacío congelaría una promesa de nada, y a partir de ahí CUALQUIER
       fase que se agregue contaría como alcance excedido. */
    return NextResponse.json(
      { error: "El cronograma no tiene fases todavía: no hay plan que aprobar." },
      { status: 409 },
    );
  }
  if (!tl.anchorStartDate) {
    return NextResponse.json(
      {
        error:
          "Definí la fecha de arranque antes de aprobar el plan: sin ella la foto congela " +
          "semanas relativas y no fechas, así que después no se puede decir si algo se atrasó.",
      },
      { status: 400 },
    );
  }

  try {
    const r = await freezeBaseline(projectId, guard.user.email ?? null);
    return NextResponse.json({
      ok: true,
      /* `created:false` NO es un error: significa que el plan es idéntico al ya congelado y el
         dedup por promesa no versionó. La pantalla lo dice distinto («ya estaba aprobado») en vez
         de celebrar una versión que no existe. */
      ...r,
    });
  } catch (e) {
    /* ⛔ RUIDOSO, a diferencia de publicar. Ver el docblock. */
    console.error(
      "[timeline/approve] no se pudo congelar la foto del plan:",
      e instanceof Error ? e.message : e,
    );
    return NextResponse.json(
      {
        error:
          "No se pudo congelar la foto del plan, así que NO quedó aprobado. Reintentá en un " +
          "momento; si sigue fallando, avisá antes de seguir editando el cronograma.",
      },
      { status: 502 },
    );
  }
}
