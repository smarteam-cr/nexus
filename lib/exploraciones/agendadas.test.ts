/**
 * lib/exploraciones/agendadas.test.ts — «Agendadas · próximas 6 semanas» del selector de «Agregar sesión»
 * (etapa A, 2026-10-09): qué reuniones del calendario son agendadas con la empresa.
 * Correr: `npx vitest run lib/exploraciones/agendadas.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import { agendaDeHubspotSinRepetir, candidatosACompartidos, filtrarAgendadas, genteDeLaEmpresa, invitadosDelEvento, isoDelEvento, juntarAgendadas, tieneALaEmpresa, type EventoDelCalendario } from "./agendadas";

const AHORA = new Date("2026-10-09T18:00:00Z");
const conMeet = { conferenceSolution: { key: { type: "hangoutsMeet" } } };

function evento(e: Partial<EventoDelCalendario> & { id: string }): EventoDelCalendario {
  return {
    status: "confirmed",
    summary: "Revisión con Acme",
    start: { dateTime: "2026-10-15T09:00:00-06:00" },
    end: { dateTime: "2026-10-15T10:00:00-06:00" },
    conferenceData: conMeet,
    attendees: [{ email: "ana@acme.com" }, { email: "eli@smarteamcr.com", self: true, responseStatus: "accepted" }],
    organizer: { email: "eli@smarteamcr.com" },
    ...e,
  };
}

const O = { calendario: "eli@smarteamcr.com", dominios: ["acme.com"], correos: [], internos: new Set(["smarteamcr.com"]), ahora: AHORA };

describe("qué es una agendada con la empresa", () => {
  it("con Meet y con alguien de la empresa: entra, con su hora en UTC y los invitados contados", () => {
    const [a] = filtrarAgendadas([evento({ id: "e1" })], O);
    expect(a).toMatchObject({ id: "e1", titulo: "Revisión con Acme", inicio: "2026-10-15T15:00:00.000Z", fin: "2026-10-15T16:00:00.000Z", calendario: "eli@smarteamcr.com", serie: false, internos: 1, externos: 1 });
  });

  it("deja fuera lo cancelado, lo rechazado, lo que no es Meet, el bloque de una tarea y lo que no tiene a nadie de la empresa", () => {
    const items = [
      evento({ id: "cancelada", status: "cancelled" }),
      evento({ id: "rechazada", attendees: [{ email: "ana@acme.com" }, { email: "eli@smarteamcr.com", self: true, responseStatus: "declined" }] }),
      evento({ id: "sinMeet", conferenceData: null }),
      evento({ id: "zoom", conferenceData: { conferenceSolution: { key: { type: "addOn" } } } }),
      evento({ id: "tarea", summary: "Tarea · Preparar la demo", attendees: [{ email: "eli@smarteamcr.com", self: true }], extendedProperties: { private: { nexusTareaId: "t1" } } }),
      evento({ id: "otraEmpresa", attendees: [{ email: "bob@otra.com" }, { email: "eli@smarteamcr.com", self: true }] }),
      evento({ id: "yaTermino", start: { dateTime: "2026-10-09T08:00:00-06:00" }, end: { dateTime: "2026-10-09T09:00:00-06:00" } }),
      evento({ id: "buena" }),
    ];
    expect(filtrarAgendadas(items, O).map((a) => a.id)).toEqual(["buena"]);
  });

  it("también la reconoce por un correo de su gente aunque el dominio no esté registrado (un gmail que ya estuvo en sus reuniones)", () => {
    const e = evento({ id: "e2", attendees: [{ email: "Juan@Gmail.com" }, { email: "eli@smarteamcr.com", self: true }] });
    expect(filtrarAgendadas([e], { ...O, dominios: [], correos: ["juan@gmail.com"] }).map((a) => a.id)).toEqual(["e2"]);
  });

  it("marca las series: se usa solo esa fecha", () => {
    const [a, b] = filtrarAgendadas([evento({ id: "s1_20261015T150000Z" }), evento({ id: "s2", recurringEventId: "s2base", start: { dateTime: "2026-10-16T09:00:00-06:00" }, end: { dateTime: "2026-10-16T10:00:00-06:00" } })], O);
    expect([a.serie, b.serie]).toEqual([true, true]);
  });

  it("las salas y los calendarios no cuentan como gente de afuera", () => {
    const e = evento({ id: "e3", attendees: [{ email: "ana@acme.com" }, { email: "sala@resource.calendar.google.com", resource: true }, { email: "eli@smarteamcr.com", self: true }] });
    expect(filtrarAgendadas([e], O)[0]).toMatchObject({ internos: 1, externos: 1 });
  });

  it("un evento de todo el día empieza a las 00:00 de Costa Rica", () => {
    expect(isoDelEvento({ date: "2026-10-15" })).toBe("2026-10-15T06:00:00.000Z");
    expect(isoDelEvento({})).toBeNull();
  });
});

describe("juntar calendarios y la agenda de HubSpot", () => {
  it("el mismo evento en dos calendarios cuenta una vez (gana el primero)", () => {
    const deEli = filtrarAgendadas([evento({ id: "e1" })], O);
    const deAna = filtrarAgendadas([evento({ id: "e1" }), evento({ id: "e9", start: { dateTime: "2026-10-12T09:00:00-06:00" }, end: { dateTime: "2026-10-12T10:00:00-06:00" } })], { ...O, calendario: "ana@smarteamcr.com" });
    expect(juntarAgendadas([deEli, deAna]).map((a) => [a.id, a.calendario])).toEqual([
      ["e9", "ana@smarteamcr.com"],
      ["e1", "eli@smarteamcr.com"],
    ]);
  });

  it("la de HubSpot que ya está en el calendario (empieza a menos de dos horas) no se repite; la que ya pasó no va", () => {
    const google = [{ inicio: "2026-10-15T15:00:00.000Z" }];
    const agenda = [
      { id: "h1", titulo: "La misma", inicio: "2026-10-15T15:30:00.000Z" },
      { id: "h2", titulo: "Otra", inicio: "2026-10-20T15:00:00.000Z" },
      { id: "h3", titulo: "Pasada", inicio: "2026-10-01T15:00:00.000Z" },
    ];
    expect(agendaDeHubspotSinRepetir(agenda, google, AHORA).map((a) => a.id)).toEqual(["h2"]);
  });
});

describe("cómo se reconoce a la empresa", () => {
  it("sus dominios registrados y los de afuera de sus reuniones; un gmail cuenta como correo, no como dominio", () => {
    const g = genteDeLaEmpresa(["Acme.com"], ["ana@acme.com", "eli@smarteamcr.com", "juan@gmail.com", "x@resource.calendar.google.com", "luis@acme-sv.com"], {
      internos: new Set(["smarteamcr.com"]),
    });
    expect(g.dominios.sort()).toEqual(["acme-sv.com", "acme.com"]);
    expect(g.correos.sort()).toEqual(["ana@acme.com", "juan@gmail.com", "luis@acme-sv.com"]);
  });

  it("⛔ invariante 1: la gente que también está en reuniones de otros clientes no reconoce a la empresa", () => {
    /* En una reunión de Acme estuvo alguien de HubSpot: sin el filtro, «Agendadas» listaba las reuniones de
       otros clientes con gente de HubSpot (título y hora). Los registrados se quedan siempre. */
    const participantes = ["ana@acme.com", "carlos@hubspot.com", "juan@gmail.com", "pedro@gmail.com", "eli@smarteamcr.com"];
    const internos = new Set(["smarteamcr.com"]);
    expect(candidatosACompartidos(["acme.com"], participantes, { internos })).toEqual({ dominios: ["hubspot.com"], correos: ["carlos@hubspot.com", "juan@gmail.com", "pedro@gmail.com"] });
    const g = genteDeLaEmpresa(["acme.com"], participantes, {
      internos,
      compartidos: { dominios: new Set(["hubspot.com", "gmail.com"]), correos: new Set(["carlos@hubspot.com", "pedro@gmail.com"]) },
    });
    expect(g.dominios.sort()).toEqual(["acme.com"]);
    // Un gmail se mira por el correo exacto: que otro cliente tenga gente con gmail no lo saca.
    expect(g.correos.sort()).toEqual(["ana@acme.com", "juan@gmail.com"]);
    const deOtroCliente = evento({ id: "otro", attendees: [{ email: "maria@hubspot.com" }, { email: "eli@smarteamcr.com", self: true }] });
    expect(filtrarAgendadas([deOtroCliente], { ...O, ...g })).toEqual([]);
  });

  it("para unir una sesión, el evento tiene que tener a alguien de la empresa invitado", () => {
    expect(invitadosDelEvento(evento({ id: "e1" })).sort()).toEqual(["ana@acme.com", "eli@smarteamcr.com"]);
    expect(tieneALaEmpresa(["ana@acme.com"], { dominios: ["acme.com"], correos: [] })).toBe(true);
    expect(tieneALaEmpresa(["eli@smarteamcr.com", "bob@otra.com"], { dominios: ["acme.com"], correos: ["juan@gmail.com"] })).toBe(false);
    expect(tieneALaEmpresa(["Juan@Gmail.com"], { dominios: [], correos: ["juan@gmail.com"] })).toBe(true);
  });
});
