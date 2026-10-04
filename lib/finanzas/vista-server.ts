/**
 * lib/finanzas/vista-server.ts — lo de las vistas de Finanzas que necesita la base (rediseño 2026-10-03). Server-only.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";

/**
 * El nombre de pila de quien supervisa Finanzas, para decirle a quien registra «Esperan a Alex» o «Devuelto por Alex» en
 * vez de un genérico. Es el Super Admin activo del área Admin que no eligió la vista de Dirección; si no hay exactamente
 * uno, el texto genérico. ⚠ Solo es un texto: no decide nada.
 */
export async function nombreDeQuienSupervisa(): Promise<string> {
  const candidatos = await prisma.teamMember.findMany({
    where: {
      roleEnum: "SUPER_ADMIN",
      deactivatedAt: null,
      area: { equals: "Admin", mode: "insensitive" },
      OR: [{ vistaFinanzas: null }, { vistaFinanzas: { not: "DIRECCION" } }],
    },
    select: { name: true },
    take: 2,
  });
  return candidatos.length === 1 ? (candidatos[0]!.name.split(" ")[0] ?? "quien supervisa") : "quien supervisa";
}

/**
 * El nombre de pila de quien registra (Dinia), para que el cierre y la supervisión digan quién resuelve cada cosa: el
 * ADMIN activo del área Admin. Si no hay exactamente uno, «el equipo». ⚠ Solo es un texto: no decide nada.
 */
export async function nombreDeQuienRegistra(): Promise<string> {
  const candidatos = await prisma.teamMember.findMany({
    where: { roleEnum: "ADMIN", deactivatedAt: null, area: { equals: "Admin", mode: "insensitive" } },
    select: { name: true },
    take: 2,
  });
  return candidatos.length === 1 ? (candidatos[0]!.name.split(" ")[0] ?? "el equipo") : "el equipo";
}
