/**
 * lib/documentacion/permisos.ts — quién puede qué sobre UNA página. SERVIDOR.
 *
 * La celda del registry dice qué puede hacer la persona en el módulo; acá se cruza con el estado
 * de la página, que es lo que el registry no sabe:
 *
 *   · Una página BLOQUEADA (las dos sembradas nacen así) solo la edita `documentacion.manage`.
 *     Es lo que evita que el reglamento de la Escala o el manual de Nexus cambien sin querer.
 *   · Archivar es de `manage`… salvo el borrador propio: quien creó una página no bloqueada, sin
 *     subpáginas, puede archivarla. Sin esto, alguien que crea una página por error tiene que
 *     pedirle a un líder que se la saque — y la base se llena de restos.
 *   · Una página bloqueada tampoco acepta subpáginas nuevas: el árbol debajo de ella es parte de
 *     lo que se está protegiendo.
 *
 * Las rutas llaman PRIMERO a `guardPermission("documentacion", "write")` (el piso del módulo) y
 * después a estas funciones para el caso fino.
 */
import { can } from "@/lib/auth/permissions/engine";

/** Lo que el engine necesita para resolver permisos: el TeamMember de `requireInternalUser`. */
type Sujeto = Parameters<typeof can>[0];

/** Lo que hace falta saber de la página para decidir. */
export interface EstadoDePagina {
  bloqueada: boolean;
  fija: boolean;
  creadaPorEmail: string | null;
}

/** ¿Puede editar el contenido, el título o el ícono de esta página? */
export async function puedeEditarPagina(sujeto: Sujeto, pagina: EstadoDePagina): Promise<boolean> {
  if (pagina.bloqueada) return can(sujeto, "documentacion", "manage");
  return can(sujeto, "documentacion", "write");
}

/** ¿Puede crear una subpágina acá? (`null` = en la raíz). */
export async function puedeCrearBajo(
  sujeto: Sujeto,
  madre: Pick<EstadoDePagina, "bloqueada"> | null,
): Promise<boolean> {
  if (madre?.bloqueada) return can(sujeto, "documentacion", "manage");
  return can(sujeto, "documentacion", "write");
}

/** ¿Puede archivar esta página? El dueño puede con su propio borrador; el resto, con `manage`. */
export async function puedeArchivar(
  sujeto: Sujeto,
  pagina: EstadoDePagina & { tieneHijas: boolean },
  email: string,
): Promise<boolean> {
  if (await can(sujeto, "documentacion", "manage")) return true;
  if (pagina.fija || pagina.bloqueada || pagina.tieneHijas) return false;
  if (!pagina.creadaPorEmail || pagina.creadaPorEmail !== email) return false;
  return can(sujeto, "documentacion", "write");
}

/**
 * Restaurar de la papelera y poner o sacar el candado piden `manage`.
 *
 * ⚠ MOVER no está acá a propósito: reordenar y anidar es parte de escribir la base (en Notion lo
 * hace cualquiera). Lo que sí frena es el candado, por el lado de `puedeEditarPagina`: una página
 * bloqueada no se mueve, y una madre bloqueada no recibe hijas.
 */
export async function puedeOrdenar(sujeto: Sujeto): Promise<boolean> {
  return can(sujeto, "documentacion", "manage");
}
