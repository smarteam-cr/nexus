/**
 * lib/kickoff/acceso-al-portal-server.ts — la tarjeta del acceso al portal de cada kickoff, leída de la base (Q2,
 * 2026-10-27). SERVIDOR. La regla es pura (lib/kickoff/acceso-al-portal.ts); acá solo se lee `tu_rol.acceso` del kickoff
 * de cada proyecto (la primera tarjeta de datos de la sección).
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { canvasOfNested } from "@/lib/pieces/canvas-query";
import { accesoPedidoDe, type AccesoPedido } from "./acceso-al-portal";

/** proyecto → su tarjeta del acceso (solo los que la tienen). */
export async function tarjetasDelAcceso(projectIds: readonly string[]): Promise<Map<string, AccesoPedido>> {
  if (!projectIds.length) return new Map();
  const secciones = await prisma.canvasSection.findMany({
    where: { key: "tu_rol", canvas: canvasOfNested("kickoff", { projectId: { in: [...projectIds] } }) },
    select: { canvas: { select: { projectId: true } }, blocks: { where: { blockType: "CARD" }, orderBy: { order: "asc" }, select: { data: true }, take: 1 } },
  });
  const out = new Map<string, AccesoPedido>();
  for (const s of secciones) {
    const data = s.blocks[0]?.data as { acceso?: unknown } | undefined;
    if (s.canvas.projectId && data?.acceso && typeof data.acceso === "object") out.set(s.canvas.projectId, accesoPedidoDe(data));
  }
  return out;
}
