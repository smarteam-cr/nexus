import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { guardCapability } from "@/lib/auth/api-guards";

/**
 * /api/clients/[id]/assignments
 *
 * Compartir / revocar acceso a un cliente, a una persona (teamMemberId) o a un
 * rol entero (targetRole). Gateado por la capacidad `shareClients`
 * (CSL / MARKETING / SUPER_ADMIN). El read-side (lib/auth/access.ts) ya honra
 * estos rows, así que apenas se crea un GRANT el cliente se vuelve visible para
 * el destinatario.
 */

const TEAM_ROLES = ["CSE", "VENTAS", "CSL", "MARKETING", "SUPER_ADMIN"] as const;
const KINDS = ["GRANT", "REVOKE"] as const;

const createSchema = z
  .object({
    teamMemberId: z.string().min(1).optional(),
    targetRole: z.enum(TEAM_ROLES).optional(),
    kind: z.enum(KINDS).default("GRANT"),
    reason: z.string().trim().max(500).optional(),
  })
  .refine(
    (d) => (d.teamMemberId ? 1 : 0) + (d.targetRole ? 1 : 0) === 1,
    { message: "Indicá exactamente uno: una persona (teamMemberId) o un rol (targetRole)." },
  );

// GET — lista los assignments del cliente (para el panel de compartir).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await guardCapability("shareClients");
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;

  const assignments = await prisma.clientAssignment.findMany({
    where: { clientId: id },
    select: {
      id: true,
      kind: true,
      targetRole: true,
      reason: true,
      createdAt: true,
      teamMember: { select: { id: true, name: true, email: true } },
      grantedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ assignments });
}

// POST — crea o actualiza el assignment para un destinatario (persona o rol).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await guardCapability("shareClients");
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Body inválido" },
      { status: 400 },
    );
  }
  const { teamMemberId, targetRole, kind, reason } = parsed.data;

  const client = await prisma.client.findUnique({ where: { id }, select: { id: true } });
  if (!client) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  }
  if (teamMemberId) {
    const member = await prisma.teamMember.findUnique({ where: { id: teamMemberId }, select: { id: true } });
    if (!member) {
      return NextResponse.json({ error: "Persona no encontrada" }, { status: 404 });
    }
  }

  // Un solo row por destinatario: si ya existe, actualizamos kind/reason (permite
  // dar vuelta GRANT↔REVOKE); si no, lo creamos.
  const existing = await prisma.clientAssignment.findFirst({
    where: { clientId: id, teamMemberId: teamMemberId ?? null, targetRole: targetRole ?? null },
    select: { id: true },
  });

  const assignment = existing
    ? await prisma.clientAssignment.update({
        where: { id: existing.id },
        data: { kind, reason: reason ?? null, grantedById: guard.teamMember.id },
      })
    : await prisma.clientAssignment.create({
        data: {
          clientId: id,
          teamMemberId: teamMemberId ?? null,
          targetRole: targetRole ?? null,
          kind,
          reason: reason ?? null,
          grantedById: guard.teamMember.id,
        },
      });

  return NextResponse.json({ assignment }, { status: existing ? 200 : 201 });
}
