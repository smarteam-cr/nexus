/**
 * POST /api/sales/negocios/[id]/propuesta — lo que Nexus propone para la fecha de cierre y el monto de un negocio, con
 * la frase de donde salió (lib/ventas/propuesta-de-cierre-server.ts). Se pide al abrir la pregunta en «Para ti»; la
 * guardada sirve 24 horas. No escribe en HubSpot: eso lo hace el vendedor con «Guardar en HubSpot».
 * Pide `ventas.read` y ser el dueño del negocio o tener `ventas.write`.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardPermission } from "@/lib/auth/api-guards";
import { can } from "@/lib/auth/permissions/engine";
import { prisma } from "@/lib/db/prisma";
import { propuestaDelNegocio } from "@/lib/ventas/propuesta-de-cierre-server";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Ctx) {
  const guard = await guardPermission("ventas", "read");
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  const n = await prisma.negocioAbierto.findUnique({ where: { id }, select: { vendedorId: true } });
  if (!n) return NextResponse.json({ error: "Ese negocio no existe." }, { status: 404 });
  if (n.vendedorId !== guard.teamMember.id && !(await can(guard.teamMember, "ventas", "write"))) {
    return NextResponse.json({ error: "Solo su dueño o alguien con permiso de Ventas puede ver esto." }, { status: 403 });
  }
  const propuesta = await propuestaDelNegocio(id, guard.teamMember.email);
  return NextResponse.json({ propuesta });
}
