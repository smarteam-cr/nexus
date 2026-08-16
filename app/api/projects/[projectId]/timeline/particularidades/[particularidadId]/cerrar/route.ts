/**
 * POST /api/projects/[projectId]/timeline/particularidades/[particularidadId]/cerrar
 *
 * El CSE da por RESUELTA una desviación del cronograma, o la vuelve a abrir.
 *
 * Body: { accion: "cerrar" | "reabrir", nota?: string }
 *
 * ── ⚠ POR QUÉ NO SE LLAMA `resolve` ─────────────────────────────────────────
 * `…/[id]/resolve` ya existe y significa OTRA COSA: ahí el CSE aprueba o descarta una
 * SUGERENCIA del equipo técnico, o sea decide si el hecho es cierto. Esto decide si un hecho
 * YA aceptado sigue vigente. Son los dos ejes de `lib/timeline/particularidad-state.ts`, y
 * mezclarlos en una ruta con dos significados es cómo se termina DESCARTANDO —`resolve` con
 * `discard` borra la fila— algo que se quería archivar.
 *
 * ── ⛔ CERRAR NO DEVUELVE CALENDARIO ────────────────────────────────────────
 * Las semanas que la desviación costó SIGUEN contando: el plan ya se corrió y cerrarla no lo
 * devuelve. Lo que se apaga es la ACCIÓN — deja de figurar como algo que alguien tiene que
 * perseguir. Por eso acá no se toca `weeksImpact` ni `visibleExternal`: cerrar no es ocultar.
 *
 * ── LA NOTA NO ES DECORACIÓN ────────────────────────────────────────────────
 * Sin el motivo, «cerrada» seis meses después es indistinguible de «alguien limpió la lista». Se
 * pide en la pantalla y se guarda acá; no se exige, porque exigirla haría que la gente escriba
 * «ok» para poder seguir.
 *
 * ── AL REABRIR NO SE BORRA EL CIERRE ANTERIOR ───────────────────────────────
 * `resueltaEn`/`resueltaPor`/`resueltaNota` sobreviven a la reapertura: pasan a significar «se
 * había cerrado el …», que es exactamente lo que hace legible un hecho que volvió a pasar.
 * Limpiarlos dejaría una fila abierta sin ninguna señal de que ya había estado resuelta.
 *
 * Guarded con `guardTimelineEdit`: cerrar ES escribir en el cronograma.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardTimelineEdit } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { esCerrada } from "@/lib/timeline/particularidad-state";

/** Tope de la nota. Es un motivo, no un informe. */
const MAX_NOTA = 500;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; particularidadId: string }> },
) {
  const { projectId, particularidadId } = await params;
  const guard = await guardTimelineEdit(projectId);
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const body = (raw ?? {}) as { accion?: unknown; nota?: unknown };

  if (body.accion !== "cerrar" && body.accion !== "reabrir") {
    return NextResponse.json({ error: 'accion debe ser "cerrar" o "reabrir"' }, { status: 400 });
  }
  const nota =
    typeof body.nota === "string" && body.nota.trim() ? body.nota.trim().slice(0, MAX_NOTA) : null;

  /* Pertenencia: la desviación tiene que ser del cronograma de ESTE proyecto. Sin esto, conociendo
     un id se podría cerrar la desviación de otro cliente. Mismo criterio que la ruta de `resolve`. */
  const existing = await prisma.particularidad.findFirst({
    where: { id: particularidadId, timeline: { projectId } },
    select: { id: true, estado: true, needsValidation: true, title: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "La desviación no existe en este proyecto" }, { status: 404 });
  }

  if (existing.needsValidation) {
    /* Una SUGERENCIA todavía no es un hecho del proyecto, así que no hay nada que dar por resuelto.
       El acto que corresponde es aprobarla o descartarla, en la otra ruta. Decirlo explícito evita
       que alguien "archive" una propuesta creyendo que la descartó. */
    return NextResponse.json(
      {
        error:
          "Esa desviación todavía es una sugerencia sin confirmar. Aprobala o descartala primero: " +
          "cerrar es para hechos ya registrados.",
      },
      { status: 409 },
    );
  }

  const yaCerrada = esCerrada(existing);
  const quiereCerrar = body.accion === "cerrar";
  if (yaCerrada === quiereCerrar) {
    /* Doble clic, o dos pestañas. 409 y no 400: el body es válido, lo que choca es el estado — y
       hacerlo explícito evita "cerrar" dos veces pisando la nota y la autoría del primer cierre. */
    return NextResponse.json(
      {
        error: quiereCerrar
          ? "Esa desviación ya estaba cerrada."
          : "Esa desviación ya estaba abierta.",
      },
      { status: 409 },
    );
  }

  const actualizada = await prisma.particularidad.update({
    where: { id: particularidadId },
    data: quiereCerrar
      ? {
          estado: "CERRADA",
          resueltaEn: new Date(),
          resueltaPor: guard.user.email ?? null,
          resueltaNota: nota,
        }
      : /* Solo el estado: el registro del cierre anterior se conserva a propósito (ver el
           docblock). Al reabrir, la nota de la pantalla se ignora — el motivo de una reapertura
           es que el hecho volvió a pasar, y eso lo cuenta la desviación misma. */
        { estado: "ABIERTA" },
    select: { id: true, estado: true, resueltaEn: true, resueltaPor: true, resueltaNota: true },
  });

  return NextResponse.json({ ok: true, particularidad: actualizada });
}
