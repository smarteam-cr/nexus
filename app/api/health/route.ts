/**
 * GET /api/health — el smoke check del deploy. PÚBLICO (está en PUBLIC_PATHS del
 * middleware): lo consume `scripts/deploy.sh` con curl sin sesión, y el
 * healthcheck del docker-compose.
 *
 * Qué verifica y POR QUÉ cada check existe:
 *  - `sha`: el commit HORNEADO en la imagen (ENV GIT_SHA del Dockerfile, nunca
 *    del .env del VPS). deploy.sh lo compara contra el HEAD del checkout — si
 *    difieren, el contenedor sirve una imagen VIEJA (deploy mixto: el modo de
 *    falla que generó la ola de errores de julio 2026).
 *  - `db`: SELECT 1 — ¿Postgres responde?
 *  - `prismaClient`: `roleProfile.count()` — el CANARIO del cliente Prisma
 *    stale. RoleProfile es un modelo reciente (2026-07-17): si la imagen mezcla
 *    código nuevo con un cliente generado antes, esto truena acá (503 en el
 *    deploy) y no en la cara del usuario (fueron 558 eventos en Sentry).
 *    Al agregar un modelo nuevo al schema se puede rotar el canario.
 *  - `pool`: estado del pool de pg — `waiting` sostenido > 0 = presión de
 *    conexiones (la antesala del "Connection terminated").
 *
 * No expone secretos: el SHA es público en el repo y los stats son números.
 */
import { prisma, poolStats } from "@/lib/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, string> = {};
  let ok = true;

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = "ok";
  } catch (e) {
    ok = false;
    checks.db = e instanceof Error ? e.message.slice(0, 200) : "fail";
  }

  try {
    await prisma.roleProfile.count();
    checks.prismaClient = "ok";
  } catch (e) {
    ok = false;
    checks.prismaClient = e instanceof Error ? e.message.slice(0, 200) : "fail";
  }

  return Response.json(
    {
      ok,
      sha: process.env.GIT_SHA ?? "unknown",
      uptimeSec: Math.round(process.uptime()),
      pool: poolStats(),
      checks,
    },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
