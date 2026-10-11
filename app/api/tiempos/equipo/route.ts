/**
 * GET /api/tiempos/equipo — a quién se le puede pasar una pregunta con «No lo hice yo» → «¿Quién la hizo?». Las personas
 * activas del equipo, sin quien pregunta: nombre y correo, lo mismo que muestra el directorio de Documentación.
 */
import { NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { esCuentaDePrueba } from "@/lib/documentacion/equipo";

export async function GET() {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const yo = guard.user.email.toLowerCase();
  const miembros = await prisma.teamMember.findMany({
    where: { deactivatedAt: null },
    select: { name: true, email: true },
    orderBy: { name: "asc" },
  });
  const personas = miembros
    .filter((m) => m.email.toLowerCase() !== yo && !esCuentaDePrueba(m.name))
    .map((m) => ({ nombre: m.name, email: m.email.toLowerCase() }));
  return NextResponse.json({ personas });
}
