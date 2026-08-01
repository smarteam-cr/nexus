import { NextResponse } from "next/server";
import { guardAccessToProject, guardPermission } from "@/lib/auth/api-guards";
import { avanzarAlta } from "@/lib/projects/alta-runner";

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

  /* Reintentar es TERMINAR el alta, así que pide la misma celda que empezarla. Un rol que no
     puede dar de alta tampoco debería poder disparar una escritura en el CRM desde un cartel. */
  const permiso = await guardPermission("proyectos", "create");
  if (permiso instanceof NextResponse) return permiso;

  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const alta = await avanzarAlta(projectId);
  return NextResponse.json({
    estado: alta.estado,
    termino: alta.termino,
    error: alta.error,
    hubspotServiceId: alta.hubspotServiceId,
  });
}
