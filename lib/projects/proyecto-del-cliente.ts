/**
 * lib/projects/proyecto-del-cliente.ts — UN ID DE PROYECTO QUE VINO DEL BODY NO ES DE NADIE HASTA
 * QUE SE CRUZA CON EL CLIENTE DE LA URL.
 *
 * ── EL AGUJERO QUE CIERRA (auditoría 2026-09-03) ────────────────────────────────────────────
 * `POST /api/clients/[id]/analyze` valida el cliente de la URL con `withClientAccess` y después usa
 * `body.projectId` TAL CUAL en los seis runners y en las escrituras del handoff. Un CSE con acceso a
 * un solo cliente podía generar o regenerar los documentos de IA del proyecto de OTRO cliente —
 * pisando bloques, reescribiendo tags, sellando `handoffGeneratedAt`— con el contexto armado desde
 * las sesiones y el HubSpot del cliente equivocado. Sin error ni rastro.
 *
 * La regla es la del molde `app/api/clients/[id]/projects/[projectId]/route.ts`: el proyecto se
 * busca por id Y por cliente, y si no está, es 404 — un proyecto ajeno es indistinguible de uno
 * inexistente, a propósito.
 *
 * ⚠ Puro: el cliente de Prisma entra por parámetro, así se prueba con una base falsa y el helper
 * sirve igual desde una ruta, un script o una transacción.
 */

export interface LectorDeProyectos {
  project: {
    findFirst(args: {
      where: { id: string; clientId: string };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
}

/**
 * Devuelve `{ id }` si el proyecto existe Y pertenece a ese cliente; `null` en cualquier otro caso.
 * `null` significa 404, nunca «seguí con el id crudo».
 */
export async function proyectoDelCliente(
  db: LectorDeProyectos,
  args: { projectId: string; clientId: string },
): Promise<{ id: string } | null> {
  if (!args.projectId || !args.clientId) return null;
  return db.project.findFirst({
    where: { id: args.projectId, clientId: args.clientId },
    select: { id: true },
  });
}
