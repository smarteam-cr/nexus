/**
 * /api/projects/[projectId]/external-access
 *
 * Endpoints internos para que el CSE gestione el acceso del cliente externo
 * al landing de SU proyecto (Fase 1 del módulo externo).
 *
 *   POST   → generar o regenerar acceso (no recibe body — password se autogenera)
 *   GET    → ver estado actual (sin exponer passwordHash)
 *   DELETE → revocar acceso (marca revokedAt, no borra la row)
 *
 * Todos protegidos con `guardAccessToProject` — solo el CSE con acceso al
 * cliente puede gestionar el acceso externo de sus proyectos.
 *
 * IMPORTANTE: el endpoint que CONSUME estas credenciales (verificación del
 * cliente externo) vive en /api/external/verify-access. NO debe llamarse
 * desde el panel del CSE — es para el cliente final.
 */
import { NextRequest, NextResponse } from "next/server";
import { randomBytes, randomInt } from "node:crypto";
import bcrypt from "bcrypt";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

// ── Generación de credenciales ───────────────────────────────────────────────

const TOKEN_BYTES = 32;          // 32 bytes hex → 64 chars, 256 bits de entropía
const PASSWORD_LENGTH = 12;       // 12 chars del alphabet de abajo (~71 bits)
const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LEN = 8;        // mínimo para contraseñas custom del CSE
const MAX_PASSWORD_LEN = 64;
// Alphabet sin caracteres visualmente ambiguos (0/O/I/l/1) para reducir errores
// de tipeo cuando el cliente copia la password.
const PASSWORD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function generateAccessToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

/**
 * Password de 12 chars con aleatoriedad cripto-segura. `randomInt` usa el
 * generador del sistema (`/dev/urandom` en Unix, `BCryptGenRandom` en Windows)
 * con rejection sampling — no sesga la distribución sobre la longitud del
 * alphabet. Nunca usar `Math.random()` acá.
 */
function generatePassword(): string {
  let out = "";
  for (let i = 0; i < PASSWORD_LENGTH; i++) {
    out += PASSWORD_ALPHABET[randomInt(0, PASSWORD_ALPHABET.length)];
  }
  return out;
}

function buildVerifyUrl(req: NextRequest, accessToken: string): string {
  return `${req.nextUrl.origin}/external/verify/${accessToken}`;
}

// ── POST: generar o regenerar acceso ─────────────────────────────────────────

/**
 * No recibe body. La password siempre se autogenera — el CSE no puede elegirla.
 * Esto previene passwords débiles ("smarteam2026", "clientex123", etc.) que
 * volverían inútil al rate limiting y al hashing.
 *
 * Si ya existe un acceso para el proyecto, lo sobrescribe (token + pass nuevos,
 * limpia revokedAt y lastUsedAt — rotación completa: nuevo link + nueva clave).
 *
 * La password se guarda en plano (accessPassword) además del hash → el CSE puede
 * verla/copiarla/regenerarla después en el panel. Para cambiar SOLO la contraseña
 * sin rotar el token (y sus links), usar PATCH.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const accessToken = generateAccessToken();
  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const createdById = guard.user.teamMember?.id ?? null;

  const access = await prisma.projectExternalAccess.upsert({
    where: { projectId },
    create: {
      projectId,
      accessToken,
      passwordHash,
      accessPassword: password,
      createdById,
    },
    update: {
      accessToken,
      passwordHash,
      accessPassword: password,
      enabledAt: new Date(),
      revokedAt: null,
      lastUsedAt: null,
      createdById,
    },
    select: { accessToken: true, enabledAt: true },
  });

  return NextResponse.json({
    accessToken: access.accessToken,
    password, // también queda en DB (accessPassword) → visible luego en el panel.
    url: buildVerifyUrl(req, access.accessToken),
    enabledAt: access.enabledAt,
  });
}

// ── PATCH: cambiar SOLO la contraseña (mismo token / mismos links) ────────────

/**
 * Cambia la contraseña sin rotar el token. Dos modos:
 *   - body { password: "..." } → contraseña CUSTOM (la que el CSE eligió/editó).
 *     Validada: 8–64 chars, sin espacios.
 *   - body vacío / sin password → REGENERA una aleatoria (12 chars seguros).
 *
 * Actualiza accessPassword (plano, visible) + passwordHash (lo usa verify).
 * Los links del cliente NO cambian — solo la clave para entrar. Útil para el
 * flujo "el sistema sugiere una, el CSE la edita/regenera antes de entregarla".
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  let body: { password?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  let password: string;
  if (typeof body.password === "string") {
    password = body.password.trim();
    if (password.length < MIN_PASSWORD_LEN || password.length > MAX_PASSWORD_LEN) {
      return NextResponse.json(
        { error: `La contraseña debe tener entre ${MIN_PASSWORD_LEN} y ${MAX_PASSWORD_LEN} caracteres.` },
        { status: 400 },
      );
    }
    if (/\s/.test(password)) {
      return NextResponse.json({ error: "La contraseña no puede tener espacios." }, { status: 400 });
    }
  } else {
    // Sin password en el body → regenerar una aleatoria.
    password = generatePassword();
  }

  const existing = await prisma.projectExternalAccess.findUnique({
    where: { projectId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "No hay acceso externo para este proyecto. Generá uno primero." },
      { status: 404 },
    );
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await prisma.projectExternalAccess.update({
    where: { projectId },
    data: { accessPassword: password, passwordHash },
  });

  return NextResponse.json({ password });
}

// ── GET: ver estado actual del acceso ────────────────────────────────────────

/**
 * Devuelve metadata del acceso para que el CSE lo vea en su panel. Nunca
 * devuelve el passwordHash. El accessToken sí se devuelve — es half-secret
 * (sirve para reconstruir la URL, pero sin la password no entra al landing).
 *
 * Si no existe acceso, devuelve { exists: false } con 200 — no es error, es
 * estado válido del proyecto.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const access = await prisma.projectExternalAccess.findUnique({
    where: { projectId },
    select: {
      accessToken: true,
      accessPassword: true,
      enabledAt: true,
      revokedAt: true,
      lastUsedAt: true,
      createdBy: { select: { name: true, email: true } },
      // Flags de publicación por superficie → el panel marca qué link ya sirve.
      project: { select: { kickoffPublishedAt: true, timelinePublishedAt: true } },
    },
  });

  if (!access) {
    return NextResponse.json({ exists: false });
  }

  return NextResponse.json({
    exists: true,
    accessToken: access.accessToken,
    // Texto plano (visible para el CSE). Null en accesos viejos pre-migración →
    // el panel muestra "regenerá para verla". Nunca se devuelve el passwordHash.
    accessPassword: access.accessPassword,
    url: buildVerifyUrl(req, access.accessToken),
    enabledAt: access.enabledAt,
    revokedAt: access.revokedAt,
    lastUsedAt: access.lastUsedAt,
    createdBy: access.createdBy,
    // Publicación por superficie (D.1.5): kickoff y cronograma se publican aparte.
    kickoffPublished: !!access.project.kickoffPublishedAt,
    timelinePublished: !!access.project.timelinePublishedAt,
  });
}

// ── DELETE: revocar acceso (sin borrar row) ──────────────────────────────────

/**
 * Marca revokedAt = now(). NO borra la row — la auditoría se mantiene (quién
 * lo creó, cuándo, cuándo se usó por última vez). El endpoint de verificación
 * rechaza cualquier intento con revokedAt != null.
 *
 * Para "desrevocar" hay que regenerar (POST) — sale token nuevo + pass nueva.
 * No exponemos un "unrevoke" porque sería un agujero (si te filtraron las
 * credenciales originales, devolverlas a la vida es exactamente lo opuesto).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const existing = await prisma.projectExternalAccess.findUnique({
    where: { projectId },
    select: { id: true, revokedAt: true },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "No hay acceso externo activo para este proyecto" },
      { status: 404 },
    );
  }

  if (existing.revokedAt) {
    // Idempotente: ya estaba revocado.
    return NextResponse.json({ revoked: true, alreadyRevoked: true });
  }

  await prisma.projectExternalAccess.update({
    where: { projectId },
    data: { revokedAt: new Date() },
  });

  return NextResponse.json({ revoked: true });
}
