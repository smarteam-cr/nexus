/**
 * lib/sessions/project-sources.int.test.ts — EL INVARIANTE #1, contra una base REAL.
 *
 * Primer test de integración del repo (F4, 2026-08-01). El chokepoint de sesiones ya
 * tiene escaneos estructurales (que nadie lo saltee) e INV1 (que no haya links cruzados
 * en PROD); lo que faltaba era probar EL COMPORTAMIENTO: que un `SessionProject` que
 * cruza cliente — el defecto exacto del leak de handoffs de DISTELSA — se DESCARTA en
 * runtime aunque exista en la base.
 *
 * Corre contra nexus_test (local embebida, ver test/setup.integration.ts). La base llega
 * VACÍA a cada caso; cada test siembra su propio mundo mínimo.
 */
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  adoptarSesionSinDuenio,
  belongsToClient,
  getClientSessions,
  getProjectMemberSessions,
} from "./project-sources";

async function mundoMinimo() {
  const clienteA = await prisma.client.create({ data: { name: "Cliente A (test)" } });
  const clienteB = await prisma.client.create({ data: { name: "Cliente B (test)" } });
  const proyectoA = await prisma.project.create({
    data: { clientId: clienteA.id, name: "Proyecto de A" },
  });
  const sesionDeA = await prisma.firefliesSession.create({
    data: {
      id: "ses-de-a",
      title: "Kickoff con Cliente A",
      date: new Date("2026-07-01T15:00:00Z"),
      participants: ["ana@cliente-a.test"],
      resolvedClientId: clienteA.id,
    },
  });
  const sesionDeB = await prisma.firefliesSession.create({
    data: {
      id: "ses-de-b",
      title: "Sesión confidencial de Cliente B",
      date: new Date("2026-07-02T15:00:00Z"),
      participants: ["beto@cliente-b.test"],
      resolvedClientId: clienteB.id,
    },
  });
  return { clienteA, clienteB, proyectoA, sesionDeA, sesionDeB };
}

describe("chokepoint de sesiones (invariante #1) — DB real", () => {
  it("una sesión del cliente entra; un link CROSS-CLIENT se descarta y queda en dropped", async () => {
    const { clienteA, proyectoA, sesionDeA, sesionDeB } = await mundoMinimo();

    // Link legítimo + el link envenenado (una sesión de B colgada del proyecto de A —
    // exactamente lo que dejó la migración legacy que causó el leak).
    await prisma.sessionProject.create({
      data: { sessionId: sesionDeA.id, projectId: proyectoA.id },
    });
    await prisma.sessionProject.create({
      data: { sessionId: sesionDeB.id, projectId: proyectoA.id },
    });

    const r = await getProjectMemberSessions(proyectoA.id);

    expect(r.sessions.map((s) => s.id)).toEqual([sesionDeA.id]);
    expect(r.dropped).toHaveLength(1);
    expect(r.dropped[0]).toMatchObject({ sessionId: sesionDeB.id });
    // El contexto de A JAMÁS contiene texto de B:
    expect(JSON.stringify(r.sessions)).not.toContain("confidencial");
    expect(belongsToClient(sesionDeB, clienteA.id)).toBe(false);
  });

  it("manualClientId (override humano) también da pertenencia", async () => {
    const { clienteA, proyectoA } = await mundoMinimo();
    const manual = await prisma.firefliesSession.create({
      data: {
        id: "ses-manual",
        title: "Reclasificada a mano hacia A",
        date: new Date("2026-07-03T15:00:00Z"),
        participants: [],
        resolvedClientId: null,
        manualClientId: clienteA.id,
      },
    });
    await prisma.sessionProject.create({
      data: { sessionId: manual.id, projectId: proyectoA.id },
    });

    const r = await getProjectMemberSessions(proyectoA.id);
    expect(r.sessions.map((s) => s.id)).toContain(manual.id);
    expect(r.dropped).toHaveLength(0);
  });

  it("un link con included=false (tombstone humano) no alimenta nada", async () => {
    const { proyectoA, sesionDeA } = await mundoMinimo();
    await prisma.sessionProject.create({
      data: { sessionId: sesionDeA.id, projectId: proyectoA.id, included: false },
    });

    const r = await getProjectMemberSessions(proyectoA.id);
    expect(r.sessions).toHaveLength(0);
  });

  it("adoptar una sesión HUÉRFANA la hace alimentar de verdad — no solo vincularla", async () => {
    /* EL caso de la tanda D. Sin adoptar, el link se escribe pero `getProjectMemberSessions` lo
       descarta al leer y el handoff sigue vacío: el botón "Agregar" parece funcionar y no hace
       nada. Es exactamente la falla silenciosa que esto vino a matar, así que se prueba contra
       una base real y no con un escaneo de texto. */
    const { clienteA, proyectoA } = await mundoMinimo();
    const huerfana = await prisma.firefliesSession.create({
      data: {
        id: "ses-huerfana",
        title: "SPRINT COMERCIAL | SMARTEAM",
        date: new Date("2026-06-01T15:00:00Z"),
        participants: ["msalas@smarteamcr.com", "bcenteno@smarteamcr.com"],
        // Sin dueño por las dos vías: es el estado de las ~4.900 reuniones internas.
      },
    });
    await prisma.sessionProject.create({
      data: { sessionId: huerfana.id, projectId: proyectoA.id, source: "manual", handoffOverride: true },
    });

    // Antes de adoptar: el link existe y NO alimenta.
    const antes = await getProjectMemberSessions(proyectoA.id);
    expect(antes.sessions.map((s) => s.id)).not.toContain(huerfana.id);
    expect(antes.dropped).toHaveLength(1);

    expect(await adoptarSesionSinDuenio(huerfana.id, clienteA.id)).toBe(true);

    const despues = await getProjectMemberSessions(proyectoA.id);
    expect(despues.sessions.map((s) => s.id)).toContain(huerfana.id);
    expect(despues.dropped).toHaveLength(0);
  });

  it("adoptar NO le roba una sesión a otro cliente", async () => {
    /* El freno que evita que esto se convierta en una fuga de contexto. Una sesión que ya es de
       alguien no se toca, ni siquiera si el link se creó por error. */
    const { clienteA, sesionDeB } = await mundoMinimo();

    expect(await adoptarSesionSinDuenio(sesionDeB.id, clienteA.id)).toBe(false);

    const sigueIgual = await prisma.firefliesSession.findUnique({
      where: { id: sesionDeB.id },
      select: { manualClientId: true, resolvedClientId: true },
    });
    expect(sigueIgual?.manualClientId).toBeNull();
    expect(sigueIgual?.resolvedClientId).not.toBe(clienteA.id);
  });

  it("getClientSessions es client-wide y no cruza: B nunca ve lo de A", async () => {
    const { clienteA, clienteB, sesionDeA, sesionDeB } = await mundoMinimo();

    const deA = await getClientSessions(clienteA.id);
    const deB = await getClientSessions(clienteB.id);

    expect(deA.map((s) => s.id)).toEqual([sesionDeA.id]);
    expect(deB.map((s) => s.id)).toEqual([sesionDeB.id]);
  });
});
