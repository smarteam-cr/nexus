import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { guardPermission } from "@/lib/auth/api-guards";
import { guardAuditoria } from "@/lib/auditoria-portal/acceso";
import { leerFoto } from "@/lib/auditoria-portal/foto";

type Params = { params: Promise<{ id: string }> };

/** GET → el estado de la auditoría (para saber si ya terminó de capturarse). */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardAuditoria(id);
  if (g instanceof NextResponse) return g;
  const foto = leerFoto(g.audit.data);
  return NextResponse.json({ id: g.audit.id, name: g.audit.name, estado: foto?.estado ?? "vieja" });
}

/** DELETE → borra la auditoría (pide además la celda `auditoria.delete`). */
export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardAuditoria(id);
  if (g instanceof NextResponse) return g;
  const borrar = await guardPermission("auditoria", "delete");
  if (borrar instanceof NextResponse) return borrar;
  await prisma.audit.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
