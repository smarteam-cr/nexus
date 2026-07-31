/**
 * /api/roles/[id]/publico — el LINK PÚBLICO oculto de un documento de Roles.
 *
 * GET estado · POST publica (genera token) · DELETE revoca. Los tres SOLO SUPER_ADMIN:
 * publicar la oferta económica de una propuesta es una decisión de dirección.
 *
 * El token es la capability: 32 bytes de `crypto.randomBytes` en hex (256 bits, mismo
 * generador que `ProjectExternalAccess`). NO hay contraseña ni cookie — la URL ES el
 * secreto. Revocar pone el token en `null`, así que el link viejo muere y no vuelve:
 * republicar genera uno nuevo. `publicPublishedAt`/`ByEmail` quedan como auditoría y NUNCA
 * se consultan como gate (dos fuentes para el mismo bit divergen).
 */
import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { guardRolesAdmin } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

type Params = { params: Promise<{ id: string }> };

interface EstadoPublico {
  url: string | null;
  publishedAt: string | null;
  publishedByEmail: string | null;
}

/**
 * `APP_URL` y no el origin del request: en el deploy self-hosted (Docker) el request llega
 * por la red interna y el origin sería `localhost:3000` — un link que no le sirve a nadie.
 * Mismo criterio que `buildVerifyUrl` en external-access.
 */
function urlPublica(req: NextRequest, token: string | null): string | null {
  if (!token) return null;
  const base = process.env.APP_URL || new URL(req.url).origin;
  return `${base}/external/doc/${token}`;
}

async function leer(req: NextRequest, id: string): Promise<EstadoPublico | null> {
  const row = await prisma.roleProfile.findUnique({
    where: { id },
    select: { publicToken: true, publicPublishedAt: true, publicPublishedByEmail: true },
  });
  if (!row) return null;
  return {
    url: urlPublica(req, row.publicToken),
    publishedAt: row.publicPublishedAt?.toISOString() ?? null,
    publishedByEmail: row.publicPublishedByEmail,
  };
}

export async function GET(req: NextRequest, { params }: Params) {
  const guard = await guardRolesAdmin();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  const estado = await leer(req, id);
  if (!estado) return NextResponse.json({ error: "El documento no existe" }, { status: 404 });
  return NextResponse.json(estado);
}

export async function POST(req: NextRequest, { params }: Params) {
  const guard = await guardRolesAdmin();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;

  // Publicar de nuevo ROTA el token a propósito: si el anterior circuló de más, dejarlo
  // vivo sería exactamente lo que se quiere evitar al republicar.
  const token = randomBytes(32).toString("hex");
  try {
    await prisma.roleProfile.update({
      where: { id },
      data: {
        publicToken: token,
        publicPublishedAt: new Date(),
        publicPublishedByEmail: guard.user.email,
      },
    });
  } catch {
    return NextResponse.json({ error: "El documento no existe" }, { status: 404 });
  }
  return NextResponse.json((await leer(req, id))!, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const guard = await guardRolesAdmin();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;

  try {
    await prisma.roleProfile.update({
      where: { id },
      // La fecha se limpia con el token: son una unidad ("publicado con ESTE link").
      data: { publicToken: null, publicPublishedAt: null, publicPublishedByEmail: null },
    });
  } catch {
    return NextResponse.json({ error: "El documento no existe" }, { status: 404 });
  }
  return NextResponse.json((await leer(req, id))!);
}
