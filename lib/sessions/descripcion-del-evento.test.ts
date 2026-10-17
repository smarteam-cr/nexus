/**
 * lib/sessions/descripcion-del-evento.test.ts — la agenda de una reunión sale limpia de la invitación (ficha G), y la
 * sync de Meet la copia cuando Google la cambia.
 * Correr: `npx vitest run lib/sessions/descripcion-del-evento.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import { htmlATexto, limpiarDescripcionDelEvento, MAX_DESCRIPCION_DEL_EVENTO } from "./descripcion-del-evento";
import { cambiosDeSesion, fusionarCopia, type EventoMeet, type SesionGuardada } from "@/lib/google/meet-sync-cambios";

const BLOQUE_DE_MEET =
  "-::~:~::~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~::~:~::-\n" +
  "Únete con Google Meet: https://meet.google.com/abc-defg-hij\n" +
  "Únete por teléfono\n(US) +1 555-123-4567 PIN: 123456789#\n" +
  "Más información sobre Meet: https://support.google.com/a/users/answer/9282720\n\n" +
  "Please do not edit this section.\n" +
  "-::~:~::~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~::~:~::-";

describe("la descripción de la invitación como agenda", () => {
  it("saca el bloque de Google Meet y deja lo que escribió quien invitó", () => {
    const d = limpiarDescripcionDelEvento(`Agenda:<br><ul><li>Revisar el pipeline</li><li>Definir la integración con SAP</li></ul>\n${BLOQUE_DE_MEET}`);
    expect(d).toBe("Agenda:\n\n• Revisar el pipeline\n• Definir la integración con SAP");
    expect(d).not.toMatch(/meet\.google|PIN|Únete/);
  });

  it("una descripción que solo era el bloque de la videollamada es null", () => {
    expect(limpiarDescripcionDelEvento(BLOQUE_DE_MEET)).toBeNull();
    expect(limpiarDescripcionDelEvento("Join with Google Meet: https://meet.google.com/xyz-abcd-efg")).toBeNull();
    expect(limpiarDescripcionDelEvento("   ")).toBeNull();
    expect(limpiarDescripcionDelEvento(null)).toBeNull();
  });

  it("pasa el HTML a texto: saltos, entidades y enlaces con su dirección", () => {
    expect(htmlATexto('Ver <a href="https://docs.google.com/x">el documento</a> &amp; más&nbsp;cosas')).toBe("Ver el documento (https://docs.google.com/x) & más cosas");
  });

  it("corta una invitación larga", () => {
    const d = limpiarDescripcionDelEvento("a".repeat(MAX_DESCRIPCION_DEL_EVENTO + 500));
    expect(d?.length).toBe(MAX_DESCRIPCION_DEL_EVENTO);
    expect(d?.endsWith("…")).toBe(true);
  });
});

describe("la sync de Meet copia la agenda", () => {
  const FECHA = new Date("2026-10-15T15:00:00Z");
  const evento = (extra: Partial<EventoMeet> = {}): EventoMeet => ({
    eventId: "ev1",
    title: "Seguimiento ACME",
    date: FECHA,
    durationMinutes: 60,
    participants: ["ana@acme.com"],
    organizerEmail: "eli@smarteamcr.com",
    ...extra,
  });
  const guardada = (extra: Partial<SesionGuardada> = {}): SesionGuardada => ({
    id: "gmeet_ev1",
    title: "Seguimiento ACME",
    date: FECHA,
    duration: 60,
    participants: ["ana@acme.com", "eli@smarteamcr.com"],
    googleEventId: "ev1",
    googleDocId: null,
    organizerEmail: "eli@smarteamcr.com",
    source: "google_meet",
    manualClientId: null,
    resolvedClientId: "cli_acme",
    descripcionDelEvento: null,
    ...extra,
  });
  const part = ["ana@acme.com", "eli@smarteamcr.com"];

  it("una descripción nueva o cambiada se escribe; la misma no dispara un UPDATE", () => {
    expect(cambiosDeSesion(guardada(), evento({ descripcion: "Revisar el pipeline" }), part, "cli_acme").cambios).toEqual({ descripcionDelEvento: "Revisar el pipeline" });
    expect(cambiosDeSesion(guardada({ descripcionDelEvento: "Revisar el pipeline" }), evento({ descripcion: "Revisar el pipeline" }), part, "cli_acme").cambios).toBeNull();
  });

  it("si Google la borra, se borra; un evento sin el dato (undefined) no la toca", () => {
    expect(cambiosDeSesion(guardada({ descripcionDelEvento: "Vieja" }), evento({ descripcion: null }), part, "cli_acme").cambios).toEqual({ descripcionDelEvento: null });
    expect(cambiosDeSesion(guardada({ descripcionDelEvento: "Vieja" }), evento(), part, "cli_acme").cambios).toBeNull();
  });

  it("dos copias del mismo evento: la primera que trae la descripción", () => {
    const junta = fusionarCopia(evento({ descripcion: null }), evento({ descripcion: "Agenda" }));
    expect(junta.descripcion).toBe("Agenda");
  });
});
