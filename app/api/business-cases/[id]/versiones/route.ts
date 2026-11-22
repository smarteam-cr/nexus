/**
 * GET /api/business-cases/[id]/versiones?canvasId= — el historial de versiones de una propuesta comercial (21 nov,
 * lib/canvas/historial-del-documento-server.ts): cada «Propuesta N» es un canvas con sus versiones. Gateado con
 * guardSalesAccess, como el resto de la propuesta. El canvas tiene que ser de ESTA propuesta (un id ajeno es un 404).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { historialDelCanvas } from "@/lib/canvas/historial-del-documento-server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;
  const canvasId = req.nextUrl.searchParams.get("canvasId") ?? "";
  const canvas = canvasId ? await prisma.projectCanvas.findUnique({ where: { id: canvasId }, select: { id: true, businessCaseId: true } }) : null;
  if (!canvas || canvas.businessCaseId !== id) return NextResponse.json({ error: "Esa propuesta no existe" }, { status: 404 });
  const h = await historialDelCanvas(canvas.id);
  if (!h) return NextResponse.json({ error: "Esa propuesta no existe" }, { status: 404 });
  return NextResponse.json(h);
}
