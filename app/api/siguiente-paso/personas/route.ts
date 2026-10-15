/**
 * GET /api/siguiente-paso/personas — quién puede llevar un siguiente paso, por equipo (2026-10-15): las personas
 * activas de Ventas, CS y Dev, y dirección en los tres. Y los equipos que puede escribir quien pregunta. Solo nombres y
 * correos del equipo interno.
 */
import { NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { equiposQueEscribe } from "@/lib/siguiente-paso/reglas";

export async function GET() {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const miembros = await prisma.teamMember.findMany({
    where: { deactivatedAt: null, roleEnum: { in: ["VENTAS", "CSE", "CSL", "DEV", "SUPER_ADMIN"] } },
    select: { email: true, name: true, roleEnum: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({
    yo: guard.teamMember.email.toLowerCase(),
    equipos: equiposQueEscribe(guard.teamMember.roleEnum),
    personas: miembros.map((m) => ({ email: m.email.toLowerCase(), nombre: m.name, equipos: equiposQueEscribe(m.roleEnum) })),
  });
}
