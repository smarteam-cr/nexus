import { describe, expect, it } from "vitest";
import {
  avisoDePlataforma,
  esDeMeet,
  plataformaDelEvento,
  puedeSerReunionFueraDeMeet,
  tieneInvitadoDeAfuera,
} from "./plataforma-del-evento";

const equipo = new Set(["smarteamcr.com"]);

describe("plataformaDelEvento", () => {
  it("Meet: la videollamada de Google manda aunque la descripción nombre Zoom", () => {
    const e = { conferenceData: { conferenceSolution: { key: { type: "hangoutsMeet" } } }, description: "antes era https://zoom.us/j/1" };
    expect(esDeMeet(e)).toBe(true);
    expect(plataformaDelEvento(e)).toBe("MEET");
  });

  it("Zoom por el complemento del calendario, por el lugar o por el enlace en la descripción", () => {
    expect(plataformaDelEvento({ conferenceData: { conferenceSolution: { key: { type: "addOn" }, name: "Zoom Meeting" } } })).toBe("ZOOM");
    expect(plataformaDelEvento({ location: "https://us02web.zoom.us/j/8123?pwd=x" })).toBe("ZOOM");
    expect(plataformaDelEvento({ description: "Únete a la reunión: https://hubspot.zoom.us/j/9988" })).toBe("ZOOM");
  });

  it("Teams por el enlace o por el complemento", () => {
    expect(plataformaDelEvento({ description: "Microsoft Teams https://teams.microsoft.com/l/meetup-join/19%3a" })).toBe("TEAMS");
    expect(plataformaDelEvento({ conferenceData: { conferenceSolution: { key: { type: "addOn" }, name: "Microsoft Teams Meeting" } } })).toBe("TEAMS");
  });

  it("la palabra «zoom» sola en la agenda no la vuelve de Zoom", () => {
    expect(plataformaDelEvento({ description: "Vamos a hacer zoom en el reporte", location: "Oficinas de Smarteam, San José" })).toBe("PRESENCIAL");
  });

  it("otro enlace: Webex, o un enlace en el lugar; un enlace suelto en la descripción no cuenta", () => {
    expect(plataformaDelEvento({ location: "https://empresa.webex.com/meet/ana" })).toBe("OTRA");
    expect(plataformaDelEvento({ conferenceData: { conferenceSolution: { key: { type: "addOn" }, name: "Webex" } } })).toBe("OTRA");
    expect(plataformaDelEvento({ description: "Agenda: https://docs.google.com/x", location: "Sala 3, Escazú" })).toBe("PRESENCIAL");
  });

  it("sin lugar ni enlace no se inventa que fue en persona", () => {
    expect(plataformaDelEvento({})).toBe("OTRA");
  });
});

describe("tieneInvitadoDeAfuera", () => {
  it("cuenta a alguien de otro dominio, también de HubSpot", () => {
    expect(tieneInvitadoDeAfuera([{ correo: "ana@smarteamcr.com" }, { correo: "nferrero@hubspot.com" }], equipo)).toBe(true);
  });
  it("solo el equipo: no", () => {
    expect(tieneInvitadoDeAfuera([{ correo: "ana@smarteamcr.com" }, { correo: "luis@SMARTEAMCR.com" }], equipo)).toBe(false);
    expect(tieneInvitadoDeAfuera([], equipo)).toBe(false);
  });
  it("un buzón automático no cuenta (el no-reply de un webinar de Zoom)", () => {
    expect(tieneInvitadoDeAfuera([{ correo: "ana@smarteamcr.com" }, { correo: "no-reply@zoom.us" }], equipo)).toBe(false);
    expect(tieneInvitadoDeAfuera([{ correo: "noreply@hubspot.com" }], equipo)).toBe(false);
  });
});

describe("puedeSerReunionFueraDeMeet", () => {
  it("con hora y de tipo normal", () => {
    expect(puedeSerReunionFueraDeMeet({ start: { dateTime: "2026-11-27T14:00:00-06:00" } })).toBe(true);
  });
  it("de todo el día, una ausencia o la ubicación de trabajo: no", () => {
    expect(puedeSerReunionFueraDeMeet({ start: {} })).toBe(false);
    expect(puedeSerReunionFueraDeMeet({ start: { dateTime: "2026-11-27T14:00:00Z" }, eventType: "outOfOffice" })).toBe(false);
    expect(puedeSerReunionFueraDeMeet({ start: { dateTime: "2026-11-27T14:00:00Z" }, eventType: "workingLocation" })).toBe(false);
  });
});

describe("avisoDePlataforma", () => {
  it("dice por dónde fue, salvo Meet", () => {
    expect(avisoDePlataforma("ZOOM")).toBe("Fue por Zoom");
    expect(avisoDePlataforma("TEAMS")).toBe("Fue por Teams");
    expect(avisoDePlataforma("PRESENCIAL")).toBe("Fue en persona");
    expect(avisoDePlataforma("OTRA")).toBe("Fue por otro enlace");
    expect(avisoDePlataforma("MEET")).toBeNull();
    expect(avisoDePlataforma(null)).toBeNull();
  });
});
