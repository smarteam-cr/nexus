import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject, guardPermission } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { actualizarProyectoInterno } from "@/lib/hubspot/project-record";
import { espejarProyectoRecienCreado } from "@/lib/hubspot/sync-projects";

/**
 * PATCH /api/projects/[projectId]/interno — marcar o desmarcar "proyecto interno de Smarteam".
 *
 * ── ESCRIBE EN HUBSPOT, NO EN NEXUS. Y ES LA DECISIÓN DE FONDO ───────────────
 * `Project.proyectoInterno` tiene UN escritor —el espejo— y una guarda que lo hace cumplir
 * (`scope-coverage.test.ts`). Si esta ruta escribiera la columna, el sync la revertiría en diez
 * minutos sobre un campo que decide FACTURACIÓN, y el síntoma sería un interruptor que "no
 * guarda" sin ningún error. Así que manda el cambio a HubSpot y después trae el espejo de ese
 * proyecto para que la pantalla muestre la verdad y no una promesa.
 *
 * ── LO QUE ESTE INTERRUPTOR CAMBIA DE VERDAD ─────────────────────────────────
 * Marcar interno apaga cuatro cosas: cobranza, cartera del CSE, publicación al cliente y el
 * vigilante. No es una etiqueta: es sacar un proyecto del dinero. Por eso pide su propia celda
 * de permiso (`proyectos.marcarInterno`), que por default tiene solo el liderazgo de CS.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;

  const permiso = await guardPermission("proyectos", "marcarInterno");
  if (permiso instanceof NextResponse) return permiso;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  let body: { interno?: unknown };
  try {
    body = (await req.json()) as { interno?: unknown };
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }
  if (typeof body.interno !== "boolean") {
    return NextResponse.json({ error: "Falta `interno` (booleano)." }, { status: 400 });
  }

  const proyecto = await prisma.project.findUnique({
    where: { id: projectId },
    select: { hubspotServiceId: true, proyectoInterno: true },
  });
  if (!proyecto) return NextResponse.json({ error: "Proyecto no existe" }, { status: 404 });

  /* Sin registro en HubSpot no hay dónde escribir. Pasa con un alta a medio hacer: el proyecto
     existe en Nexus pero el CRM todavía no lo conoce. Se dice, en vez de fallar con un 500 que
     nadie sabe interpretar. */
  if (!proyecto.hubspotServiceId) {
    return NextResponse.json(
      {
        error:
          "Este proyecto todavía no existe en HubSpot, así que no se le puede cambiar la marca. " +
          "Terminá el alta primero.",
      },
      { status: 409 },
    );
  }
  if (proyecto.proyectoInterno === body.interno) {
    return NextResponse.json({ interno: proyecto.proyectoInterno, sinCambios: true });
  }

  const hs = await getSystemHubspotClient();
  await actualizarProyectoInterno(hs, proyecto.hubspotServiceId, body.interno);

  /* Traer el espejo YA, en vez de esperar los diez minutos del sync: si la pantalla se recargara
     con el valor viejo, la persona apretaría de nuevo pensando que no funcionó. */
  await espejarProyectoRecienCreado(guard.clientId, proyecto.hubspotServiceId);

  const despues = await prisma.project.findUnique({
    where: { id: projectId },
    select: { proyectoInterno: true },
  });
  return NextResponse.json({ interno: despues?.proyectoInterno ?? body.interno });
}
