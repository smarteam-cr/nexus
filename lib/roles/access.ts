/**
 * lib/roles/access.ts — quién puede LEER un documento de /roles.
 *
 * ── EL MODELO, EN UNA LÍNEA ──────────────────────────────────────────────────
 * Escribir es de SUPER_ADMIN, siempre (`guardRolesAdmin`). Leer es de SUPER_ADMIN
 * MÁS quien tenga ese documento COMPARTIDO (`RoleProfileShare`). No hay estados
 * intermedios: o te lo compartieron o el documento no existe para vos.
 *
 * Todo el filtro vive en `visibleRoleWhere` y las dos preguntas que importan
 * ("¿qué lista veo?" y "¿puedo abrir este?") se derivan de ÉL — nunca dos
 * implementaciones que puedan discrepar. Es el mismo criterio que
 * `accessibleClientWhere` en lib/auth/access.ts, pero sin herencia por owner:
 * acá el default es "nadie salvo dirección", así que no hay nada que revocar.
 *
 * ⚠ Esto NO lo protege RLS: Prisma conecta con un rol BYPASSRLS. La policy
 * deny-all de `RoleProfile`/`RoleProfileShare` tapa al `anon` de Supabase (la
 * publishable key viaja en el bundle); la barrera contra roles INTERNOS es este
 * archivo, y solo funciona si toda lectura pasa por acá — POR ESO el `subject` de
 * `lib/roles/queries.ts` es obligatorio y saltarse el filtro exige nombrar el
 * centinela `SYSTEM_SUBJECT` (abajo), que se ve en el diff y se puede grepear.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

/** Lo mínimo que hace falta para decidir: el rol y la persona. */
export interface RoleAccessSubject {
  role: string;
  teamMemberId: string;
}

/**
 * El subject de las llamadas de SISTEMA: las que YA gatearon el acceso antes y por eso
 * leen sin filtrar.
 *
 * Existe porque el `subject` era OPCIONAL, y eso convertía el OLVIDO en el default: sin
 * subject la consulta no filtraba, y olvidarlo compilaba, pasaba lint y pasaba los tests
 * — o sea que una superficie nueva podía dejar a cualquier interno leyendo una propuesta
 * con su oferta salarial sin que nada avisara. Con el parámetro obligatorio, olvidarlo no
 * compila; y abrir todo pasa a ser un acto EXPLÍCITO, que es lo que se puede auditar.
 *
 * Sus DOS únicos usos legítimos, los dos gateados ANTES (la allowlist la congela
 * `lib/roles/api-guards.test.ts`):
 *   · `app/api/roles/[id]/assist/route.ts` — después de `guardRolesAdmin`.
 *   · `lib/print/load-doc.ts` — después del gate SUPER_ADMIN de `authorizePrintDoc`.
 * Una superficie CON SESIÓN nunca lo usa: ahí va el subject de quien pregunta.
 */
export const SYSTEM_SUBJECT: RoleAccessSubject = Object.freeze({
  role: "__system__",
  teamMemberId: "__system__",
});

/**
 * El `where` de Prisma con los documentos que ESTE usuario puede leer.
 * SUPER_ADMIN → `{}` (todos). Cualquier otro → solo los compartidos con él.
 */
export function visibleRoleWhere(subject: RoleAccessSubject): Prisma.RoleProfileWhereInput {
  /* Identidad REFERENCIAL y no `subject.role === "__system__"`: un subject armado desde un
     body, desde la DB o desde un querystring no puede SER esta constante ni por coincidencia.
     Y una copia (`{ ...SYSTEM_SUBJECT }`) cae al filtro de compartidos con un teamMemberId
     que no existe → no ve nada: el modo de falla es no-ver-nada, nunca ver-todo. */
  if (subject === SYSTEM_SUBJECT) return {};
  if (subject.role === "SUPER_ADMIN") return {};
  return { shares: { some: { teamMemberId: subject.teamMemberId } } };
}

/** ¿Este usuario puede EDITAR? Solo dirección — el compartido es de lectura. */
export function canEditRoleDocs(subject: { role: string }): boolean {
  return subject.role === "SUPER_ADMIN";
}

/**
 * ¿Puede leer ESTE documento? Derivado del mismo `where` (composición, no una
 * segunda regla). Devuelve boolean para que el caller elija su respuesta — la
 * convención del repo es 404, no 403: un 403 confirmaría que el documento existe.
 */
export async function canReadRoleDoc(subject: RoleAccessSubject, roleId: string): Promise<boolean> {
  const row = await prisma.roleProfile.findFirst({
    where: { id: roleId, ...visibleRoleWhere(subject) },
    select: { id: true },
  });
  return row !== null;
}

/**
 * ¿Tiene AL MENOS UN documento compartido? Lo consume el sidebar para decidir si le
 * muestra "Roles" a alguien que no es SUPER_ADMIN.
 *
 * `findFirst` y no `count`: la pregunta es de existencia y corre en CADA navegación
 * (AppShell). El índice `RoleProfileShare_teamMemberId_idx` es justamente para esto.
 * El caller NO debe llamarla para un SUPER_ADMIN — para él la respuesta es siempre sí.
 */
export async function hasSharedRoleDocs(teamMemberId: string): Promise<boolean> {
  const row = await prisma.roleProfileShare.findFirst({
    where: { teamMemberId },
    select: { id: true },
  });
  return row !== null;
}
