import { describe, expect, it } from "vitest";
import { reunionesDelCalendario, type DatosParaElCalendario } from "./horas-del-calendario";
import type { EventoConEnlaces } from "@/lib/mi-dia/agenda";

const datos = (o: Partial<DatosParaElCalendario> = {}): DatosParaElCalendario => ({
  porCorreo: new Map([["ana@acme.com", ["c-acme"]]]),
  porDominio: new Map([
    ["acme.com", ["c-acme"]],
    ["beta.com", ["c-beta"]],
    ["agencia.com", ["c-acme", "c-beta"]],
  ]),
  internos: new Set(["smarteamcr.com"]),
  empresas: new Map([
    ["c-acme", { nombre: "Acme", tipo: "CLIENTE" as const }],
    ["c-beta", { nombre: "Beta", tipo: "CLIENTE" as const }],
  ]),
  eventosDeSesiones: new Set<string>(),
  manuales: [],
  ...o,
});

const evento = (o: Partial<EventoConEnlaces> & { id: string }): EventoConEnlaces => ({
  status: "confirmed",
  summary: "Revisión con Acme",
  start: { dateTime: "2026-10-06T15:00:00Z" },
  end: { dateTime: "2026-10-06T16:00:00Z" },
  attendees: [{ email: "lucia@smarteamcr.com", self: true, responseStatus: "accepted" }, { email: "ana@acme.com" }],
  organizer: { email: "lucia@smarteamcr.com" },
  ...o,
});

describe("reunionesDelCalendario: las reuniones con clientes que no están en Meet", () => {
  it("una reunión presencial con el cliente cuenta, con su empresa y la persona", () => {
    const r = reunionesDelCalendario([{ email: "lucia@smarteamcr.com", eventos: [evento({ id: "e1" })] }], datos());
    expect(r.reuniones).toHaveLength(1);
    expect(r.reuniones[0]).toMatchObject({ id: "cal:e1", duracionMin: 60, participantes: ["lucia@smarteamcr.com"], cliente: { id: "c-acme" } });
  });

  it("1 · un evento con Meet nunca entra: ya está por la sync", () => {
    const r = reunionesDelCalendario([{ email: "lucia@smarteamcr.com", eventos: [evento({ id: "e1", hangoutLink: "https://meet.google.com/x" })] }], datos());
    expect(r.reuniones).toHaveLength(0);
    expect(r.cuenta.conMeet).toBe(1);
  });

  it("2 · un evento que ya es una sesión no entra (también por la serie)", () => {
    const r = reunionesDelCalendario(
      [{ email: "lucia@smarteamcr.com", eventos: [evento({ id: "e1" }), evento({ id: "e2_20261006", recurringEventId: "serie" })] }],
      datos({ eventosDeSesiones: new Set(["e1", "serie"]) }),
    );
    expect(r.reuniones).toHaveLength(0);
    expect(r.cuenta.yaEnUnaSesion).toBe(2);
  });

  it("3 · una reunión agregada a mano del mismo cliente a ±30 minutos es la misma", () => {
    const manuales = [{ clienteId: "c-acme", inicio: "2026-10-06T15:20:00Z" }];
    expect(reunionesDelCalendario([{ email: "lucia@smarteamcr.com", eventos: [evento({ id: "e1" })] }], datos({ manuales })).reuniones).toHaveLength(0);
    const otroCliente = [{ clienteId: "c-beta", inicio: "2026-10-06T15:20:00Z" }];
    expect(reunionesDelCalendario([{ email: "lucia@smarteamcr.com", eventos: [evento({ id: "e1" })] }], datos({ manuales: otroCliente })).reuniones).toHaveLength(1);
  });

  it("4 · el bloque de una tarea de Nexus nunca es una reunión", () => {
    const bloque = evento({ id: "b1", summary: "Tarea · armar el reporte", extendedProperties: { private: { nexusTareaId: "t1" } } });
    const r = reunionesDelCalendario([{ email: "lucia@smarteamcr.com", eventos: [bloque] }], datos());
    expect(r.reuniones).toHaveLength(0);
    expect(r.cuenta.bloquesDeTareas).toBe(1);
  });

  it("5 · el mismo evento en dos calendarios es una reunión con dos personas", () => {
    const e = evento({ id: "e1", attendees: [{ email: "lucia@smarteamcr.com" }, { email: "pedro@smarteamcr.com" }, { email: "ana@acme.com" }] });
    const r = reunionesDelCalendario(
      [
        { email: "lucia@smarteamcr.com", eventos: [e] },
        { email: "pedro@smarteamcr.com", eventos: [e] },
      ],
      datos(),
    );
    expect(r.reuniones).toHaveLength(1);
    expect(r.reuniones[0].participantes.sort()).toEqual(["lucia@smarteamcr.com", "pedro@smarteamcr.com"]);
    expect(r.cuenta.leidos).toBe(1);
  });

  it("6 · un evento con invitados de dos empresas no es de nadie (invariante 1)", () => {
    const e = evento({ id: "e1", attendees: [{ email: "lucia@smarteamcr.com" }, { email: "ana@acme.com" }, { email: "luis@beta.com" }] });
    const r = reunionesDelCalendario([{ email: "lucia@smarteamcr.com", eventos: [e] }], datos());
    expect(r.reuniones).toHaveLength(0);
    expect(r.cuenta.sinUnaEmpresa).toBe(1);
  });

  it("6 · alguien de una agencia de varias empresas no decide si hay otro invitado de una sola", () => {
    const e = evento({ id: "e1", attendees: [{ email: "lucia@smarteamcr.com" }, { email: "ana@acme.com" }, { email: "x@agencia.com" }] });
    expect(reunionesDelCalendario([{ email: "lucia@smarteamcr.com", eventos: [e] }], datos()).reuniones[0]?.cliente?.id).toBe("c-acme");
  });

  it("6 · una empresa fuera de la cartera (un prospecto) no carga horas", () => {
    const e = evento({ id: "e1", attendees: [{ email: "lucia@smarteamcr.com" }, { email: "x@prospecto.com" }] });
    const r = reunionesDelCalendario([{ email: "lucia@smarteamcr.com", eventos: [e] }], datos({ porDominio: new Map([["prospecto.com", ["c-pro"]]]) }));
    expect(r.reuniones).toHaveLength(0);
  });

  it("7 · quien rechazó no cuenta; si todos los del equipo rechazaron, no hay reunión", () => {
    const rechazada = evento({ id: "e1", attendees: [{ email: "lucia@smarteamcr.com", self: true, responseStatus: "declined" }, { email: "ana@acme.com" }] });
    expect(reunionesDelCalendario([{ email: "lucia@smarteamcr.com", eventos: [rechazada] }], datos()).reuniones).toHaveLength(0);
    const conPedro = evento({ id: "e2", attendees: [{ email: "lucia@smarteamcr.com" }, { email: "pedro@smarteamcr.com" }, { email: "ana@acme.com" }] });
    const r = reunionesDelCalendario(
      [
        { email: "lucia@smarteamcr.com", eventos: [{ ...conPedro, attendees: [...conPedro.attendees!.map((a) => (a.email === "lucia@smarteamcr.com" ? { ...a, self: true, responseStatus: "declined" } : a))] }] },
        { email: "pedro@smarteamcr.com", eventos: [conPedro] },
      ],
      datos(),
    );
    expect(r.reuniones[0].participantes).toEqual(["pedro@smarteamcr.com"]);
  });

  it("los eventos de todo el día, cancelados o sin otra gente no son reuniones", () => {
    const r = reunionesDelCalendario(
      [
        {
          email: "lucia@smarteamcr.com",
          eventos: [
            evento({ id: "a", start: { date: "2026-10-06" }, end: { date: "2026-10-07" } }),
            evento({ id: "b", status: "cancelled" }),
            evento({ id: "c", attendees: [{ email: "lucia@smarteamcr.com", self: true }] }),
          ],
        },
      ],
      datos(),
    );
    expect(r.reuniones).toHaveLength(0);
    expect(r.cuenta.leidos).toBe(0);
  });
});
