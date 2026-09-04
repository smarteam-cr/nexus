/**
 * lib/clients/meeting-dates.int.test.ts — la consulta `DISTINCT ON` contra una base REAL (C-11).
 *
 * `meeting-dates.test.ts` (unit) prueba la equivalencia sobre un fixture emulado; esto prueba lo
 * que el unit no puede: que Postgres, con `unnest` + `lower` + `DISTINCT ON` sobre filas de
 * verdad, devuelve EXACTAMENTE lo que devolvía el plegado en JS sobre las mismas filas.
 * Correr con la base local: `npm run test:int`.
 */
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { classifyTeamEmailsByArea } from "@/lib/sessions/areas";
import { computeLastMeetingDates, plegarUltimasFechas } from "./meeting-dates";

const DIA = 86_400_000;

describe("computeLastMeetingDates — DISTINCT ON contra la base (C-11)", () => {
  it("devuelve lo mismo que el plegado en JS sobre las mismas filas: la más reciente por rol, sin futuras, correos en cualquier caja", async () => {
    const cliente = await prisma.client.create({ data: { name: "Cliente Fechas (test)" } });
    const otro = await prisma.client.create({ data: { name: "Cliente Sin Ventas (test)" } });
    const team = [
      { email: "Vendedor@test.local", area: "Ventas" },
      { email: "cse@test.local", area: "CSE" },
    ];
    const { salesEmails, cseEmails } = classifyTeamEmailsByArea(team);
    expect(salesEmails.size, "el fixture del equipo no clasificó a Ventas").toBe(1);
    expect(cseEmails.size, "el fixture del equipo no clasificó a CSE").toBe(1);

    const base = Date.now();
    await prisma.firefliesSession.createMany({
      data: [
        { id: "mf-venta-vieja", title: "Venta vieja", date: new Date(base - 10 * DIA), participants: ["vendedor@test.local", "x@cliente.test"], resolvedClientId: cliente.id },
        { id: "mf-venta-reciente", title: "Venta reciente, en MAYÚSCULAS", date: new Date(base - 2 * DIA), participants: ["VENDEDOR@TEST.LOCAL"], resolvedClientId: cliente.id },
        { id: "mf-cse", title: "Seguimiento CSE", date: new Date(base - 5 * DIA), participants: ["cse@test.local"], resolvedClientId: cliente.id },
        { id: "mf-agendada", title: "Agendada (no cuenta)", date: new Date(base + 3 * DIA), participants: ["vendedor@test.local", "cse@test.local"], resolvedClientId: cliente.id },
        { id: "mf-otro-cse", title: "Solo CSE del otro cliente", date: new Date(base - 1 * DIA), participants: ["cse@test.local"], resolvedClientId: otro.id },
      ],
    });

    const porSql = await computeLastMeetingDates({ clientIds: [cliente.id, otro.id], teamMembers: team });

    const filas = await prisma.firefliesSession.findMany({
      where: { resolvedClientId: { in: [cliente.id, otro.id] }, date: { lte: new Date() } },
      orderBy: { date: "desc" },
      select: { resolvedClientId: true, date: true, participants: true },
    });
    const porJs = plegarUltimasFechas(filas, salesEmails, cseEmails);

    expect(porSql).toEqual(porJs);
    expect(porSql.get(cliente.id)?.sales?.getTime()).toBe(new Date(base - 2 * DIA).getTime());
    expect(porSql.get(cliente.id)?.cse?.getTime()).toBe(new Date(base - 5 * DIA).getTime());
    expect(porSql.get(otro.id)).toEqual({ cse: new Date(base - 1 * DIA) });
  });

  it("sin equipo clasificado no consulta nada, y sin clientes tampoco", async () => {
    expect(await computeLastMeetingDates({ clientIds: ["x"], teamMembers: [{ email: "nadie@test.local", area: "Otra" }] })).toEqual(new Map());
    expect(await computeLastMeetingDates({ clientIds: [], teamMembers: [{ email: "cse@test.local", area: "CSE" }] })).toEqual(new Map());
  });
});
