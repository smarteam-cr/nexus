/**
 * POST /api/external/business-case/verify-access
 *
 * Endpoint público (sin sesión) que verifica token (de la URL) + contraseña del
 * prospecto. En el éxito setea la cookie httpOnly `nexus_bc_access` (path
 * /external/business-case) y devuelve el nombre del caso. Mismo patrón que el
 * verify del kickoff: rate-limit PERSISTIDO por token (verify-rate-limit.ts,
 * compartido — antes cada ruta tenía su copia in-memory que se reseteaba en
 * cada deploy) + bcrypt timing-safe.
 */
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/db/prisma";
import { BUSINESS_CASE_COOKIE, BC_TOKEN_RE } from "@/lib/external/business-case-view";
import { getRemainingBlockSeconds, registerFailure, clearAttempts } from "@/lib/external/verify-rate-limit";

const GENERIC_INVALID = { ok: false, reason: "invalid" } as const;

export async function POST(req: NextRequest) {
  let body: { token?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(GENERIC_INVALID, { status: 401 });
  }

  const token = typeof body.token === "string" ? body.token : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!BC_TOKEN_RE.test(token) || password.length === 0) {
    return NextResponse.json(GENERIC_INVALID, { status: 401 });
  }

  const now = Date.now();
  const remaining = await getRemainingBlockSeconds(token, now);
  if (remaining > 0) {
    return NextResponse.json(
      { ok: false, reason: "rate_limited", retryAfterSeconds: remaining },
      { status: 429, headers: { "Retry-After": String(remaining) } },
    );
  }

  const access = await prisma.businessCaseExternalAccess.findUnique({
    where: { accessToken: token },
    select: {
      id: true,
      passwordHash: true,
      revokedAt: true,
      businessCase: { select: { name: true } },
    },
  });

  if (!access) {
    await bcrypt.compare(password, "$2b$12$ZxYzZxYzZxYzZxYzZxYzZ.PadPadPadPadPadPadPadPadPadPadPadPa");
    await registerFailure(token, now);
    return NextResponse.json(GENERIC_INVALID, { status: 401 });
  }
  if (access.revokedAt) {
    await bcrypt.compare(password, access.passwordHash);
    await registerFailure(token, now);
    return NextResponse.json(GENERIC_INVALID, { status: 401 });
  }
  const passwordOk = await bcrypt.compare(password, access.passwordHash);
  if (!passwordOk) {
    await registerFailure(token, now);
    return NextResponse.json(GENERIC_INVALID, { status: 401 });
  }

  await clearAttempts(token);
  await prisma.businessCaseExternalAccess.update({
    where: { id: access.id },
    data: { lastUsedAt: new Date() },
  });

  const res = NextResponse.json({ ok: true, name: access.businessCase.name });
  res.cookies.set({
    name: BUSINESS_CASE_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/external/business-case",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
