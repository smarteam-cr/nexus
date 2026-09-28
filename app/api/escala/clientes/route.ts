/**
 * GET /api/escala/clientes — la lista liviana para elegir «con qué cliente no calza».
 *
 * Solo los que esta persona puede ver (el mismo filtro de acceso de /clients), de cualquier
 * categoría: un prospecto o un aliado también pueden ser el caso. Nombre y categoría, nada más.
 */
import { NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { accessibleClientWhere } from "@/lib/auth/access";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;

  const where = await accessibleClientWhere(guard.user, { kinds: "all" });
  const clientes = await prisma.client.findMany({
    where: where ?? {},
    orderBy: { name: "asc" },
    select: { id: true, name: true, kind: true },
    take: 2000,
  });
  return NextResponse.json({ clientes: clientes.map((c) => ({ id: c.id, nombre: c.name, categoria: c.kind })) });
}
