/**
 * /api/ver-como — entrar y salir de «Ver como otra persona» (2026-10-13, lib/auth/ver-como.ts).
 *
 * POST { teamMemberId }: solo un SUPER_ADMIN. Pone la cookie; desde el próximo pedido, Nexus le muestra todo como lo
 * ve esa persona, en solo lectura (el middleware corta toda escritura salvo esta ruta).
 * DELETE: vuelve a su propio usuario. No pide permiso: quitarse la cookie no le da nada a nadie.
 *
 * Cada entrada queda en el log del servidor con quién miró a quién.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser, UnauthorizedError } from "@/lib/auth/supabase";
import { COOKIE_VER_COMO, DURACION_VER_COMO_SEGUNDOS, motivoParaNoVerComo } from "@/lib/auth/ver-como";

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    throw e;
  }
  const body = (await req.json().catch(() => null)) as { teamMemberId?: unknown } | null;
  const teamMemberId = typeof body?.teamMemberId === "string" ? body.teamMemberId : "";

  /* Quien mira DE VERDAD: si ya está mirando a alguien, la identidad del pedido es la del otro. */
  const real = user.verComoDe
    ? await prisma.appUser.findUnique({ where: { email: user.verComoDe.email }, include: { teamMember: true } })
    : user;
  const objetivo = teamMemberId
    ? await prisma.appUser.findFirst({ where: { teamMemberId }, include: { teamMember: true } })
    : null;
  const motivo = motivoParaNoVerComo(
    real?.teamMember,
    objetivo?.teamMember ? { ...objetivo.teamMember, kind: objetivo.kind } : null,
  );
  if (motivo || !objetivo?.teamMember) return NextResponse.json({ error: motivo }, { status: 403 });

  console.info(`[ver-como] ${real?.email} mira Nexus como ${objetivo.email} (${objetivo.teamMember.roleEnum})`);
  const res = NextResponse.json({ ok: true, nombre: objetivo.teamMember.name });
  res.cookies.set(COOKIE_VER_COMO, objetivo.teamMember.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DURACION_VER_COMO_SEGUNDOS,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_VER_COMO, "", { path: "/", maxAge: 0 });
  return res;
}
