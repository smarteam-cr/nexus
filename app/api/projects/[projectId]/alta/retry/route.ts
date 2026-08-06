import { NextResponse } from "next/server";
import { guardAccessToProject, guardPermission } from "@/lib/auth/api-guards";
import { avanzarAlta } from "@/lib/projects/alta-runner";
import { prisma } from "@/lib/db/prisma";

/**
 * POST /api/projects/[projectId]/alta/retry — RETOMAR un alta que quedó a medio hacer.
 *
 * Es el botón "Reintentar" del cartel. No hay nada acá: todo el trabajo —y toda la seguridad
 * contra duplicar— vive en `avanzarAlta`, que relee el estado desde la base y decide qué paso
 * corresponde. Este endpoint no le pasa NINGÚN dato al motor a propósito: si aceptara un paso
 * o un estado del cliente, un reintento con el cuerpo equivocado podría hacer que se cree un
 * segundo record en el CRM. El único parámetro es el id del proyecto.
 *
 * Idempotente por consecuencia: apretarlo dos veces sobre un alta ya terminada no hace nada
 * (el motor sale en el primer paso) y devuelve el mismo 200 con `termino: true`. Por eso el
 * doble click no necesita candado en la pantalla.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await ctx.params;

  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  /**
   * ── QUIÉN PUEDE TERMINAR UN ALTA ────────────────────────────────────────────
   * Reintentar es TERMINAR el alta, así que pide la misma celda que empezarla: un rol que no
   * puede dar de alta tampoco debería disparar una escritura en el CRM desde un cartel.
   *
   * ⚠ CON UNA EXCEPCIÓN, y existe porque si no la puerta queda abierta de un lado y cerrada del
   * otro: `POST /api/clients/traer-de-hubspot` lo puede apretar cualquier miembro del equipo
   * (su candado es la forma del endpoint, no una celda). Si el espejo falla justo ahí —el
   * escenario para el que se construyó este botón— quien la trajo se queda mirando un cartel
   * que le dice «Reintentar» y un 403 al apretarlo. Quien EMPEZÓ el alta puede terminarla.
   */
  const suya = await prisma.project.findUnique({
    where: { id: projectId },
    select: { altaActorEmail: true },
  });
  const laEmpezoEstaPersona =
    !!suya?.altaActorEmail &&
    suya.altaActorEmail.toLowerCase() === guard.user.email.toLowerCase();
  if (!laEmpezoEstaPersona) {
    const permiso = await guardPermission("proyectos", "create");
    if (permiso instanceof NextResponse) return permiso;
  }

  const alta = await avanzarAlta(projectId);
  return NextResponse.json({
    estado: alta.estado,
    termino: alta.termino,
    error: alta.error,
    hubspotServiceId: alta.hubspotServiceId,
  });
}
