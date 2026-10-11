import "server-only";

/**
 * lib/exploraciones/guardia.ts — QUIÉN puede leer o cambiar una exploración. SERVIDOR.
 *
 * Desde el 2026-10-07 las rutas de `/api/sales/exploraciones/[id]/*` sirven a dos clases de fila:
 *   · la PREVENTA (`projectId` null): la sección de permisos `preventa` (leer / trabajar), como siempre.
 *   · la exploración de un PROYECTO (lib/exploraciones/marco.ts): el acceso al proyecto (el mismo de su
 *     ficha) para leer, y además la celda de generar la exploración para cambiar algo o correr el
 *     agente (la misma que cura su «Contexto adicional»: `guardContextoDelDocumento`).
 * Sin esto, quien trabaja preventas habría podido abrir la exploración de cualquier proyecto por su id, y
 * un CSE sin `preventa` no habría podido abrir la de su propio proyecto.
 */
import { NextResponse } from "next/server";
import { guardAccessToProject, guardContextoDelDocumento, guardPermission } from "@/lib/auth/api-guards";
import { esquemaDesactualizado, modeloDisponible } from "@/lib/db/esquema";
import { prisma } from "@/lib/db/prisma";

export interface QuienExplora {
  /** El correo de quien pide (para la autoría). */
  email: string | null;
  /** El proyecto de la exploración; null = una preventa. */
  projectId: string | null;
}

/** El proyecto de la fila, o null (una preventa, o una fila que no existe: la ruta responde 404 sola). */
async function proyectoDe(id: string): Promise<string | null> {
  if (!modeloDisponible(prisma.exploracionDeVenta)) return null;
  try {
    const f = await prisma.exploracionDeVenta.findUnique({ where: { id }, select: { projectId: true } });
    return f?.projectId ?? null;
  } catch (e) {
    if (esquemaDesactualizado(e)) return null;
    throw e;
  }
}

export async function guardDeLaExploracion(id: string, accion: "read" | "write"): Promise<QuienExplora | NextResponse> {
  const projectId = await proyectoDe(id);
  if (!projectId) {
    const g = await guardPermission("preventa", accion);
    if (g instanceof NextResponse) return g;
    return { email: g.teamMember?.email ?? g.user.email ?? null, projectId: null };
  }
  if (accion === "read") {
    const g = await guardAccessToProject(projectId);
    if (g instanceof NextResponse) return g;
    return { email: g.user.teamMember?.email ?? g.user.email ?? null, projectId };
  }
  const g = await guardContextoDelDocumento(projectId, "exploracion");
  if (g instanceof NextResponse) return g;
  return { email: g.teamMember?.email ?? g.user.email ?? null, projectId };
}
