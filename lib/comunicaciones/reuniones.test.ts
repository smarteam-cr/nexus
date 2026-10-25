/**
 * lib/comunicaciones/reuniones.test.ts — ¿una reunión o una llamada de HubSpot ya llega por Meet? (U7).
 */
import { describe, expect, it } from "vitest";
import { codigoDeMeetDe, cruceConMeet, eventoDeGoogleDe, indexarReunionesDeMeet, reunionDeMeetQueLaCubre, yaLlegaPorMeet, type ReunionDeMeet } from "./reuniones";

/** El `eid` de Google Calendar: base64 url-safe sin relleno de «idDelEvento correo». */
const eid = (evento: string, correo = "cse@smarteamcr.com") => Buffer.from(`${evento} ${correo}`).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const url = (evento: string) => `https://www.google.com/calendar/event?eid=${eid(evento)}`;

const H = Date.parse("2026-10-20T15:00:00Z");
const meet = (o: Partial<ReunionDeMeet>): ReunionDeMeet => ({ id: "s", googleEventId: null, conferenceId: null, inicio: H, clientId: "c1", conTexto: true, ...o });

describe("las claves de una reunión de HubSpot", () => {
  it("saca el id del evento del enlace de Google Calendar (también el de una instancia de una recurrente)", () => {
    expect(eventoDeGoogleDe(url("q6s3p0jrb1ftdr92ssl65mc0tl_20260707T150000Z"))).toBe("q6s3p0jrb1ftdr92ssl65mc0tl_20260707T150000Z");
    expect(eventoDeGoogleDe(url("248ukdqa178b991he622tv3b76"))).toBe("248ukdqa178b991he622tv3b76");
  });
  it("un enlace que no es de Google Calendar, o roto, no da evento", () => {
    expect(eventoDeGoogleDe("https://hubspot.zoom.us/j/93397539006")).toBeNull();
    expect(eventoDeGoogleDe("https://www.google.com/calendar/event?eid=%%%")).toBeNull();
    expect(eventoDeGoogleDe(null)).toBeNull();
  });
  it("saca el código de Meet del primer texto que lo trae, en minúsculas", () => {
    expect(codigoDeMeetDe(null, "Sala: https://meet.google.com/ISH-xycj-neb?authuser=0")).toBe("ish-xycj-neb");
    expect(codigoDeMeetDe("https://teams.microsoft.com/meet/22325")).toBeNull();
  });
});

describe("yaLlegaPorMeet", () => {
  const indice = indexarReunionesDeMeet([
    meet({ id: "a", googleEventId: "ev1" }),
    meet({ id: "b", conferenceId: "abc-defg-hij", inicio: H + 7 * 86_400_000 }),
    meet({ id: "c", inicio: H + 2 * 86_400_000, conTexto: false }),
  ]);

  it("por el evento de Google Calendar: se descarta si la de Meet tiene texto", () => {
    expect(yaLlegaPorMeet({ googleEventId: "ev1", codigoDeMeet: null, inicio: H }, null, indice)).toBe(true);
  });
  it("por el código de Meet, solo la del mismo día (una recurrente reusa el código)", () => {
    expect(yaLlegaPorMeet({ googleEventId: null, codigoDeMeet: "abc-defg-hij", inicio: H + 7 * 86_400_000 + 3_600_000 }, null, indice)).toBe(true);
    expect(yaLlegaPorMeet({ googleEventId: null, codigoDeMeet: "abc-defg-hij", inicio: H }, null, indice)).toBe(false);
  });
  it("sin claves, por la misma cuenta y la misma hora (±10 min); de otra cuenta, no", () => {
    expect(yaLlegaPorMeet({ googleEventId: null, codigoDeMeet: null, inicio: H + 5 * 60_000 }, "c1", indice)).toBe(true);
    expect(yaLlegaPorMeet({ googleEventId: null, codigoDeMeet: null, inicio: H + 5 * 60_000 }, "c2", indice)).toBe(false);
    expect(yaLlegaPorMeet({ googleEventId: null, codigoDeMeet: null, inicio: H + 25 * 60_000 }, "c1", indice)).toBe(false);
  });
  it("⭐ la de Meet SIN texto no tapa a la de HubSpot: el resumen de HubSpot es lo único que hay", () => {
    expect(reunionDeMeetQueLaCubre({ googleEventId: null, codigoDeMeet: null, inicio: H + 2 * 86_400_000 }, "c1", indice)?.id).toBe("c");
    expect(yaLlegaPorMeet({ googleEventId: null, codigoDeMeet: null, inicio: H + 2 * 86_400_000 }, "c1", indice)).toBe(false);
  });
  it("⛔ invariante 1: si la de Meet que la cubre es de OTRO cliente, no se guarda, tenga texto o no", () => {
    const otro = indexarReunionesDeMeet([meet({ id: "x", googleEventId: "evB", clientId: "cB", conTexto: false })]);
    expect(cruceConMeet({ googleEventId: "evB", codigoDeMeet: null, inicio: H }, "cA", otro)).toBe("de_otro_cliente");
    expect(cruceConMeet({ googleEventId: "evB", codigoDeMeet: null, inicio: H }, "cB", otro)).toBe("se_guarda");
    const sinDueno = indexarReunionesDeMeet([meet({ id: "y", googleEventId: "evC", clientId: null, conTexto: true })]);
    expect(cruceConMeet({ googleEventId: "evC", codigoDeMeet: null, inicio: H }, "cA", sinDueno), "la de Meet sin dueño no tapa").toBe("se_guarda");
  });
  it("la sala fija de Meet: el mismo código a otra hora del día no es la misma reunión", () => {
    const sala = indexarReunionesDeMeet([meet({ id: "z", conferenceId: "abc-defg-hij", inicio: H + 5 * 3_600_000, clientId: "cB" })]);
    expect(cruceConMeet({ googleEventId: null, codigoDeMeet: "abc-defg-hij", inicio: H }, "cA", sala)).toBe("se_guarda");
  });
  it("una de Zoom o de Teams (sin evento de Meet que la cubra) se guarda siempre", () => {
    expect(yaLlegaPorMeet({ googleEventId: "ev-zoom", codigoDeMeet: null, inicio: H + 30 * 86_400_000 }, "c1", indice)).toBe(false);
  });
});
