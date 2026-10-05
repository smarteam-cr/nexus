/**
 * lib/auditoria-portal/acceso.ts — QUIÉN VE Y TOCA UNA AUDITORÍA. SERVIDOR.
 *
 * Dos capas, como el resto de Nexus: la celda `auditoria.read` (la sección) y, si la auditoría es del
 * portal de un CLIENTE, el acceso a ese cliente (`lib/auth/access.ts`). Hasta el 2026-10-04 las rutas
 * de auditorías solo pedían ser del equipo: cualquiera veía y corría la auditoría de cualquier cliente.
 * Una auditoría sin cliente (la del portal de Smarteam) la ve quien tenga la sección.
 */
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { guardAccessToClient, guardPermission } from "@/lib/auth/api-guards";
import { accessibleClientWhere } from "@/lib/auth/access";
import type { AppUserWithTeamMember } from "@/lib/auth/supabase";

const SELECT = { id: true, name: true, clientId: true, accountId: true, data: true, createdAt: true } as const;

/** La auditoría con sus permisos verificados, o la respuesta de error lista para devolver. */
export async function guardAuditoria(id: string) {
  const ctx = await guardPermission("auditoria", "read");
  if (ctx instanceof NextResponse) return ctx;
  const audit = await prisma.audit.findUnique({ where: { id }, select: SELECT });
  if (!audit) return NextResponse.json({ error: "Auditoría no encontrada" }, { status: 404 });
  if (audit.clientId) {
    const g = await guardAccessToClient(audit.clientId);
    if (g instanceof NextResponse) return g;
  }
  return { ctx, audit };
}

/** El filtro de las auditorías que un usuario puede ver en el listado. */
export async function auditoriasVisiblesWhere(user: AppUserWithTeamMember): Promise<Prisma.AuditWhereInput> {
  const clientes = await accessibleClientWhere(user, { kinds: "all" });
  if (clientes === null) return {};
  return { OR: [{ clientId: null }, { client: clientes }] };
}
