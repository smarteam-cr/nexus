/**
 * POST /api/external/business-case/verify-access
 *
 * Endpoint público (sin sesión) que verifica token (de la URL) + contraseña del
 * prospecto. En el éxito setea la cookie httpOnly `nexus_bc_access` (path
 * /external/business-case) y devuelve el nombre del caso. Mismo patrón que el
 * verify del kickoff: rate-limit in-memory por token + bcrypt timing-safe.
 */
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/db/prisma";
import { BUSINESS_CASE_COOKIE, BC_TOKEN_RE } from "@/lib/external/business-case-view";

interface AttemptRecord {
  count: number;
  windowStartAt: number;
  blockedUntil: number;
}
const MAX_FAILURES = 5;
const WINDOW_MS = 5 * 60 * 1000;
const BLOCK_MS = 10 * 60 * 1000;
const attempts = new Map<string, AttemptRecord>();

function getRemainingBlockSeconds(token: string, now: number): number {
  const rec = attempts.get(token);
  if (!rec || rec.blockedUntil <= now) return 0;
  return Math.ceil((rec.blockedUntil - now) / 1000);
}
function registerFailure(token: string, now: number): void {
  const rec = attempts.get(token);
  if (!rec) {
    attempts.set(token, { count: 1, windowStartAt: now, blockedUntil: 0 });
    return;
  }
  if (now - rec.windowStartAt > WINDOW_MS) {
    rec.count = 1;
    rec.windowStartAt = now;
    rec.blockedUntil = 0;
    return;
  }
  rec.count += 1;
  if (rec.count >= MAX_FAILURES) {
    rec.blockedUntil = now + BLOCK_MS;
    rec.count = 0;
    rec.windowStartAt = now + BLOCK_MS;
  }
}
function clearAttempts(token: string): void {
  attempts.delete(token);
}

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
  const remaining = getRemainingBlockSeconds(token, now);
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
    registerFailure(token, now);
    return NextResponse.json(GENERIC_INVALID, { status: 401 });
  }
  if (access.revokedAt) {
    await bcrypt.compare(password, access.passwordHash);
    registerFailure(token, now);
    return NextResponse.json(GENERIC_INVALID, { status: 401 });
  }
  const passwordOk = await bcrypt.compare(password, access.passwordHash);
  if (!passwordOk) {
    registerFailure(token, now);
    return NextResponse.json(GENERIC_INVALID, { status: 401 });
  }

  clearAttempts(token);
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
