import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { guardAccessToClient, guardPermission } from "@/lib/auth/api-guards";
import { auditoriasVisiblesWhere } from "@/lib/auditoria-portal/acceso";
import { crearAuditoriaSchema } from "@/lib/auditoria-portal/schema";
import { crearAuditoria } from "@/lib/auditoria-portal/servidor";

/** GET → las auditorías que puede ver quien pregunta (id, nombre, fecha). */
export async function GET() {
  const ctx = await guardPermission("auditoria", "read");
  if (ctx instanceof NextResponse) return ctx;
  const audits = await prisma.audit.findMany({
    where: await auditoriasVisiblesWhere(ctx.user),
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, createdAt: true, updatedAt: true },
  });
  return NextResponse.json(audits);
}

/**
 * POST → crea una auditoría y la captura en segundo plano (lib/auditoria-portal/servidor.ts).
 * Responde enseguida con el id: la ficha se refresca sola hasta que la auditoría está lista.
 * Sin `clientId`, audita el portal de Smarteam; con él, el portal conectado de ese cliente.
 */
export async function POST(request: Request) {
  const ctx = await guardPermission("auditoria", "read");
  if (ctx instanceof NextResponse) return ctx;

  const parsed = crearAuditoriaSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const { clientId, nombre } = parsed.data;

  if (clientId) {
    const g = await guardAccessToClient(clientId);
    if (g instanceof NextResponse) return g;
  }
  const account = clientId
    ? await prisma.hubspotAccount.findFirst({ where: { clientId, isSystem: false }, select: { id: true } })
    : await prisma.hubspotAccount.findFirst({ where: { isSystem: true }, select: { id: true } });
  if (!account) {
    return NextResponse.json(
      { error: clientId ? "Ese cliente no tiene un portal de HubSpot conectado." : "No hay cuenta de HubSpot del sistema conectada." },
      { status: 400 },
    );
  }

  const id = await crearAuditoria({
    accountId: account.id,
    clientId: clientId ?? null,
    creadaPor: { nombre: ctx.teamMember.name, email: ctx.teamMember.email },
    nombre,
  });
  return NextResponse.json({ id }, { status: 201 });
}
