"use server";

/**
 * app/external/kickoff/actions.ts
 *
 * ÚNICA escritura que puede hacer un cliente externo en todo Nexus: asignar (o
 * desasignar) una franja horaria a una sesión de su kickoff.
 *
 * POR QUÉ UNA SERVER ACTION Y NO UNA RUTA /api/external/*:
 *   Las credenciales del navegador viven en cookies httpOnly con `path: "/external"`
 *   (lib/external/lista-de-accesos.ts) → el navegador NO las manda a `/api/external/*`, y
 *   el JS del cliente tampoco puede leerlas para ponerlas en un header. Una server action
 *   declarada acá postea contra la propia página `/external/kickoff/<acceso>`, así que las
 *   cookies SÍ viajan.
 *
 * ATADA AL PROYECTO DE LA PÁGINA (2026-09-10): el primer parámetro es el id del acceso que
 * nombra la dirección, y la página lo fija con `.bind(null, acceso)`. Antes la acción resolvía
 * «la cookie que hubiera en ese momento»: una pestaña del proyecto A abierta desde antes, en
 * un navegador que después abrió B, escribía contra B. Lo frenaba solo que los ids de franja
 * de dos proyectos nunca coinciden. Ahora escribe en el proyecto de la página o no escribe —
 * y un id cambiado a mano solo alcanza proyectos que este navegador ya abrió con su contraseña.
 *
 * Mismo chokepoint que la lectura: acceso activo de ESE proyecto → kickoff publicado.
 * Nada del body se confía: `assignKickoffHorario` valida que los ids pertenezcan a la
 * data de horarios de ESE proyecto. Rate-limit por credencial para que la action no sea
 * un martillo de escritura.
 */
import { touchAccess } from "@/lib/external/access";
import { accesosDelNavegador } from "@/lib/external/accesos-del-navegador";
import { elegirAcceso } from "@/lib/external/selector-de-proyectos";
import { esIdDeAcceso } from "@/lib/external/rutas";
import { assignKickoffHorario } from "@/lib/kickoff/assign-horario";
import { checkExternalWriteRate } from "@/lib/external/write-rate-limit";

export type AssignHorarioResult = { ok: true } | { ok: false; error: string };

export async function assignHorarioAction(
  acceso: string,
  sessionId: string,
  optionId: string | null,
): Promise<AssignHorarioResult> {
  if (
    !esIdDeAcceso(acceso) ||
    typeof sessionId !== "string" ||
    !sessionId ||
    (optionId !== null && typeof optionId !== "string")
  ) {
    return { ok: false, error: "Solicitud inválida." };
  }

  // El proyecto que nombra la página, y solo si este navegador lo tiene abierto (con los mismos
  // checks de la lectura: revocado, versión de la contraseña, publicable).
  const actual = elegirAcceso(await accesosDelNavegador(), acceso);
  if (!actual) return { ok: false, error: "Tu acceso ya no está disponible. Recargá la página." };

  // Check de superficie EXPLÍCITO, igual que en la lectura: si el CSE despublicó el
  // kickoff, la credencial viva no habilita nada.
  if (!actual.project.kickoffPublishedAt) {
    return { ok: false, error: "Tu acceso ya no está disponible. Recargá la página." };
  }

  if (!checkExternalWriteRate(actual.credencial)) {
    return { ok: false, error: "Demasiados cambios seguidos. Esperá unos segundos." };
  }

  const res = await assignKickoffHorario(actual.project.id, sessionId, optionId);
  if (!res.ok) {
    // Los ids dejaron de existir (el CSE cambió las franjas y volvió a publicar).
    return { ok: false, error: "Esa opción ya no está disponible. Recargá la página." };
  }

  await touchAccess(actual.accessId);
  return { ok: true };
}
