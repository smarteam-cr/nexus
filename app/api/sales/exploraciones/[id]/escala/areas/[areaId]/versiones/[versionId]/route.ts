/**
 * /api/sales/exploraciones/[id]/escala/areas/[areaId]/versiones/[versionId] — una versión de la página de un área de La
 * escala (23 nov, lib/exploraciones/versiones-del-area-server.ts).
 *
 *   GET  → { lineas }: lo escrito en esa versión (la descripción, la tarjeta de cada parte, los textos), para la vista
 *          previa. Pide poder ver la exploración.
 *   POST → «Usar esta versión». Body { firma }: la huella de lo que ve la pantalla; si cambió, 409. Lo de ahora queda en el
 *          historial. No toca lo publicado. Pide poder cambiar la exploración.
 */
import { NextRequest, NextResponse } from "next/server";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { UsarVersionDelAreaSchema } from "@/lib/exploraciones/escala-con-nexus-esquemas";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";
import { lineasDeLaVersionDelArea, usarVersionDelArea } from "@/lib/exploraciones/versiones-del-area-server";

type Ctx = { params: Promise<{ id: string; areaId: string; versionId: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id, areaId, versionId } = await params;
  const guard = await guardDeLaExploracion(id, "read");
  if (guard instanceof NextResponse) return guard;
  const lineas = await lineasDeLaVersionDelArea(id, areaId, versionId);
  if (!lineas) return NextResponse.json({ error: "Esa versión no es de esta página." }, { status: 404 });
  return NextResponse.json({ lineas });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id, areaId, versionId } = await params;
  const guard = await guardDeLaExploracion(id, "write");
  if (guard instanceof NextResponse) return guard;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const cuerpo = UsarVersionDelAreaSchema.safeParse(raw);
  if (!cuerpo.success) return cuerpoInvalido(cuerpo.error);
  const r = await usarVersionDelArea({ exploracionId: id, areaId, versionId, email: guard.email, firma: cuerpo.data.firma });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true });
}
