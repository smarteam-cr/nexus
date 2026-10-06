/**
 * lib/exploraciones/responsable.ts — quién puede llevar una preventa. SERVIDOR.
 *
 * Elías, 2026-10-05: «Una preventa solo la puede llevar alguien con acceso a Ventas.» Antes la lista
 * de «La lleva» traía a todo el equipo activo y el PATCH aceptaba cualquier correo (y le mandaba el
 * aviso): se podía asignar una preventa a alguien que después no podía abrirla. La regla es la misma
 * que deja entrar al área: la celda `ventas.read` del mapa EFECTIVO (lib/auth/permissions/engine.ts:
 * el rol, su plantilla y los ajustes de la persona), en alguien del equipo que siga activo.
 */
import "server-only";
import { can } from "@/lib/auth/permissions/engine";
import { prisma } from "@/lib/db/prisma";
import type { Operacion } from "./contenido";

/** El 400 del PATCH cuando la persona elegida no puede llevarla. */
export function sinAccesoAVentas(email: string): string {
  return `${email} no puede llevar la preventa: solo la lleva alguien del equipo con acceso a Ventas.`;
}

/** Quién puede llevar una preventa: el equipo activo con acceso a Ventas, por nombre (la columna «La lleva» y la cabecera). */
export async function equipoParaLaPreventa(): Promise<{ email: string; name: string }[]> {
  const activos = await prisma.teamMember.findMany({
    where: { deactivatedAt: null },
    select: { email: true, name: true, roleEnum: true, permissionOverrides: true },
    orderBy: { name: "asc" },
  });
  const conVentas = await Promise.all(activos.map(async (m) => ((await can(m, "ventas", "read")) ? { email: m.email, name: m.name } : null)));
  return conVentas.filter((m): m is { email: string; name: string } => m !== null);
}

/**
 * La misma regla en el PATCH: null si quien queda llevándola puede; si no, el mensaje (400). Dejarla
 * sin responsable siempre se puede.
 */
export async function errorDelResponsable(operaciones: readonly Operacion[]): Promise<string | null> {
  const correos = [...new Set(operaciones.flatMap((o) => (o.op === "responsable" && o.email ? [o.email.trim().toLowerCase()] : [])))];
  for (const email of correos) {
    const persona = await prisma.teamMember.findFirst({
      where: { email: { equals: email, mode: "insensitive" }, deactivatedAt: null },
      select: { roleEnum: true, permissionOverrides: true },
    });
    if (!persona || !(await can(persona, "ventas", "read"))) return sinAccesoAVentas(email);
  }
  return null;
}
