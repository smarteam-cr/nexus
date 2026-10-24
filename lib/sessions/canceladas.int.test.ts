/**
 * lib/sessions/canceladas.int.test.ts — una reunión cancelada sin texto sale de las lecturas; con texto, se queda (U1).
 *
 * Contra nexus_test (test/setup.integration.ts): la base llega vacía a cada caso. Lo que se prueba es el
 * comportamiento real de los dos filtros de lib/sessions/canceladas.ts —el de Prisma, en el chokepoint, y el de SQL,
 * en el buscador— contra Postgres: las relaciones (minuta, hechos, tareas) y el `null` del resumen.
 */
import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getClientSessions, getProjectMemberSessions } from "./project-sources";
import { noEsCanceladaSinTextoSql, SE_LEE_SI_CANCELADA_TIENE_SU_DOC } from "./canceladas";

const AYER = new Date(Date.now() - 24 * 60 * 60 * 1000);
const CANCELADA = new Date();

async function mundo() {
  const cliente = await prisma.client.create({ data: { name: "Cliente con canceladas (test)" } });
  const proyecto = await prisma.project.create({ data: { clientId: cliente.id, name: "Proyecto (test)" } });
  const reunion = (id: string, extra: Partial<Prisma.FirefliesSessionUncheckedCreateInput> = {}) =>
    prisma.firefliesSession.create({
      data: { id, title: id, date: AYER, participants: ["ana@cliente.test"], resolvedClientId: cliente.id, ...extra },
    });
  await reunion("vigente");
  await reunion("cancelada-sin-texto", { canceladaEn: CANCELADA });
  await reunion("cancelada-con-transcripcion", { canceladaEn: CANCELADA, transcript: "Ana: arrancamos el kickoff." });
  await reunion("cancelada-con-resumen", { canceladaEn: CANCELADA, summary: { notas: "lo acordado" } });
  await reunion("cancelada-con-minuta", { canceladaEn: CANCELADA });
  await prisma.sessionMinute.create({ data: { sessionId: "cancelada-con-minuta", summary: "Se acordó el alcance." } });
  // El resumen en JSON `null` no es texto, ni la transcripción vacía.
  await reunion("cancelada-con-resumen-null", { canceladaEn: CANCELADA, summary: Prisma.JsonNull });
  await reunion("cancelada-con-transcripcion-vacia", { canceladaEn: CANCELADA, transcript: "" });
  // Solo con lo que dejó su lectura: un hecho, o una tarea.
  await reunion("cancelada-con-hechos", { canceladaEn: CANCELADA });
  await prisma.hechoDeReunion.create({
    data: {
      sessionId: "cancelada-con-hechos",
      clientId: cliente.id,
      tipo: "acuerdo",
      frase: "Se envía la propuesta el lunes.",
      cita: "te la mando el lunes",
      citaFuente: "transcripcion",
      huella: "propuesta lunes",
      fechaDeLaReunion: AYER,
    },
  });
  await reunion("cancelada-con-tareas", { canceladaEn: CANCELADA });
  await prisma.tarea.create({
    data: {
      titulo: "Enviar la propuesta",
      huella: "enviar propuesta",
      estado: "pendiente",
      equipo: "cs",
      responsableEmail: "eli@smarteamcr.com",
      origen: "mano",
      creadaPorEmail: "eli@smarteamcr.com",
      sessionId: "cancelada-con-tareas",
    },
  });
  return { cliente, proyecto };
}

const QUEDAN = [
  "cancelada-con-hechos",
  "cancelada-con-minuta",
  "cancelada-con-resumen",
  "cancelada-con-tareas",
  "cancelada-con-transcripcion",
  "vigente",
];

describe("U1: la reunión cancelada en las lecturas (DB real)", () => {
  it("getClientSessions: la cancelada sin texto no sale; la que tiene transcripción, resumen, minuta, hechos o tareas, sí", async () => {
    /* La edición que la pone en rojo: sacar NO_ES_CANCELADA_SIN_TEXTO del where de getClientSessions. */
    const { cliente } = await mundo();
    const ids = (await getClientSessions(cliente.id)).map((s) => s.id).sort();
    expect(ids).toEqual(QUEDAN);
  });

  it("getProjectMemberSessions: tampoco por un vínculo con el proyecto", async () => {
    const { proyecto } = await mundo();
    for (const sessionId of ["vigente", "cancelada-sin-texto", "cancelada-con-transcripcion"]) {
      await prisma.sessionProject.create({ data: { sessionId, projectId: proyecto.id } });
    }
    const r = await getProjectMemberSessions(proyecto.id);
    expect(r.sessions.map((s) => s.id).sort()).toEqual(["cancelada-con-transcripcion", "vigente"]);
    expect(r.dropped, "no es un vínculo cruzado: no se reporta como tal").toEqual([]);
  });

  it("el filtro en SQL del buscador dice lo mismo que el de Prisma", async () => {
    await mundo();
    const filas = await prisma.$queryRaw<{ id: string }[]>`
      SELECT s."id" FROM "FirefliesSession" s WHERE ${noEsCanceladaSinTextoSql("s")} ORDER BY s."id"`;
    expect(filas.map((f) => f.id)).toEqual(QUEDAN);
  });

  it("una reunión que nunca se canceló sale aunque no tenga nada", async () => {
    const { cliente } = await mundo();
    await prisma.firefliesSession.create({
      data: { id: "vigente-vacia", title: "Sin texto todavía", date: AYER, participants: [], resolvedClientId: cliente.id },
    });
    const ids = (await getClientSessions(cliente.id)).map((s) => s.id);
    expect(ids).toContain("vigente-vacia");
  });
});

describe("U1: la cola de Docs y la cancelada (DB real)", () => {
  it("SE_LEE_SI_CANCELADA_TIENE_SU_DOC: la vigente sí, la cancelada con su Doc adjunto sí, la cancelada sin Doc no", async () => {
    const cliente = await prisma.client.create({ data: { name: "Cola de Docs (test)" } });
    const base = { date: AYER, participants: [], resolvedClientId: cliente.id };
    await prisma.firefliesSession.create({ data: { id: "vigente-sin-doc", title: "a", ...base } });
    await prisma.firefliesSession.create({ data: { id: "cancelada-con-doc", title: "b", canceladaEn: CANCELADA, googleDocId: "doc1", ...base } });
    await prisma.firefliesSession.create({ data: { id: "cancelada-sin-doc", title: "c", canceladaEn: CANCELADA, ...base } });
    const filas = await prisma.firefliesSession.findMany({ where: SE_LEE_SI_CANCELADA_TIENE_SU_DOC, select: { id: true }, orderBy: { id: "asc" } });
    expect(filas.map((f) => f.id)).toEqual(["cancelada-con-doc", "vigente-sin-doc"]);
  });
});
