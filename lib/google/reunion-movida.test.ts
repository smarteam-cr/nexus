/**
 * lib/google/reunion-movida.test.ts — una reunión leída sin nada y reprogramada al futuro vuelve sola a «no leída».
 * Visto el 2026-10-26 (INV16 a, tres reuniones): se leían en la fecha vieja, sin material, y al moverlas quedaban
 * «leídas» para siempre. Lo que cuenta en la base (que no tenga nada leído) lo prueba reunion-movida.int.test.ts.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { cambiosDeSesion, type EventoMeet, type SesionGuardada } from "./meet-sync-cambios";
import { DATOS_DE_NO_LEIDA, SIN_NADA_LEIDO, seMovioAlFuturoYaLeida } from "./reunion-movida";

const AHORA = new Date("2026-10-26T18:00:00Z");
const VIEJA = new Date("2026-10-23T18:00:00Z");
const NUEVA = new Date("2026-10-27T12:00:00Z");

const guardada = (extra: Partial<SesionGuardada> = {}): SesionGuardada => ({
  id: "gmeet_ev1",
  title: "Habilitación de ventas consultivas 6",
  date: VIEJA,
  duration: 90,
  participants: ["ana@acme.com", "eli@smarteamcr.com"],
  googleEventId: "ev1",
  googleDocId: null,
  organizerEmail: "eli@smarteamcr.com",
  source: "google_meet",
  manualClientId: null,
  resolvedClientId: "cli_acme",
  descripcionDelEvento: null,
  conferenceId: "quw-yuxk-gnb",
  canceladaEn: null,
  enrichedAt: new Date("2026-10-25T00:32:00Z"),
  enrichAttempts: 0,
  ...extra,
});
const evento = (extra: Partial<EventoMeet> = {}): EventoMeet => ({
  eventId: "ev1",
  title: "Habilitación de ventas consultivas 6",
  date: NUEVA,
  durationMinutes: 90,
  participants: ["ana@acme.com"],
  organizerEmail: "eli@smarteamcr.com",
  conferenceId: "quw-yuxk-gnb",
  ...extra,
});
const decide = (g: SesionGuardada, e: EventoMeet) => seMovioAlFuturoYaLeida(g, cambiosDeSesion(g, e, ["ana@acme.com", "eli@smarteamcr.com"], "cli_acme").cambios, AHORA);

describe("una reunión leída que reprograman al futuro", () => {
  it("vuelve a «no leída» cuando la sync le pone una fecha que todavía no llega", () => {
    expect(decide(guardada(), evento())).toBe(true);
  });

  it("también la que esperaba material con reintentos en curso: el último se gastaba en medio de la reunión nueva", () => {
    expect(decide(guardada({ enrichedAt: null, enrichAttempts: 3 }), evento())).toBe(true);
  });

  it("no, si no se había intentado, si la fecha nueva ya pasó o si la fecha no cambió", () => {
    expect(decide(guardada({ enrichedAt: null }), evento())).toBe(false);
    expect(decide(guardada(), evento({ date: new Date("2026-10-24T12:00:00Z") }))).toBe(false);
    expect(decide(guardada({ date: NUEVA }), evento({ title: "Otro título" }))).toBe(false);
  });

  it("solo si no tiene nada leído: ni texto, ni resumen, ni minuta, ni hechos, ni tareas, ni frases", () => {
    expect(Object.keys(SIN_NADA_LEIDO).sort()).toEqual(["frases", "hechos", "minute", "summary", "tareas", "transcript"]);
  });

  it("queda como la deja el rescate, y sin la conferencia de la fecha vieja", () => {
    expect(DATOS_DE_NO_LEIDA).toMatchObject({ enrichedAt: null, enrichAttempts: 0, enrichError: null, conferenciaCerradaEn: null, docDeTranscripcionId: null, motivoSinTexto: null });
  });

  it("la sync la llama después de escribir los cambios, con la fila guardada (que trae `enrichedAt`)", () => {
    const sync = fs.readFileSync(path.join(__dirname, "meet-sync.ts"), "utf8");
    expect(sync).toMatch(/devolverANoLeidaSiSeMovio\(prisma, existing, cambios, new Date\(\)\)/);
    const cambios = fs.readFileSync(path.join(__dirname, "meet-sync-cambios.ts"), "utf8");
    expect(cambios.match(/export const SELECT_SESION_GUARDADA = \{[^}]*\}/)?.[0]).toMatch(/enrichedAt: true,\s+enrichAttempts: true/);
  });
});
