/**
 * lib/sessions/acceso-a-la-reunion.ts — QUIÉN puede abrir una reunión. Una sola regla para las rutas de una reunión
 * (app/api/sessions/[id]/**) y la misma que aplica su página (app/(shell)/sessions/[id]/page.tsx). SERVIDOR.
 *
 *   · Con dueño (`resolvedClientId`, el manual solo si no hay): hace falta acceso a ese cliente (`requireAccessToClient`).
 *     Sin acceso, 404: confirmar que la reunión existe ya es información.
 *   · Sin dueño: cualquier usuario interno, como en /sessions (que las lista a todas). Hasta el 2026-10-10 la minuta
 *     respondía 404 sin dueño mientras la página la mostraba y «Generar minuta» la dejaba correr: una minuta de una
 *     reunión sin dueño no se podía aceptar ni editar, ni siquiera por un Super Admin.
 *   · Sin sesión, 401 tal cual.
 *
 * Desde acá nunca se escribe nada.
 */
import "server-only";
import { NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { requireAccessToClient } from "@/lib/auth/access";
import { ForbiddenError, UnauthorizedError, type AppUserWithTeamMember } from "@/lib/auth/supabase";
import { prisma } from "@/lib/db/prisma";
import { duenoDeLaSesion } from "./project-sources";

export interface AccesoALaReunion {
  user: AppUserWithTeamMember;
  /** El dueño de la reunión, o null si no tiene. */
  dueno: string | null;
}

/** 404 con el mismo texto para «no existe» y «no tienes acceso». */
export function reunionNoEncontrada(): NextResponse {
  return NextResponse.json({ error: "No encuentro esa reunión." }, { status: 404 });
}

/**
 * La guarda de una ruta de una reunión: el usuario interno y el dueño, o la respuesta que hay que devolver (401, o 404
 * si la reunión no existe o es de un cliente que no ves).
 */
export async function guardAccesoALaReunion(sessionId: string): Promise<AccesoALaReunion | NextResponse> {
  const interno = await guardInternalUser();
  if (interno instanceof NextResponse) return interno;
  const sesion = await prisma.firefliesSession.findUnique({ where: { id: sessionId }, select: { resolvedClientId: true, manualClientId: true } });
  if (!sesion) return reunionNoEncontrada();
  const dueno = duenoDeLaSesion(sesion);
  if (dueno) {
    try {
      await requireAccessToClient(dueno);
    } catch (e) {
      if (e instanceof UnauthorizedError) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
      if (e instanceof ForbiddenError) return reunionNoEncontrada();
      throw e;
    }
  }
  return { user: interno.user, dueno };
}
