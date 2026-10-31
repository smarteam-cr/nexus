/**
 * /api/projects/[projectId]/exploracion — la exploración del PROYECTO (2026-10-07): el lienzo de la
 * preventa con las preguntas de Customer Success (lib/exploraciones/marco.ts).
 *
 *   GET  → { exploracion, escala, puedeEditar, conAsistente } — la viva del proyecto, como la pinta el lienzo; sin
 *          exploración todavía, `exploracion: null` (la abre quien puede trabajarla, con el POST).
 *   POST → la crea si no hay (con lo que dejó la preventa) y devuelve lo mismo que el GET.
 * Con `?canvasId=`, los dos hablan de la exploración de esa COPIA (2026-10-30). Sin él, de la de siempre.
 *
 * Leer pide el acceso al proyecto; abrirla, además, la celda de generar la exploración. Lo demás
 * (cambios, el agente, las reuniones, lo sumado a mano) va por /api/sales/exploraciones/[id]/*, que
 * reconoce la fila de un proyecto (lib/exploraciones/guardia.ts).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject, guardContextoDelDocumento } from "@/lib/auth/api-guards";
import { can } from "@/lib/auth/permissions/engine";
import { esquemaDesactualizado, modeloDisponible } from "@/lib/db/esquema";
import { prisma } from "@/lib/db/prisma";
import { asegurarExploracionDelProyecto, esCopiaDeExploracion, exploracionVivaDelDocumento, SQL_DE_LA_EXPLORACION_DEL_PROYECTO } from "@/lib/exploraciones/del-proyecto";
import { paraLaPantallaCompleta } from "@/lib/exploraciones/pantalla";
import { escalaDeLaExploracion, escalaParaExplorar, leerExploracion } from "@/lib/exploraciones/servidor";

type Ctx = { params: Promise<{ projectId: string }> };

/** `conAsistente`: quien pide puede conversar con el chat de la cuenta (el de la ficha): «Mejorar con el asistente». */
async function respuesta(id: string | null, puedeEditar: boolean, conAsistente = false) {
  const escala = await escalaParaExplorar();
  if (escala.estado !== "ok") {
    return NextResponse.json({ error: "La escala no está publicada en Nexus: sin ella no se puede explorar." }, { status: 503 });
  }
  if (!id) return NextResponse.json({ exploracion: null, escala: null, puedeEditar });
  const lectura = await leerExploracion(id);
  if (lectura.estado !== "ok") return NextResponse.json({ exploracion: null, escala: null, puedeEditar });
  const exploracion = await paraLaPantallaCompleta(lectura.fila);
  return NextResponse.json({
    exploracion,
    escala: escalaDeLaExploracion(escala.general, exploracion.estado),
    puedeEditar: puedeEditar && !exploracion.estado.archivada,
    conAsistente,
  });
}

/** La copia pedida, o null (la de siempre). `error` si no es una copia de Exploración de este proyecto. */
async function copiaPedida(req: NextRequest, projectId: string): Promise<{ canvasId: string | null } | { error: NextResponse }> {
  const canvasId = req.nextUrl.searchParams.get("canvasId");
  if (!canvasId) return { canvasId: null };
  if (await esCopiaDeExploracion(projectId, canvasId)) return { canvasId };
  return { error: NextResponse.json({ error: "Esa exploración no es de este proyecto." }, { status: 404 }) };
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  if (!modeloDisponible(prisma.exploracionDeVenta)) {
    return NextResponse.json({ error: `Falta aplicar ${SQL_DE_LA_EXPLORACION_DEL_PROYECTO} y reiniciar.` }, { status: 503 });
  }
  const tm = guard.user.teamMember;
  const puedeEditar = tm ? await can(tm, "exploracion", "generate") : false;
  const conAsistente = tm ? await can(tm, "asistente", "read") : false;
  try {
    const copia = await copiaPedida(req, projectId);
    if ("error" in copia) return copia.error;
    return respuesta(await exploracionVivaDelDocumento(projectId, copia.canvasId), puedeEditar, conAsistente);
  } catch (e) {
    if (esquemaDesactualizado(e)) {
      return NextResponse.json({ error: `Falta aplicar ${SQL_DE_LA_EXPLORACION_DEL_PROYECTO} y reiniciar.` }, { status: 503 });
    }
    throw e;
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { projectId } = await params;
  const guard = await guardContextoDelDocumento(projectId, "exploracion");
  if (guard instanceof NextResponse) return guard;
  const email = guard.teamMember?.email ?? guard.user.email ?? "";
  const copia = await copiaPedida(req, projectId);
  if ("error" in copia) return copia.error;
  const r = await asegurarExploracionDelProyecto(projectId, email, copia.canvasId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return respuesta(r.id, true, guard.teamMember ? await can(guard.teamMember, "asistente", "read") : false);
}
