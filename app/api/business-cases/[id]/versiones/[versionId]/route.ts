/**
 * /api/business-cases/[id]/versiones/[versionId] — una versión de una propuesta comercial (21 nov).
 *
 *   GET  → la versión con sus secciones (la vista previa).
 *   POST { accion: "restaurar" } → «Usar esta versión»: la propuesta entera vuelve como estaba. Nunca publica.
 *   POST { accion: "traer", key } → «Traer solo esta sección».
 * Las dos escrituras guardan antes la actual (lib/canvas/versiones.ts). Gateado con guardSalesAccess, como generar la
 * propuesta. La versión tiene que ser de un canvas de ESTA propuesta (un id ajeno es un 404).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { leerSecciones, restaurarVersion, traerSeccionDeVersion } from "@/lib/canvas/versiones";

type Params = { params: Promise<{ id: string; versionId: string }> };

const Cuerpo = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("restaurar") }).strict(),
  z.object({ accion: z.literal("traer"), key: z.string().min(1).max(200) }).strict(),
]);

async function cargar(businessCaseId: string, versionId: string) {
  const v = await prisma.versionDeDocumento.findUnique({
    where: { id: versionId },
    select: { id: true, canvasId: true, origen: true, creadaPor: true, createdAt: true, secciones: true, canvas: { select: { businessCaseId: true } } },
  });
  return v?.canvasId && v.canvas?.businessCaseId === businessCaseId ? { ...v, canvasId: v.canvasId } : null;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id, versionId } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;
  const v = await cargar(id, versionId);
  if (!v) return NextResponse.json({ error: "Versión no encontrada" }, { status: 404 });
  return NextResponse.json({ version: { id: v.id, origen: v.origen, creadaPor: v.creadaPor, createdAt: v.createdAt, secciones: leerSecciones(v.secciones) } });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id, versionId } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;
  const v = await cargar(id, versionId);
  if (!v) return NextResponse.json({ error: "Versión no encontrada" }, { status: 404 });
  const cuerpo = Cuerpo.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return NextResponse.json({ error: "accion: «traer» (con key) o «restaurar»" }, { status: 400 });
  const actor = guard.user.email ?? null;
  const res =
    cuerpo.data.accion === "restaurar"
      ? await restaurarVersion({ canvasId: v.canvasId, versionId, actor })
      : await traerSeccionDeVersion({ canvasId: v.canvasId, versionId, key: cuerpo.data.key, actor });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true });
}
