/**
 * lib/sessions/documento-elegidas.int.test.ts — «SOLO LAS ELEGIDAS» EN LOS DOCUMENTOS, contra una base REAL.
 *
 * Etapa 7 de la memoria de la cuenta (DECISIONS «Los documentos leen la memoria y solo las reuniones elegidas»):
 * en los seis documentos (`DESTINOS_SOLO_ELEGIDAS`) entra solo la reunión que eligió una persona (`true` en su
 * columna). Lo que se prueba con filas reales, por el chokepoint (`getProjectDocumentSessions` →
 * `getProjectMemberSessions`, invariante #1):
 *   · sin tocar (`null`) no entra, aunque sea con el cliente; desestimada (`false`) tampoco; elegida sí;
 *   · elegir para un documento no la mete en los otros;
 *   · ⛔ una reunión de OTRO cliente elegida (`true`) nunca entra: el chokepoint la descarta antes de la regla.
 *   · una elegida de antes del piso del proyecto (vínculo del agente que alguien eligió) se lee en ESE documento:
 *     el lector la exime del piso (`elegidaEn`), y la membresía del resto (el handoff, la memoria) sigue con el piso.
 *
 * Corre contra nexus_test (local embebida, ver test/setup.integration.ts). La base llega VACÍA a cada caso.
 */
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { getProjectDocumentSessions, getProjectMemberSessions } from "./project-sources";

async function mundo() {
  const clienteA = await prisma.client.create({ data: { name: "Cliente A (test)" } });
  const clienteB = await prisma.client.create({ data: { name: "Cliente B (test)" } });
  const proyectoA = await prisma.project.create({ data: { clientId: clienteA.id, name: "Proyecto de A" } });
  const reunion = (id: string, clientId: string, dia: number) =>
    prisma.firefliesSession.create({
      data: {
        id,
        title: `Reunión ${id}`,
        date: new Date(Date.UTC(2026, 6, dia, 15)),
        participants: ["ana@cliente-a.test", "csm@smarteamcr.com"],
        resolvedClientId: clientId,
      },
    });
  const [sinTocar, elegida, desestimada, deOtro] = await Promise.all([
    reunion("ses-sin-tocar", clienteA.id, 1),
    reunion("ses-elegida", clienteA.id, 2),
    reunion("ses-desestimada", clienteA.id, 3),
    reunion("ses-de-b", clienteB.id, 4),
  ]);
  await prisma.sessionProject.createMany({
    data: [
      { sessionId: sinTocar.id, projectId: proyectoA.id },
      { sessionId: elegida.id, projectId: proyectoA.id, source: "manual", diagnosisOverride: true },
      { sessionId: desestimada.id, projectId: proyectoA.id, diagnosisOverride: false },
      // El vínculo envenenado: una reunión de B colgada del proyecto de A, ELEGIDA.
      { sessionId: deOtro.id, projectId: proyectoA.id, source: "manual", diagnosisOverride: true, kickoffOverride: true },
    ],
  });
  return { proyectoA, sinTocar, elegida, desestimada, deOtro };
}

describe("los documentos leen solo las reuniones elegidas (etapa 7) — DB real", () => {
  it("entra solo la elegida: sin tocar no (aunque sea con el cliente) y desestimada tampoco", async () => {
    const { proyectoA, elegida } = await mundo();
    const r = await getProjectDocumentSessions(proyectoA.id, "diagnostico");
    expect(r.sessions.map((s) => s.id)).toEqual([elegida.id]);
  });

  it("elegir para un documento no la mete en los otros", async () => {
    const { proyectoA } = await mundo();
    for (const d of ["planificacion", "ejecucion", "integraciones", "entrega"] as const) {
      const r = await getProjectDocumentSessions(proyectoA.id, d);
      expect(r.sessions, d).toHaveLength(0);
    }
  });

  it("⛔ una reunión de otro cliente elegida nunca entra: el chokepoint la descarta", async () => {
    const { proyectoA, deOtro } = await mundo();
    const diag = await getProjectDocumentSessions(proyectoA.id, "diagnostico");
    const kickoff = await getProjectDocumentSessions(proyectoA.id, "kickoff");
    expect(diag.sessions.map((s) => s.id)).not.toContain(deOtro.id);
    expect(kickoff.sessions).toHaveLength(0);
    expect(diag.dropped.map((d) => d.sessionId)).toContain(deOtro.id);
  });

  it("leer no escribe nada: ningún vínculo pasa a `true` solo", async () => {
    const { proyectoA, sinTocar } = await mundo();
    await getProjectDocumentSessions(proyectoA.id, "diagnostico");
    const v = await prisma.sessionProject.findUnique({
      where: { sessionId_projectId: { sessionId: sinTocar.id, projectId: proyectoA.id } },
      select: { diagnosisOverride: true, kickoffOverride: true },
    });
    expect(v).toEqual({ diagnosisOverride: null, kickoffOverride: null });
  });

  it("⭐ una elegida de antes del piso del proyecto se lee en ese documento, y solo en ese", async () => {
    // El cliente ya tuvo otro proyecto: el piso del nuevo es su inicio menos 90 días (lib/sessions/piso-del-proyecto.ts).
    const cliente = await prisma.client.create({ data: { name: "Cliente con historia (test)" } });
    await prisma.project.create({
      data: { clientId: cliente.id, name: "Proyecto anterior", createdAt: new Date(Date.UTC(2025, 0, 10)) },
    });
    const nuevo = await prisma.project.create({
      data: { clientId: cliente.id, name: "Proyecto nuevo", createdAt: new Date(Date.UTC(2026, 6, 15)) },
    });
    const vieja = await prisma.firefliesSession.create({
      data: {
        id: "ses-vieja",
        title: "Reunión de 2025",
        date: new Date(Date.UTC(2025, 10, 4, 15)),
        participants: ["ana@cliente.test", "csm@smarteamcr.com"],
        resolvedClientId: cliente.id,
      },
    });
    // El vínculo lo dejó el clasificador (source agent) y alguien la eligió para el diagnóstico: la puerta escribe solo
    // el afinado (no `source`), así que el piso la sacaba.
    await prisma.sessionProject.create({ data: { sessionId: vieja.id, projectId: nuevo.id, diagnosisOverride: true } });

    const diag = await getProjectDocumentSessions(nuevo.id, "diagnostico");
    expect(diag.sessions.map((s) => s.id)).toEqual([vieja.id]);
    // Los otros documentos no la leen (nadie la eligió ahí), y la membresía del resto sigue con el piso.
    expect((await getProjectDocumentSessions(nuevo.id, "planificacion")).sessions).toHaveLength(0);
    const miembros = await getProjectMemberSessions(nuevo.id);
    expect(miembros.sessions).toHaveLength(0);
    expect(miembros.anteriores?.map((a) => a.sessionId)).toEqual([vieja.id]);
  });
});
