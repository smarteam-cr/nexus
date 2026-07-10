"use server";

/**
 * app/external/kickoff/actions.ts
 *
 * ÚNICA escritura que puede hacer un cliente externo en todo Nexus: asignar (o
 * desasignar) una franja horaria a una sesión de su kickoff.
 *
 * POR QUÉ UNA SERVER ACTION Y NO UNA RUTA /api/external/*:
 *   La cookie `nexus_ext_access` es httpOnly y está scopeada a `path: "/external"`
 *   (app/api/external/verify-access/route.ts) → el navegador NO la manda a
 *   `/api/external/*`, y el JS del cliente tampoco puede leer el token para ponerlo
 *   en un header. Una server action declarada acá postea contra la propia ruta
 *   `/external/kickoff`, así que la cookie SÍ viaja.
 *
 * Mismo chokepoint que la lectura: token → acceso no revocado → kickoff publicado.
 * Nada del body se confía: `assignKickoffHorario` valida que los ids pertenezcan a la
 * data de horarios de ESE proyecto. Rate-limit por token para que la action no sea un
 * martillo de escritura.
 */
import { cookies } from "next/headers";
import { EXTERNAL_ACCESS_COOKIE, resolveActiveAccess, touchAccess } from "@/lib/external/access";
import { assignKickoffHorario } from "@/lib/kickoff/assign-horario";
import { checkExternalWriteRate } from "@/lib/external/write-rate-limit";

export type AssignHorarioResult = { ok: true } | { ok: false; error: string };

export async function assignHorarioAction(
  sessionId: string,
  optionId: string | null,
): Promise<AssignHorarioResult> {
  if (typeof sessionId !== "string" || !sessionId || (optionId !== null && typeof optionId !== "string")) {
    return { ok: false, error: "Solicitud inválida." };
  }

  const token = (await cookies()).get(EXTERNAL_ACCESS_COOKIE)?.value ?? "";
  const access = await resolveActiveAccess(token);
  if (!access) return { ok: false, error: "Tu acceso ya no está disponible. Recargá la página." };

  // Check de superficie EXPLÍCITO, igual que en la lectura: si el CSE despublicó el
  // kickoff, la cookie viva no habilita nada.
  if (!access.project.kickoffPublishedAt) {
    return { ok: false, error: "Tu acceso ya no está disponible. Recargá la página." };
  }

  if (!checkExternalWriteRate(token)) {
    return { ok: false, error: "Demasiados cambios seguidos. Esperá unos segundos." };
  }

  const res = await assignKickoffHorario(access.project.id, sessionId, optionId);
  if (!res.ok) {
    // Los ids dejaron de existir (el CSE cambió las franjas y volvió a publicar).
    return { ok: false, error: "Esa opción ya no está disponible. Recargá la página." };
  }

  await touchAccess(access.accessId);
  return { ok: true };
}
