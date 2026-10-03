/**
 * /api/projects/[projectId]/pedidos-fuera-de-alcance — los pedidos que salieron en las reuniones y no
 * están en lo vendido (2026-10-02, lib/sessions/compromisos-y-alcance.ts).
 *
 *   GET   → la lista del proyecto (los abiertos primero)
 *   PATCH → el CSE decide uno: { id, estado: COTIZADO | APROBADO | DESCARTADO | INCLUIDO | PEDIDO }
 *
 * Interno: nada de esto cruza a un documento del cliente. Ventas los ve en /sales › Oportunidades.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { ESTADOS_DE_PEDIDO, type EstadoDePedido } from "@/lib/sessions/compromisos-y-alcance";

type Params = Promise<{ projectId: string }>;

const ORDEN: Record<string, number> = { PEDIDO: 0, COTIZADO: 1, APROBADO: 2, INCLUIDO: 3, DESCARTADO: 4 };

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  const filas = await prisma.pedidoFueraDeAlcance.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      pedido: true,
      quienLoPidio: true,
      estado: true,
      monto: true,
      cita: true,
      decididoPor: true,
      decididoAt: true,
      createdAt: true,
      session: { select: { id: true, title: true, date: true } },
    },
  });
  filas.sort((a, b) => (ORDEN[a.estado] ?? 9) - (ORDEN[b.estado] ?? 9));
  return NextResponse.json({ pedidos: filas });
}

export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  const body = (await req.json().catch(() => null)) as { id?: unknown; estado?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : null;
  const estado = typeof body?.estado === "string" && (ESTADOS_DE_PEDIDO as readonly string[]).includes(body.estado)
    ? (body.estado as EstadoDePedido)
    : null;
  if (!id || !estado) return NextResponse.json({ error: "Falta el pedido o el estado." }, { status: 400 });

  const r = await prisma.pedidoFueraDeAlcance.updateMany({
    where: { id, projectId },
    data: {
      estado,
      // Volver a «PEDIDO» deshace la decisión: el próximo análisis puede volver a actualizarlo.
      decididoPor: estado === "PEDIDO" ? null : guard.user.email,
      decididoAt: estado === "PEDIDO" ? null : new Date(),
    },
  });
  if (r.count === 0) return NextResponse.json({ error: "Ese pedido no es de este proyecto." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
