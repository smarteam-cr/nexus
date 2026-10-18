/**
 * /api/business-cases/modulos/[moduloId]
 *   PATCH  { nombre?, descripcion? } → renombra o describe un módulo.
 *   DELETE → lo ARCHIVA: deja de ofrecerse en «Agregar módulo». No se borra, y las copias ya
 *            insertadas en otras propuestas no dependen de él.
 *
 * Lo cambia quien lo guardó o dirección (SUPER_ADMIN): un módulo lo usa todo Ventas, así que
 * archivar el de otra persona se lo saca a todos.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";

type Params = Promise<{ moduloId: string }>;

async function cargar(moduloId: string) {
  try {
    return await prisma.moduloDePropuesta.findUnique({
      where: { id: moduloId },
      select: { id: true, creadoPorEmail: true, archivadoAt: true },
    });
  } catch (e) {
    if (esquemaDesactualizado(e)) return null;
    throw e;
  }
}

function puedeCambiarlo(
  guard: { user: { email: string }; role: string },
  modulo: { creadoPorEmail: string },
): boolean {
  return guard.role === "SUPER_ADMIN" || guard.user.email.toLowerCase() === modulo.creadoPorEmail.toLowerCase();
}

const patchSchema = z.object({
  nombre: z.string().trim().min(1).max(80).optional(),
  descripcion: z.string().trim().max(400).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const { moduloId } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Nombre de 1 a 80 caracteres." }, { status: 400 });

  const modulo = await cargar(moduloId);
  if (!modulo || modulo.archivadoAt) return NextResponse.json({ error: "No se encontró ese módulo." }, { status: 404 });
  if (!puedeCambiarlo(guard, modulo)) {
    return NextResponse.json({ error: "Solo quien lo guardó (o dirección) puede cambiarlo." }, { status: 403 });
  }
  const { nombre, descripcion } = parsed.data;
  await prisma.moduloDePropuesta.update({
    where: { id: moduloId },
    data: {
      ...(nombre ? { nombre } : {}),
      ...(descripcion !== undefined ? { descripcion: descripcion || null } : {}),
    },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Params }) {
  const { moduloId } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;
  const modulo = await cargar(moduloId);
  if (!modulo || modulo.archivadoAt) return NextResponse.json({ error: "No se encontró ese módulo." }, { status: 404 });
  if (!puedeCambiarlo(guard, modulo)) {
    return NextResponse.json({ error: "Solo quien lo guardó (o dirección) puede archivarlo." }, { status: 403 });
  }
  await prisma.moduloDePropuesta.update({ where: { id: moduloId }, data: { archivadoAt: new Date() } });
  return NextResponse.json({ ok: true });
}
