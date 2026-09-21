import { describe, it, expect } from "vitest";
import {
  cambiosDeSesion,
  diasHaciaAtras,
  DIAS_POR_DEFECTO,
  enLotes,
  eventIdDeFila,
  fusionarCopia,
  idDeSesion,
  mismosParticipantes,
  participantesConOrganizador,
  type EventoMeet,
  type SesionGuardada,
} from "./meet-sync-cambios";

/**
 * lib/google/meet-sync-cambios.test.ts — la sync de Meet escribe SOLO lo que cambió.
 *
 * Incidente 2026-09-21: 15.011 UPDATE incondicionales por corrida (una por reunión y por calendario
 * interno), cada uno devolviendo la fila entera con transcripción. Estas pruebas fijan las dos
 * reglas que lo evitan —una reunión una vez por corrida, y ningún UPDATE si nada cambió— y la
 * tercera, que no se negocia: nunca perder un dato real.
 */

const FECHA = new Date("2026-09-15T15:00:00Z");

function evento(extra: Partial<EventoMeet> = {}): EventoMeet {
  return {
    eventId: "ev1",
    title: "Kickoff | ACME & Smarteam",
    date: FECHA,
    durationMinutes: 60,
    participants: ["ana@acme.com", "eli@smarteamcr.com"],
    googleDocId: undefined,
    organizerEmail: "eli@smarteamcr.com",
    ...extra,
  };
}

/** La fila tal como la dejó la corrida anterior para `evento()`. */
function guardada(extra: Partial<SesionGuardada> = {}): SesionGuardada {
  return {
    id: "gmeet_ev1",
    title: "Kickoff | ACME & Smarteam",
    date: FECHA,
    duration: 60,
    participants: ["ana@acme.com", "eli@smarteamcr.com"],
    googleEventId: "ev1",
    googleDocId: null,
    organizerEmail: "eli@smarteamcr.com",
    source: "google_meet",
    manualClientId: null,
    resolvedClientId: "cli_acme",
    ...extra,
  };
}

function cambios(g: SesionGuardada, e: EventoMeet, cliente: string | null = "cli_acme") {
  return cambiosDeSesion(g, e, participantesConOrganizador(e), cliente);
}

describe("cambiosDeSesion — LA guarda: si nada cambió, no hay UPDATE", () => {
  it("la reunión igual a lo guardado no produce cambios", () => {
    /* La edición que la pone en rojo: volver a escribir todos los campos siempre (el UPDATE
       incondicional que hacía 15.011 escrituras por corrida). */
    expect(cambios(guardada(), evento())).toEqual({ cambios: null, docNuevo: false });
  });

  it("los mismos asistentes en otro orden no son un cambio", () => {
    const e = evento({ participants: ["eli@smarteamcr.com", "ana@acme.com"] });
    expect(cambios(guardada(), e).cambios).toBeNull();
  });

  it("escribe SOLO el campo que cambió", () => {
    expect(cambios(guardada(), evento({ title: "Kickoff reprogramado" })).cambios).toEqual({ title: "Kickoff reprogramado" });
    const otraFecha = new Date("2026-09-16T15:00:00Z");
    expect(cambios(guardada(), evento({ date: otraFecha })).cambios).toEqual({ date: otraFecha });
    expect(cambios(guardada(), evento({ durationMinutes: 90 })).cambios).toEqual({ duration: 90 });
  });

  it("un asistente nuevo (o uno que se fue) se escribe con la lista completa", () => {
    const e = evento({ participants: ["ana@acme.com", "eli@smarteamcr.com", "luis@acme.com"] });
    expect(cambios(guardada(), e).cambios).toEqual({
      participants: ["ana@acme.com", "eli@smarteamcr.com", "luis@acme.com"],
    });
    const sinAna = evento({ participants: ["eli@smarteamcr.com"] });
    expect(cambios(guardada(), sinAna).cambios).toEqual({ participants: ["eli@smarteamcr.com"] });
  });

  it("el cliente resuelto se re-escribe si la sync resuelve otro (como siempre)", () => {
    expect(cambios(guardada(), evento(), "cli_otro").cambios).toEqual({ resolvedClientId: "cli_otro" });
    expect(cambios(guardada(), evento(), null).cambios).toEqual({ resolvedClientId: null });
  });

  it("sana las filas previas al refactor: googleEventId y source", () => {
    const vieja = guardada({ googleEventId: null, source: "fireflies" });
    expect(cambios(vieja, evento()).cambios).toEqual({ googleEventId: "ev1", source: "google_meet" });
  });

  it("el organizador que cambia se escribe", () => {
    const e = evento({ organizerEmail: "otra@smarteamcr.com", participants: ["ana@acme.com", "eli@smarteamcr.com"] });
    const r = cambios(guardada(), e).cambios;
    expect(r?.organizerEmail).toBe("otra@smarteamcr.com");
    // Y como el organizador entra a los asistentes guardados, la lista también cambia.
    expect(r?.participants).toEqual(["ana@acme.com", "eli@smarteamcr.com", "otra@smarteamcr.com"]);
  });
});

describe("cambiosDeSesion — el Doc de la reunión", () => {
  it("un Doc que aparece después se escribe y reinicia el enriquecimiento COMPLETO", () => {
    /* La edición que la pone en rojo: reiniciar solo `enrichedAt` (auditoría 2026-08-08: una fila
       sellada por tope quedaba en limbo). */
    expect(cambios(guardada(), evento({ googleDocId: "doc1" }))).toEqual({
      cambios: { googleDocId: "doc1", enrichedAt: null, enrichAttempts: 0, enrichError: null },
      docNuevo: true,
    });
  });

  it("un Doc distinto al guardado también", () => {
    const r = cambios(guardada({ googleDocId: "doc1" }), evento({ googleDocId: "doc2" }));
    expect(r.docNuevo).toBe(true);
    expect(r.cambios?.googleDocId).toBe("doc2");
  });

  it("el mismo Doc no es un cambio (no re-enriquece)", () => {
    expect(cambios(guardada({ googleDocId: "doc1" }), evento({ googleDocId: "doc1" }))).toEqual({ cambios: null, docNuevo: false });
  });

  it("⛔ si Google no trae Doc, el guardado NO se borra", () => {
    /* La edición que la pone en rojo: escribir el null de Google (lo que hacía el código viejo).
       Se perdía el enlace al Doc de una reunión ya enriquecida. */
    expect(cambios(guardada({ googleDocId: "doc1" }), evento({ googleDocId: undefined }))).toEqual({ cambios: null, docNuevo: false });
  });
});

describe("fusionarCopia — una reunión UNA vez por corrida", () => {
  it("dos copias iguales quedan en una sola, sin asistentes repetidos", () => {
    const unida = fusionarCopia(fusionarCopia(undefined, evento()), evento());
    expect(unida.participants).toEqual(["ana@acme.com", "eli@smarteamcr.com"]);
  });

  it("⛔ el Doc de cualquier copia sobrevive, venga primero o después", () => {
    /* La edición que la pone en rojo: que la última copia pise a la anterior. Con una copia con Doc
       y otra sin él, el Doc se perdía y la corrida siguiente lo «descubría» otra vez. */
    const conDoc = evento({ googleDocId: "doc1" });
    const sinDoc = evento();
    expect(fusionarCopia(fusionarCopia(undefined, conDoc), sinDoc).googleDocId).toBe("doc1");
    expect(fusionarCopia(fusionarCopia(undefined, sinDoc), conDoc).googleDocId).toBe("doc1");
  });

  it("los asistentes de todas las copias se unen", () => {
    const a = evento({ participants: ["ana@acme.com"] });
    const b = evento({ participants: ["luis@acme.com", "ana@acme.com"] });
    expect(fusionarCopia(fusionarCopia(undefined, a), b).participants).toEqual(["ana@acme.com", "luis@acme.com"]);
  });

  it("título, fecha y duración son los de la primera copia", () => {
    const primera = evento({ title: "A" });
    const segunda = evento({ title: "B", durationMinutes: 30 });
    const unida = fusionarCopia(fusionarCopia(undefined, primera), segunda);
    expect(unida.title).toBe("A");
    expect(unida.durationMinutes).toBe(60);
  });

  it("no muta la copia recibida", () => {
    const e = evento({ participants: ["ana@acme.com", "ana@acme.com"] });
    fusionarCopia(undefined, e);
    expect(e.participants).toEqual(["ana@acme.com", "ana@acme.com"]);
  });
});

describe("diasHaciaAtras — la ventana", () => {
  it("por defecto 30 días", () => {
    expect(DIAS_POR_DEFECTO).toBe(30);
    expect(diasHaciaAtras(undefined)).toBe(30);
    expect(diasHaciaAtras("")).toBe(30);
  });

  it("GOOGLE_MEET_DAYS_BACK manda si es un número positivo", () => {
    expect(diasHaciaAtras("365")).toBe(365);
    expect(diasHaciaAtras("7")).toBe(7);
  });

  it("un valor inválido no deja la sync sin ventana: vuelve al defecto", () => {
    expect(diasHaciaAtras("abc")).toBe(30);
    expect(diasHaciaAtras("0")).toBe(30);
    expect(diasHaciaAtras("-5")).toBe(30);
  });
});

describe("piezas chicas", () => {
  it("eventIdDeFila: el propio, o derivado del id gmeet_ en las filas viejas", () => {
    expect(eventIdDeFila({ id: "gmeet_ev1", googleEventId: "ev1" })).toBe("ev1");
    expect(eventIdDeFila({ id: "gmeet_ev2", googleEventId: null })).toBe("ev2");
    expect(eventIdDeFila({ id: "ff_123", googleEventId: null })).toBeNull();
    expect(idDeSesion("ev1")).toBe("gmeet_ev1");
  });

  it("participantesConOrganizador suma el organizador una sola vez", () => {
    expect(participantesConOrganizador(evento({ organizerEmail: "eli@smarteamcr.com" }))).toEqual(["ana@acme.com", "eli@smarteamcr.com"]);
    expect(participantesConOrganizador(evento({ organizerEmail: "otra@smarteamcr.com" }))).toEqual([
      "ana@acme.com",
      "eli@smarteamcr.com",
      "otra@smarteamcr.com",
    ]);
  });

  it("mismosParticipantes compara como conjunto", () => {
    expect(mismosParticipantes(["a", "b"], ["b", "a"])).toBe(true);
    expect(mismosParticipantes(["a", "b"], ["a"])).toBe(false);
    expect(mismosParticipantes(["a"], ["b"])).toBe(false);
    expect(mismosParticipantes([], [])).toBe(true);
  });

  it("enLotes parte sin perder ni repetir", () => {
    expect(enLotes([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(enLotes([], 3)).toEqual([]);
  });
});
