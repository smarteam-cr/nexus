/**
 * /api/sales/exploraciones/[id]/escala/resumen/versiones/[versionId] — una versión del Resumen de La escala (21 nov,
 * lib/exploraciones/versiones-del-resumen-server.ts).
 *
 *   GET  → { pagina }: la página del Resumen armada con esa versión (la vista previa). Pide poder ver la exploración.
 *   POST → «Usar esta versión». Body { firma }: la huella del Resumen que ve la pantalla; si cambió, o si Nexus lo está
 *          rehaciendo, 409. El de ahora queda en el historial. No toca lo publicado. Pide lo mismo que rehacerlo.
 */
import { NextRequest, NextResponse } from "next/server";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { UsarVersionDelResumenSchema } from "@/lib/exploraciones/esquemas";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";
import { seRehaceElResumen } from "@/lib/exploraciones/resumen-de-la-escala-server";
import { paginaDeLaVersion, usarVersionDelResumen } from "@/lib/exploraciones/versiones-del-resumen-server";

type Ctx = { params: Promise<{ id: string; versionId: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id, versionId } = await params;
  const guard = await guardDeLaExploracion(id, "read");
  if (guard instanceof NextResponse) return guard;
  const pagina = await paginaDeLaVersion(id, versionId);
  if (!pagina) return NextResponse.json({ error: "Esa versión no es de esta escala." }, { status: 404 });
  return NextResponse.json({ pagina });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id, versionId } = await params;
  const guard = await guardDeLaExploracion(id, "write");
  if (guard instanceof NextResponse) return guard;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const cuerpo = UsarVersionDelResumenSchema.safeParse(raw);
  if (!cuerpo.success) return cuerpoInvalido(cuerpo.error);
  const r = await usarVersionDelResumen({
    exploracionId: id,
    versionId,
    email: guard.email,
    firma: cuerpo.data.firma,
    enCurso: (tx) => seRehaceElResumen(tx, id),
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true });
}
