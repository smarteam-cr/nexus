import { NextRequest, NextResponse } from "next/server";
import { guardAccessToClient, guardPermission } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { actualizarCslEncargado, resolverOwnerIdPorEmail } from "@/lib/hubspot/project-record";
import { syncProjectsForClient } from "@/lib/hubspot/sync-projects";
import { PROYECTO_DE_PIPELINE_CS_WHERE } from "@/lib/projects/scope";

/**
 * PATCH /api/clients/[id]/cse-encargado — reasignar el CSE encargado de una CUENTA.
 *
 * ── ES POR CLIENTE, NO POR PROYECTO, Y ESA ES LA IDEA ────────────────────────
 * Elías, 2026-08-21: *«Los customer success del pipeline de implementación de hubspot son los
 * customer success de la cuenta»*. El encargado no es un atributo de UN proyecto: es de la
 * cuenta, y vive replicado en `csl_encargado` de cada proyecto del pipeline de Implementación
 * de HubSpot. Por eso esta ruta cuelga del cliente y escribe TODOS esos proyectos de una.
 *
 * ⛔ NUNCA toca los de "development"/"sitios-web". Ésos cuelgan como hijos/hermanos de una
 * implementación (`hermanoCsProjectId`) y tienen su propio encargado técnico — a veces un
 * desarrollador. Pisarlo le sacaría a esa persona el acceso a SU pipeline. El filtro sale de
 * `PROYECTO_DE_PIPELINE_CS_WHERE`, el mismo que usa `lib/auth/access.ts`.
 *
 * ── ESCRIBE EN HUBSPOT, NO EN NEXUS ─────────────────────────────────────────
 * Mismo motivo que el interruptor de "interno": `Project.hubspotOwnerId/Name/Email` los escribe
 * SOLO el espejo, que los resuelve desde `csl_encargado`. Si esta ruta escribiera esas columnas,
 * el sync las revertiría en diez minutos — sobre el campo que decide QUIÉN VE EL CLIENTE.
 *
 * ── PERMISO: LIDERAZGO, NO EL CSE ───────────────────────────────────────────
 * `proyectos.reasignarEncargado`, por default solo CSL + SUPER_ADMIN (decisión de Elías). Mover
 * cartera es decisión de liderazgo, y como `csl_encargado` gobierna la visibilidad, un CSE que
 * pudiera reasignar podría quitarse —o quitarle a otro— una cuenta entera sin aprobación.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;

  const permiso = await guardPermission("proyectos", "reasignarEncargado");
  if (permiso instanceof NextResponse) return permiso;
  const guard = await guardAccessToClient(clientId);
  if (guard instanceof NextResponse) return guard;

  let body: { email?: unknown };
  try {
    body = (await req.json()) as { email?: unknown };
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email) {
    return NextResponse.json({ error: "Falta `email` del nuevo encargado." }, { status: 400 });
  }

  /* Solo se puede asignar a alguien del equipo, y activo. Aceptar un email cualquiera dejaría
     escribir en HubSpot un owner que Nexus no conoce — o resucitar a alguien que se fue. */
  const destino = await prisma.teamMember.findUnique({
    where: { email },
    select: { email: true, name: true, deactivatedAt: true },
  });
  if (!destino || destino.deactivatedAt) {
    return NextResponse.json(
      { error: "Esa persona no está en el equipo activo de Nexus." },
      { status: 400 },
    );
  }

  /**
   * ⚠ `hubspotServiceId: { not: null }` va aparte del filtro de pipeline, y hace falta:
   * `PROYECTO_DE_PIPELINE_CS_WHERE` mira SOLO el pipeline, así que deja pasar el contenedor
   * "Información del cliente" y cualquier alta a medio hacer — los dos sin record en HubSpot.
   * Sin esto, el loop de abajo intentaría un PATCH contra un id vacío.
   */
  const proyectos = await prisma.project.findMany({
    where: { clientId, hubspotServiceId: { not: null }, ...PROYECTO_DE_PIPELINE_CS_WHERE },
    select: { id: true, name: true, hubspotServiceId: true },
  });
  if (proyectos.length === 0) {
    return NextResponse.json(
      {
        error:
          "Este cliente no tiene ningún proyecto de Implementación de HubSpot sincronizado, " +
          "así que no hay dónde escribir el encargado.",
      },
      { status: 409 },
    );
  }

  const hs = await getSystemHubspotClient();

  const ownerId = await resolverOwnerIdPorEmail(hs, destino.email);
  if (!ownerId) {
    return NextResponse.json(
      {
        error:
          `${destino.name} está en el equipo de Nexus pero no tiene usuario en HubSpot, ` +
          `así que no se le puede asignar la cuenta allá.`,
      },
      { status: 409 },
    );
  }

  /**
   * ⚠ SECUENCIAL Y SIN ROLLBACK, dicho a propósito. Cada PATCH es independiente: si el tercero
   * de cinco falla, los dos primeros YA quedaron escritos en HubSpot y no hay forma de deshacerlos
   * (no existe rollback en ninguna parte de esta base). Por eso el error dice CUÁNTOS entraron —
   * un "falló" a secas mandaría a alguien a reintentar creyendo que no se escribió nada.
   */
  const escritos: string[] = [];
  for (const p of proyectos) {
    try {
      await actualizarCslEncargado(hs, p.hubspotServiceId!, ownerId);
      escritos.push(p.name);
    } catch (e) {
      return NextResponse.json(
        {
          error:
            `Se reasignaron ${escritos.length} de ${proyectos.length} proyectos y falló en ` +
            `«${p.name}»: ${(e as Error).message}. Los ${escritos.length} anteriores YA quedaron ` +
            `a nombre de ${destino.name} en HubSpot — reintentá para terminar los que faltan.`,
          escritos: escritos.length,
          total: proyectos.length,
        },
        { status: 502 },
      );
    }
  }

  /* Un solo sync por cliente al final, no uno por proyecto: el espejo trae TODOS los proyectos
     de la empresa en la misma corrida, así que llamarlo N veces sería pagar lo mismo N veces. */
  const espejo = await syncProjectsForClient(clientId, { force: true });
  if (espejo.errors.length > 0) {
    return NextResponse.json(
      {
        error:
          `Se reasignaron los ${proyectos.length} proyectos en HubSpot, pero Nexus no pudo ` +
          `confirmarlo (${espejo.errors[0]}). El cambio allá ya está hecho: recargá en un minuto.`,
        escritos: proyectos.length,
        total: proyectos.length,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ encargado: destino.name, proyectos: proyectos.length });
}
