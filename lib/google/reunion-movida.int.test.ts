/**
 * lib/google/reunion-movida.int.test.ts — contra una base REAL: la fila leída sin nada que reprograman al futuro vuelve
 * a «no leída»; con texto, resumen, minuta, hechos, tareas o frases no se toca. Correr con la base local: `npm run test:int`.
 */
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { devolverANoLeidaSiSeMovio } from "./reunion-movida";

const HORA = 3_600_000;

describe("reunión reprogramada al futuro después de leerse", () => {
  it("vuelve a «no leída» solo la que no tiene nada leído", async () => {
    const ahora = new Date();
    const leida = new Date(+ahora - 30 * HORA);
    const futura = new Date(+ahora + 20 * HORA);
    const base = {
      participants: [] as string[],
      source: "google_meet",
      date: futura,
      enrichedAt: leida,
      enrichError: '{"diagnostico":{"motivo":"drive_sin_archivo_de_la_reunion"}}',
      motivoSinTexto: "no_se_grabo",
      motivoSinTextoAt: leida,
      estadoDeConferencia: "NO_OCURRIO" as const,
      conferenciaCerradaEn: leida,
    };
    const cliente = await prisma.client.create({ data: { name: "ACME movida" } });
    await prisma.firefliesSession.createMany({
      data: [
        { ...base, id: "mov-vacia", title: "Vacía" },
        { ...base, id: "mov-texto", title: "Con texto", transcript: "Ana: hola" },
        { ...base, id: "mov-resumen", title: "Con resumen", summary: { resumen: "x" } },
        { ...base, id: "mov-minuta", title: "Con minuta" },
        { ...base, id: "mov-hechos", title: "Con hechos" },
        { ...base, id: "mov-tareas", title: "Con tareas" },
        { ...base, id: "mov-frases", title: "Con frases" },
        { ...base, id: "mov-pasada", title: "La fecha ya pasó", date: new Date(+ahora - HORA) },
        { ...base, id: "mov-reintentos", title: "Esperaba material", enrichedAt: null, enrichAttempts: 3, enrichError: "sin material" },
        { ...base, id: "mov-sin-intentar", title: "Nunca se intentó", enrichedAt: null, enrichError: null },
      ],
    });
    await prisma.sessionMinute.create({ data: { sessionId: "mov-minuta", summary: "Minuta" } });
    await prisma.hechoDeReunion.create({
      data: { sessionId: "mov-hechos", clientId: cliente.id, tipo: "acuerdo", frase: "Mandan la propuesta", cita: "les mandamos la propuesta el lunes", citaFuente: "transcripcion", huella: "h1", fechaDeLaReunion: leida },
    });
    await prisma.tarea.create({ data: { sessionId: "mov-tareas", titulo: "Mandar la propuesta", huella: "t1", origen: "mano", equipo: "cs" } });
    await prisma.participanteDeReunion.create({ data: { sessionId: "mov-vacia", correo: "ana@acme.com", entro: leida, salio: leida, minutos: 12, idEnMeet: "users/1" } });
    await prisma.fraseDeReunion.create({ data: { sessionId: "mov-frases", orden: 0, hablante: "Ana", inicio: leida, texto: "hola" } });

    const resultado: Record<string, boolean> = {};
    for (const id of ["mov-vacia", "mov-texto", "mov-resumen", "mov-minuta", "mov-hechos", "mov-tareas", "mov-frases", "mov-pasada", "mov-reintentos", "mov-sin-intentar"]) {
      // Lo que ve la sync: la fila guardada con su `enrichedAt`, y la fecha nueva entre los cambios.
      const fila = await prisma.firefliesSession.findUniqueOrThrow({ where: { id }, select: { id: true, enrichedAt: true, enrichAttempts: true, date: true } });
      resultado[id] = await devolverANoLeidaSiSeMovio(prisma, fila, { date: fila.date }, ahora);
    }
    expect(resultado).toEqual({
      "mov-vacia": true,
      "mov-texto": false,
      "mov-resumen": false,
      "mov-minuta": false,
      "mov-hechos": false,
      "mov-tareas": false,
      "mov-frases": false,
      "mov-pasada": false,
      "mov-reintentos": true,
      "mov-sin-intentar": false,
    });

    const vacia = await prisma.firefliesSession.findUniqueOrThrow({ where: { id: "mov-vacia" } });
    expect(vacia).toMatchObject({ enrichedAt: null, enrichAttempts: 0, enrichError: null, estadoDeConferencia: null, conferenciaCerradaEn: null, motivoSinTexto: null });
    const ana = await prisma.participanteDeReunion.findFirstOrThrow({ where: { sessionId: "mov-vacia" } });
    expect(ana, "la asistencia de la fecha vieja no es de la reunión nueva").toMatchObject({ entro: null, salio: null, minutos: null, idEnMeet: null });
    expect(await prisma.firefliesSession.findUniqueOrThrow({ where: { id: "mov-reintentos" } })).toMatchObject({ enrichAttempts: 0, enrichError: null });
    const conTexto = await prisma.firefliesSession.findUniqueOrThrow({ where: { id: "mov-texto" } });
    expect(conTexto.enrichedAt).toEqual(leida);
  });
});
