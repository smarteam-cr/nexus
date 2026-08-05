import { NextRequest, NextResponse } from "next/server";
import { guardAccessToClient, guardCapability } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; projectId: string }> }
) {
  const { id, projectId } = await params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;

  const body = await req.json() as { name?: string; status?: string; serviceType?: string; hubspotDealId?: string | null };

  const data: { name?: string; status?: string; serviceType?: string; hubspotDealId?: string | null } = {};
  if (body.name?.trim()) data.name = body.name.trim();
  if (body.status) data.status = body.status;
  if (body.serviceType !== undefined) data.serviceType = body.serviceType;
  if (body.hubspotDealId !== undefined) data.hubspotDealId = body.hubspotDealId;

  const project = await prisma.project.update({
    where: { id: projectId },
    data,
  });

  return NextResponse.json({ project });
}

/**
 * DELETE — borra un proyecto de Nexus (hard delete: cascada a handoff/cronograma/canvases/
 * docs/contexto/links de sesiones; preserva facturación/action-items/alertas con FK nula) y
 * lo DESASOCIA de HubSpot: si venía del sync (tiene hubspotServiceId), ese id se agrega a la
 * lista de ignorados del cliente para que el sync NO lo vuelva a crear (el deal/objeto en
 * HubSpot queda intacto). Reversible sacándolo de la lista ("re-agregar a mano").
 * Gate: `deleteClients` (CSL/SUPER_ADMIN), igual que borrar cliente.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; projectId: string }> }
) {
  const { id: clientId, projectId } = await params;
  const guard = await guardCapability("deleteClients");
  if (guard instanceof NextResponse) return guard;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { clientId: true, hubspotServiceId: true },
  });
  if (!project || project.clientId !== clientId) {
    return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  }

  /* Los DOS pasos —suprimir el re-sync y borrar— van en UNA transacción.
     Antes eran dos `await` sueltos, y el orden importa: la supresión tiene que ir ANTES (el flag
     no puede vivir en el Project que se elimina), así que si el `delete` fallaba después —pool
     saturado, un EMAXCONNSESSION de los que este repo ya tiene historial— quedaba un proyecto
     VIVO cuyo id el sync saltea para siempre. Ese estado no se ve: el proyecto se abre, se ve
     normal, sigue contando para cobranza y para la cartera, y nunca más se le actualiza etapa,
     estado ni dueño desde HubSpot. Un fantasma al revés, y el reintento del botón no lo arregla
     porque el push es idempotente. Con la transacción, o pasan las dos cosas o no pasa ninguna. */
  await prisma.$transaction(async (tx) => {
    // Solo si vino del sync (hubspotServiceId). Idempotente.
    if (project.hubspotServiceId) {
      // `push` es atómico: leer-modificar-escribir el array entero podía perder una supresión si
      // se borran dos proyectos del mismo cliente a la vez. El `includes` evita duplicar el id.
      const client = await tx.client.findUnique({
        where: { id: clientId },
        select: { ignoredHubspotServiceIds: true },
      });
      if (!client?.ignoredHubspotServiceIds.includes(project.hubspotServiceId)) {
        await tx.client.update({
          where: { id: clientId },
          data: { ignoredHubspotServiceIds: { push: project.hubspotServiceId } },
        });
      }
    }
    /* ⚠ ESTO ES PLATA. `hermanoCsProjectId` no es clave foránea, así que borrar la implementación
       deja al desarrollo que colgaba de ella apuntando a un fantasma — y el criterio de cobranza
       (`NO_ES_HERMANO_DE_CS`, lib/projects/scope.ts) exige que ese campo esté VACÍO para facturar.
       Un puntero muerto no está vacío: el proyecto hijo **deja de facturar en silencio**, se sigue
       viendo normal, y solo se sana cuando `resolverHermanos()` corra en el próximo sync del
       cliente. Nulearlo acá cierra esa ventana, y va DENTRO de la transacción por lo mismo que el
       bloque de arriba: o pasan las dos cosas o no pasa ninguna. */
    await tx.project.updateMany({
      where: { hermanoCsProjectId: projectId },
      data: { hermanoCsProjectId: null },
    });
    await tx.project.delete({ where: { id: projectId } });
  });

  return NextResponse.json({ ok: true });
}
