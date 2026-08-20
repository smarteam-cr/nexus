/**
 * /api/business-cases/[id]/external-access — el panel de COMPARTIR de una propuesta.
 *
 *   GET   → estado del acceso: link del modo vigente, contraseña (solo si el modo la usa),
 *           caducidad, revocación y estado de aprobación del cliente.
 *   PATCH → cambia el modo (con/sin contraseña), la caducidad, o borra la aprobación.
 *
 * Nunca devuelve el passwordHash. Los dos verbos están gateados con `guardSalesAccess`:
 * quitarle la contraseña a una propuesta lo puede hacer todo el equipo de ventas, el
 * mismo permiso con el que ya la publica (decisión de negocio del 2026-08-20).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { buildBcAccessUrl } from "@/lib/business-cases/access-url";
import {
  clearApproval,
  setAccessExpiry,
  setAccessMode,
  DIAS_DE_CADUCIDAD_POR_DEFECTO,
} from "@/lib/business-cases/mutations";

const MAX_DIAS = 365 * 5;

function base(req: NextRequest): string {
  return process.env.APP_URL || new URL(req.url).origin;
}

/** Estado completo que consume el modal "Acceso del cliente". */
async function leerEstado(req: NextRequest, id: string) {
  const [access, bc] = await Promise.all([
    prisma.businessCaseExternalAccess.findUnique({
      where: { businessCaseId: id },
      select: {
        accessToken: true,
        accessPassword: true,
        requiresPassword: true,
        expiresAt: true,
        enabledAt: true,
        revokedAt: true,
        lastUsedAt: true,
      },
    }),
    prisma.businessCase.findUnique({
      where: { id },
      select: {
        publishedAt: true,
        approvedAt: true,
        approvedByEmail: true,
        approvedByName: true,
        approvedSnapshotAt: true,
      },
    }),
  ]);

  const aprobacion = bc?.approvedAt
    ? {
        approvedAt: bc.approvedAt,
        approvedByEmail: bc.approvedByEmail,
        approvedByName: bc.approvedByName,
        // El cliente aprobó una versión ANTERIOR a la publicada: Ventas tiene que verlo
        // antes de tratar esa aprobación como el visto bueno de lo que hay hoy arriba.
        desactualizada:
          !!bc.publishedAt &&
          !!bc.approvedSnapshotAt &&
          bc.publishedAt.getTime() > bc.approvedSnapshotAt.getTime(),
      }
    : null;

  if (!access) {
    return { exists: false, requiresPassword: false, approval: aprobacion };
  }
  return {
    exists: true,
    accessToken: access.accessToken,
    requiresPassword: access.requiresPassword,
    // Sin contraseña vigente NO se devuelve ninguna: que el panel muestre una que no sirve
    // termina con el vendedor mandándosela al cliente y el cliente escribiendo que no anda.
    accessPassword: access.requiresPassword ? access.accessPassword : null,
    url: buildBcAccessUrl(base(req), access.accessToken, access.requiresPassword),
    expiresAt: access.expiresAt,
    enabledAt: access.enabledAt,
    revokedAt: access.revokedAt,
    lastUsedAt: access.lastUsedAt,
    approval: aprobacion,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json(await leerEstado(req, id));
}

/**
 * PATCH { requiresPassword?, expiresInDays?, clearApproval? }
 *
 * `expiresInDays`: número de días DESDE AHORA, o null para "no caduca". Se guarda ya
 * resuelto a fecha (`expiresAt`) y no como cantidad de días: dos fuentes para el mismo
 * hecho divergen, y "30 días" contados desde un origen que nadie recuerda es justo el
 * tipo de fecha que después nadie puede explicarle al cliente.
 *
 * Si la propuesta todavía no tiene fila de acceso, se crea. Una fila sin `publishedAt` no
 * expone nada (el chokepoint la rechaza), así que el CSE puede dejar elegido el modo ANTES
 * de tocar "Subir al cliente" y mandar un solo link, el correcto, la primera vez.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const existe = await prisma.businessCase.findUnique({ where: { id }, select: { id: true } });
  if (!existe) return NextResponse.json({ error: "Esa propuesta no existe" }, { status: 404 });

  let body: { requiresPassword?: unknown; expiresInDays?: unknown; clearApproval?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  const email = guard.user.email ?? null;
  // `null` de setAccessMode/setAccessExpiry = el acceso está REVOCADO. No se revive por un
  // toggle: revivirlo es "Subir al cliente", y solo ahí, porque genera un token nuevo.
  const REVOCADO = {
    error: "El acceso de esta propuesta está revocado. Volvé a subirla al cliente para generar un link nuevo.",
  };

  if (typeof body.requiresPassword === "boolean") {
    if (!(await setAccessMode(id, body.requiresPassword, email))) {
      return NextResponse.json(REVOCADO, { status: 409 });
    }
  }

  if (body.expiresInDays !== undefined) {
    if (body.expiresInDays === null) {
      if (!(await setAccessExpiry(id, null, email))) {
        return NextResponse.json(REVOCADO, { status: 409 });
      }
    } else {
      const dias = Number(body.expiresInDays);
      if (!Number.isFinite(dias) || dias < 0 || dias > MAX_DIAS) {
        return NextResponse.json(
          { error: `Los días de caducidad tienen que ir de 0 a ${MAX_DIAS}.` },
          { status: 400 },
        );
      }
      if (!(await setAccessExpiry(id, new Date(Date.now() + dias * 24 * 60 * 60 * 1000), email))) {
        return NextResponse.json(REVOCADO, { status: 409 });
      }
    }
  }

  if (body.clearApproval === true) {
    await clearApproval(id);
  }

  return NextResponse.json({
    ...(await leerEstado(req, id)),
    diasPorDefecto: DIAS_DE_CADUCIDAD_POR_DEFECTO,
  });
}
