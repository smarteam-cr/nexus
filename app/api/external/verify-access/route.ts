/**
 * POST /api/external/verify-access
 *
 * Endpoint público (sin sesión Supabase) que verifica credenciales del cliente
 * externo: token (de la URL) + contraseña (del form). Si ambas son válidas y
 * el acceso no está revocado, setea una cookie httpOnly con el token y devuelve
 * metadata mínima del proyecto. Si no, 401 con mensaje genérico (no revela si el
 * token existe).
 *
 * Fase C.1: en el éxito setea la cookie httpOnly `nexus_ext_access` (el token) →
 * la ruta pública /external/kickoff la lee server-side. La cookie NO otorga acceso
 * por sí sola: cada render re-resuelve el token y re-chequea revokedAt +
 * kickoffPublishedAt (ver lib/external/kickoff-view.ts). El cliente redirige a
 * /external/kickoff tras el éxito (el token sale de la URL).
 *
 * Rate limiting PERSISTIDO por token (lib/external/verify-rate-limit.ts,
 * tabla ExternalVerifyAttempt): 5 fallos en 5 min → bloqueo de 10 min (429).
 * Es protección mínima contra brute-force online. Para defensa real frente a
 * brute-force, la entropía de la password (12 chars del alphabet sin ambiguos
 * → ~71 bits) y el costo de bcrypt(12) son lo que cuenta. Antes era un Map en
 * memoria: cada deploy le reseteaba el contador al atacante.
 */
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/db/prisma";
import { EXTERNAL_ACCESS_COOKIE } from "@/lib/external/access";
import { getRemainingBlockSeconds, registerFailure, clearAttempts } from "@/lib/external/verify-rate-limit";

// ── Handler ──────────────────────────────────────────────────────────────────

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
  // Validación de forma: token es hex 64 chars exactos. Si no, 401 sin tocar DB.
  // Esto evita consultas a DB con basura y no revela info adicional.
  if (!/^[a-f0-9]{64}$/i.test(token) || password.length === 0) {
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

  const access = await prisma.projectExternalAccess.findUnique({
    where: { accessToken: token },
    select: {
      id: true,
      passwordHash: true,
      revokedAt: true,
      project: { select: { id: true, name: true } },
    },
  });

  // Caso 1: token no existe. Aún así corremos un bcrypt "fake" para evitar
  // timing leak (si no lo hacemos, un token inexistente responde antes que
  // uno existente con password mala, lo cual filtra qué tokens son válidos).
  if (!access) {
    await bcrypt.compare(password, "$2b$12$ZxYzZxYzZxYzZxYzZxYzZ.PadPadPadPadPadPadPadPadPadPadPadPa");
    await registerFailure(token, now);
    return NextResponse.json(GENERIC_INVALID, { status: 401 });
  }

  // Caso 2: acceso revocado. Mismo mensaje genérico — no revelamos el estado.
  if (access.revokedAt) {
    await bcrypt.compare(password, access.passwordHash);
    await registerFailure(token, now);
    return NextResponse.json(GENERIC_INVALID, { status: 401 });
  }

  // Caso 3: comparar contraseña real.
  const passwordOk = await bcrypt.compare(password, access.passwordHash);
  if (!passwordOk) {
    await registerFailure(token, now);
    return NextResponse.json(GENERIC_INVALID, { status: 401 });
  }

  // Éxito: limpiar el rate-limit del token + actualizar lastUsedAt en DB.
  await clearAttempts(token);
  await prisma.projectExternalAccess.update({
    where: { id: access.id },
    data: { lastUsedAt: new Date() },
  });

  const res = NextResponse.json({
    ok: true,
    projectId: access.project.id,
    projectName: access.project.name,
  });

  // Cookie httpOnly que transporta el token → sale de la URL (sin Referer-leak).
  // NO otorga acceso por sí sola: la ruta pública re-resuelve el token y re-chequea
  // revokedAt + kickoffPublishedAt server-side EN CADA render (ver kickoff-view.ts).
  // Persistente ~30 días; al expirar o al revocar/despublicar, el cliente re-verifica
  // con el enlace original. `secure` solo en prod (en localhost http no se setearía).
  res.cookies.set({
    name: EXTERNAL_ACCESS_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/external",
    maxAge: 60 * 60 * 24 * 30, // 30 días
  });

  return res;
}
