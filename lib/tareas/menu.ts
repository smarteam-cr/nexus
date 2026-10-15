/**
 * lib/tareas/menu.ts — ¿se le muestra «Tareas» en el menú durante el piloto? SERVIDOR.
 *
 * Marketing (el piloto), Ventas y Customer Success (desde el 2026-10-15, etapa 3 de docs/mi-dia-plan.md: sus tareas de
 * HubSpot viven ahí), y quien ya tenga una tarea, una propuesta o un espacio. Dirección pasa siempre (lo decide el
 * gate). Corre en CADA navegación (AppShell): es un `findFirst` por índice, y solo para quien no pasa por el área o el
 * rol.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { tareasDisponible } from "./servidor";
import { claveDeEquipo } from "./equipos";

/** Los roles que tienen Tareas sin estar en el piloto: Ventas y Customer Success (sus tareas de HubSpot viven ahí). */
const ROLES_FUERA_DEL_PILOTO: ReadonlySet<string> = new Set(["VENTAS", "CSE", "CSL"]);

export async function entraATareas(tm: { email: string; area: string | null; roleEnum: string } | null): Promise<boolean> {
  if (!tm || tm.roleEnum === "SUPER_ADMIN") return false; // dirección entra por el gate, sin pagar la consulta
  if (claveDeEquipo(tm.area, tm.email) === "marketing") return true;
  if (ROLES_FUERA_DEL_PILOTO.has(tm.roleEnum)) return true;
  if (!(await tareasDisponible())) return false;
  const yo = tm.email.toLowerCase();
  try {
    const algo = await prisma.tarea.findFirst({
      where: { OR: [{ responsableEmail: yo }, { creadaPorEmail: yo }, { pedidaPorEmail: yo }] },
      select: { id: true },
    });
    if (algo) return true;
    return !!(await prisma.miembroDeEspacio.findFirst({ where: { email: yo }, select: { espacioId: true } }));
  } catch {
    return false;
  }
}
