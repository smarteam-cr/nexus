/**
 * lib/google/conferencias.int.test.ts — lo de U3 contra una base REAL: INV53 (ninguna reunión de 3 a 25 días sin revisar
 * su conferencia) y T7 (quiénes del equipo estuvieron) leyendo las filas que deja la revisión. Correr con la base local:
 * `npm run test:int`.
 */
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { INV53 } from "@/lib/invariantes/google";
import { equipoEnLasReuniones } from "./equipo-en-la-reunion";

const DIA = 86_400_000;
const delEquipo = (c: string) => c.endsWith("@smarteam.test");

describe("U3 contra la base", () => {
  it("INV53: cuenta la de 10 días sin cerrar; no la cerrada, la de 1 día, la de 27 ni la que no tiene código", async () => {
    const ahora = new Date();
    const hace = (d: number) => new Date(+ahora - d * DIA);
    const base = { participants: [] as string[], source: "google_meet" };
    await prisma.firefliesSession.createMany({
      data: [
        { ...base, id: "inv53-abierta", title: "Abierta de 10 días", date: hace(10), conferenceId: "aaa-bbbb-ccc" },
        { ...base, id: "inv53-cerrada", title: "Cerrada", date: hace(10), conferenceId: "aaa-bbbb-ccc", conferenciaCerradaEn: hace(9), estadoDeConferencia: "OCURRIO" },
        { ...base, id: "inv53-reciente", title: "De ayer", date: hace(1), conferenceId: "ddd-eeee-fff" },
        { ...base, id: "inv53-vieja", title: "De 27 días", date: hace(27), conferenceId: "ggg-hhhh-iii" },
        { ...base, id: "inv53-sin-codigo", title: "Sin código", date: hace(10) },
      ],
    });
    expect((await INV53.correr(prisma, ahora)).ok, "sin el job en esta base no hay atraso del que avisar").toBe(true);

    await prisma.cronJobState.create({ data: { id: "google-meet-conferencias" } });
    const r = await INV53.correr(prisma, ahora);
    expect(r.ok).toBe(false);
    expect(r.lineas[0]).toContain("1 reunión(es)");
    expect(r.lineas.join("\n")).toContain("(inv53-abierta)");

    await prisma.firefliesSession.update({ where: { id: "inv53-abierta" }, data: { conferenciaCerradaEn: ahora, estadoDeConferencia: "NO_OCURRIO" } });
    expect((await INV53.correr(prisma, ahora)).ok).toBe(true);
  });

  it("T7: la organizadora y quien entró estuvieron; el invitado que no entró, no; los de fuera y los «meet:» no cuentan", async () => {
    await prisma.firefliesSession.create({
      data: {
        id: "t7-camosa",
        title: "Camosa l Exploración",
        date: new Date(Date.now() - 2 * DIA),
        participants: ["liz@smarteam.test", "andres@smarteam.test", "marco@smarteam.test", "jose@camosa.test"],
        organizerEmail: "liz@smarteam.test",
        estadoDeConferencia: "OCURRIO",
      },
    });
    const entro = new Date(Date.now() - 2 * DIA);
    await prisma.participanteDeReunion.createMany({
      data: [
        { sessionId: "t7-camosa", correo: "liz@smarteam.test", esDelEquipo: true, respuesta: "ACEPTO", entro, minutos: 72, nombre: "Liz" },
        { sessionId: "t7-camosa", correo: "andres@smarteam.test", esDelEquipo: true, respuesta: "ACEPTO", entro, minutos: 52 },
        { sessionId: "t7-camosa", correo: "marco@smarteam.test", esDelEquipo: true, respuesta: "SIN_RESPONDER" },
        { sessionId: "t7-camosa", correo: "jose@camosa.test", esDelEquipo: false, respuesta: "ACEPTO" },
        { sessionId: "t7-camosa", correo: "meet:users/111", esDelEquipo: false, entro, nombre: "José Ponce" },
      ],
    });
    const equipo = (await equipoEnLasReuniones(["t7-camosa"], delEquipo)).get("t7-camosa");
    expect(equipo).toEqual([
      { correo: "liz@smarteam.test", organizo: true, estuvo: true, respuesta: "ACEPTO" },
      { correo: "andres@smarteam.test", organizo: false, estuvo: true, respuesta: "ACEPTO" },
      { correo: "marco@smarteam.test", organizo: false, estuvo: false, respuesta: "SIN_RESPONDER" },
    ]);
  });
});
