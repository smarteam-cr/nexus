/**
 * El panel derecho del Resumen de un proyecto RECURRENTE (2026-10-12, pedido de Elías): lo que debe el cliente, los
 * hitos y las sesiones fijas. GET, solo lectura; pide acceso al proyecto. 404 si el proyecto no es de un servicio
 * recurrente.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { cargarPanelDelServicio } from "@/lib/servicios/panel-del-servicio-server";

type Ctx = { params: Promise<{ projectId: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  try {
    const panel = await cargarPanelDelServicio(projectId, guard.user.email ?? null);
    if (!panel) return NextResponse.json({ error: "Este proyecto no es de un servicio recurrente." }, { status: 404 });
    return NextResponse.json(panel);
  } catch (e) {
    console.error("[panel-del-servicio]", e);
    return NextResponse.json({ error: "No se pudo cargar el panel del servicio." }, { status: 500 });
  }
}
