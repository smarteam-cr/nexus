import { NextRequest, NextResponse } from "next/server";
import { guardAccessToClient, guardPermission } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { actualizarEncargadosDelProyecto, resolverOwnerIdPorEmail } from "@/lib/hubspot/project-record";
import { escribirEncargadosEnLaEmpresa, laCsl } from "@/lib/hubspot/encargados-de-la-cuenta";
import { cargarCuentas, hoyEnCostaRica } from "@/lib/cs/cartera";
import { lineaDeLoEsencial, resumenDelPase } from "@/lib/cs/pase-de-cuenta";
import { loEsencialDeLaCuenta } from "@/lib/memoria";
import { syncProjectsForClient } from "@/lib/hubspot/sync-projects";
import { PROYECTO_DE_PIPELINE_CS_WHERE } from "@/lib/projects/scope";
import { avisar } from "@/lib/para-ti/avisos-server";

/**
 * PATCH /api/clients/[id]/cse-encargado — reasignar el CSE encargado de una CUENTA (el «pase de cuenta»).
 *
 * ── DESDE EL 2026-10-09: «CSE ENCARGADO» Y «CSL ENCARGADO» (entrega 5 del plan de la cartera) ──────────
 * Escribe «CSE Encargado» (`cse_encargado`) = el CSE elegido y «CSL Encargado» (`csl_encargado`) = la CSL del
 * equipo, en los proyectos de implementación, en la EMPRESA y en sus CONTACTOS. El espejo lee primero
 * `cse_encargado` (lib/hubspot/encargados.ts). Al CSE nuevo le llega en «Para ti» el resumen de la cuenta; al
 * anterior, una línea de que la cuenta pasó.
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
    // Solo los activos (2026-10-11): un proyecto cerrado guarda quién lo llevaba entonces, y el espejo no lo relee.
    where: { clientId, status: "active", hubspotServiceId: { not: null }, ...PROYECTO_DE_PIPELINE_CS_WHERE },
    select: { id: true, name: true, hubspotServiceId: true },
  });
  if (proyectos.length === 0) {
    return NextResponse.json(
      {
        error:
          "Este cliente no tiene ningún proyecto activo de Implementación de HubSpot sincronizado, " +
          "así que no hay dónde escribir el encargado.",
      },
      { status: 409 },
    );
  }

  const hs = await getSystemHubspotClient();

  // Quién la llevaba (para avisarle que pasó) y la CSL que queda como «CSL Encargado».
  const antes = await prisma.project.findMany({
    where: { id: { in: proyectos.map((p) => p.id) } },
    select: { hubspotOwnerEmail: true },
  });
  const anteriores = [...new Set(antes.map((p) => p.hubspotOwnerEmail?.toLowerCase()).filter((e): e is string => !!e))].filter(
    (e) => e !== destino.email.toLowerCase(),
  );
  const csl = await laCsl();
  const cslOwnerId = csl ? await resolverOwnerIdPorEmail(hs, csl.email) : null;

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
      await actualizarEncargadosDelProyecto(hs, p.hubspotServiceId!, { cse: ownerId, csl: cslOwnerId });
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

  /* La empresa y sus contactos (2026-10-09). No frena el pase: lo que decide quién ve la cuenta son los proyectos,
     que ya quedaron escritos. Lo que no entró se dice en la respuesta. */
  const empresaId = (await prisma.client.findUnique({ where: { id: clientId }, select: { hubspotCompanyId: true } }))?.hubspotCompanyId ?? null;
  const enLaEmpresa = empresaId
    ? await escribirEncargadosEnLaEmpresa(hs, empresaId, { cse: ownerId, csl: cslOwnerId })
    : { empresa: false, contactos: 0, contactosFallidos: 0, error: "el cliente no está ligado a una empresa de HubSpot" };

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

  // «Para ti» (2026-10-04): a quien queda como encargado le llega el aviso (salvo que se lo haya asignado a sí mismo).
  // Desde el 2026-10-09 trae el resumen de la cuenta (lib/cs/pase-de-cuenta.ts); si no se puede armar, los proyectos.
  // Desde la etapa 3 de la memoria (2026-10-10), también lo esencial de la memoria interna: la ficha confirmada, las
  // personas, los compromisos abiertos y los pedidos fuera de alcance abiertos (lib/memoria › loEsencialDeLaCuenta).
  const cliente = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
  const hoy = hoyEnCostaRica();
  const [[cuenta], esencial] = await Promise.all([
    cargarCuentas(null, { clientIds: [clientId], incluirSinServicio: true }).catch(() => []),
    loEsencialDeLaCuenta(clientId, { lector: "pase-de-cuenta" }),
  ]);
  const proyectosEnUnaLinea =
    proyectos.length === 1 ? `«${proyectos[0].name}».` : `${proyectos.length} proyectos: ${proyectos.map((p) => `«${p.name}»`).join(", ")}.`;
  await avisar({
    para: destino.email,
    tipo: "proyecto.encargado",
    titulo: `Quedaste como encargado de ${cliente?.name ?? "una cuenta"}`,
    detalle: cuenta ? resumenDelPase(cuenta, hoy, esencial) : [lineaDeLoEsencial(esencial), proyectosEnUnaLinea].filter(Boolean).join(" "),
    href: `/clients/${encodeURIComponent(clientId)}`,
    actorEmail: guard.user.email,
    dedupeKey: `proyecto.encargado:${clientId}:${new Date().toISOString().slice(0, 10)}`,
  });
  for (const anterior of anteriores) {
    await avisar({
      para: anterior,
      tipo: "proyecto.encargado",
      titulo: `${cliente?.name ?? "Una cuenta"} pasó a ${destino.name}`,
      detalle: `Desde hoy la lleva ${destino.name}. ${proyectosEnUnaLinea}`,
      href: `/clients/${encodeURIComponent(clientId)}`,
      actorEmail: guard.user.email,
      dedupeKey: `proyecto.encargado.paso:${clientId}:${anterior}:${new Date().toISOString().slice(0, 10)}`,
    });
  }

  return NextResponse.json({
    encargado: destino.name,
    proyectos: proyectos.length,
    empresa: enLaEmpresa.empresa,
    contactos: enLaEmpresa.contactos,
    contactosFallidos: enLaEmpresa.contactosFallidos,
    avisoEmpresa: enLaEmpresa.error,
  });
}
