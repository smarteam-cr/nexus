/**
 * lib/sessions/agregar-sesion.ts — LA PUERTA DE «AGREGAR UNA REUNIÓN A UN PROYECTO». UNA SOLA.
 *
 * ── POR QUÉ SALIÓ DE LA RUTA ─────────────────────────────────────────────────
 * Vivía adentro de `handoff-sessions/route.ts`. El 2026-09-23 nació una segunda puerta —el
 * «Contexto del cronograma» (`timeline/sessions`)— que tiene que hacer EXACTAMENTE lo mismo antes
 * de escribir su propio afinado: rechazar el vínculo nuevo a una reunión de otro cliente (INV1),
 * adoptar la huérfana solo cuando no hay nada que decidir, y releer después de adoptar por si otra
 * persona la asignó en paralelo. Copiar esas ~70 líneas eran dos reglas de adopción que se separan
 * el día que alguien arregle una sola.
 *
 * ── QUÉ HACE Y QUÉ NO ────────────────────────────────────────────────────────
 * Decide y, si corresponde, ADOPTA. NO escribe el vínculo: cada puerta hace su propio `upsert`
 * porque cada una escribe SOLO su afinado (`handoffOverride` o `timelineOverride`). La decisión
 * pura vive en `candidatas-internas.ts` (`decidirAlAgregar`, `motivoParaNoAdoptar`), con tests.
 */
import { prisma } from "@/lib/db/prisma";
import { adoptarSesionSinDuenio, belongsToClient } from "./project-sources";
import { decidirAlAgregar, motivoParaNoAdoptar } from "./candidatas-internas";
import { buildInternalDomainsSet } from "./categorize";

export type ResultadoDeAgregar = { ok: true } | { ok: false; status: number; error: string };

export async function prepararVinculoManual(i: {
  sessionId: string;
  projectId: string;
  /** El cliente del proyecto (lo resuelve el guard de la ruta). */
  clientId: string;
  /** `true` = incluir / agregar; `false` = la X. */
  quiereIncluir: boolean;
  actorEmail: string | null;
}): Promise<ResultadoDeAgregar> {
  const [existing, session] = await Promise.all([
    prisma.sessionProject.findUnique({
      where: { sessionId_projectId: { sessionId: i.sessionId, projectId: i.projectId } },
      select: { id: true },
    }),
    prisma.firefliesSession.findUnique({
      where: { id: i.sessionId },
      select: {
        resolvedClientId: true,
        manualClientId: true,
        participants: true,
        organizerEmail: true,
        projects: { select: { project: { select: { clientId: true } } } },
      },
    }),
  ]);
  if (!session) return { ok: false, status: 404, error: "Sesión no existe" };

  /* Sin dueño: vincular no alcanza. `getProjectMemberSessions` descarta al LEER lo que no
     pertenece al cliente, así que el link quedaría escrito, el botón parecería haber funcionado y
     el documento seguiría sin esa reunión. Adoptarla la vuelve del cliente de verdad — pero solo
     lo que `motivoParaNoAdoptar` deja (solo estuvo el equipo, no cuelga de otro cliente). */
  const sinDuenio = session.resolvedClientId === null && session.manualClientId === null;
  let motivoNoAdoptable: string | null = null;
  if (i.quiereIncluir && sinDuenio) {
    const categorias = await prisma.sessionCategory.findMany({ select: { domains: true, kind: true } });
    motivoNoAdoptable = motivoParaNoAdoptar(
      {
        participants: session.participants,
        organizerEmail: session.organizerEmail,
        clientesDeSusProyectos: session.projects.map((p) => p.project.clientId),
      },
      i.clientId,
      buildInternalDomainsSet(categorias),
    );
  }

  const decision = decidirAlAgregar({
    vinculoExiste: existing !== null,
    quiereIncluir: i.quiereIncluir,
    sinDuenio,
    perteneceAlCliente: belongsToClient(session, i.clientId),
    motivoNoAdoptable,
  });
  if (decision.tipo === "rechazar") return { ok: false, status: decision.status, error: decision.error };

  if (decision.tipo === "adoptar") {
    await adoptarSesionSinDuenio(i.sessionId, i.clientId, i.actorEmail);
    /* Carrera: entre la lectura de arriba y la adopción, otra persona pudo asignarla a otro
       cliente (la adopción no pisa: solo escribe si sigue sin dueño). Se relee y, si no quedó de
       este cliente, no se vincula — el vínculo quedaría cruzado. */
    const ahora = await prisma.firefliesSession.findUnique({
      where: { id: i.sessionId },
      select: { resolvedClientId: true, manualClientId: true },
    });
    if (!ahora || !belongsToClient(ahora, i.clientId)) {
      return {
        ok: false,
        status: 409,
        error: "Otra persona acaba de asignar esta reunión a otro cliente: revisala en Sesiones.",
      };
    }
  }
  return { ok: true };
}
