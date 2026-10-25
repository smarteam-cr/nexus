/**
 * lib/google/eventos-de-meet.test.ts — U4: qué hacer con la suscripción de cada persona y qué dice un aviso de Pub/Sub.
 *
 * Correr: `npx vitest run lib/google/eventos-de-meet.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import { avisoDelMensaje, objetivoDe, queHacerConLaSuscripcion, RENOVAR_ANTES_MS } from "./eventos-de-meet";

const AHORA = new Date("2026-10-25T12:00:00Z");
const sus = (estado: string, venceEnMs: number | null) => ({
  nombre: "subscriptions/abc",
  objetivo: objetivoDe("123"),
  estado,
  vence: venceEnMs === null ? null : new Date(AHORA.getTime() + venceEnMs),
});

describe("queHacerConLaSuscripcion", () => {
  it("sin suscripción o borrada: crear; suspendida: reactivar; por vencer: renovar; al día: nada", () => {
    expect(queHacerConLaSuscripcion(null, AHORA)).toBe("crear");
    expect(queHacerConLaSuscripcion(sus("DELETED", 5 * 86_400_000), AHORA)).toBe("crear");
    expect(queHacerConLaSuscripcion(sus("SUSPENDED", 5 * 86_400_000), AHORA)).toBe("reactivar");
    expect(queHacerConLaSuscripcion(sus("ACTIVE", RENOVAR_ANTES_MS - 1), AHORA)).toBe("renovar");
    expect(queHacerConLaSuscripcion(sus("ACTIVE", null), AHORA)).toBe("renovar");
    expect(queHacerConLaSuscripcion(sus("ACTIVE", 5 * 86_400_000), AHORA)).toBe("nada");
  });

  it("el objetivo es la persona, en Cloud Identity", () => {
    expect(objetivoDe("101")).toBe("//cloudidentity.googleapis.com/users/101");
  });
});

describe("avisoDelMensaje", () => {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64");

  it("conferencia terminada: el tipo de los atributos y la conferencia de los datos", () => {
    const a = avisoDelMensaje({ "ce-type": "google.workspace.meet.conference.v2.ended" }, b64({ conferenceRecord: { name: "conferenceRecords/abc-123" } }));
    expect(a).toEqual({ tipo: "google.workspace.meet.conference.v2.ended", conferencia: "conferenceRecords/abc-123" });
  });

  it("transcripción lista: la conferencia sale del nombre de la transcripción", () => {
    const a = avisoDelMensaje(
      { "ce-type": "google.workspace.meet.transcript.v2.fileGenerated" },
      b64({ transcript: { name: "conferenceRecords/xyz_9/transcripts/t1" } }),
    );
    expect(a.conferencia).toBe("conferenceRecords/xyz_9");
  });

  it("un mensaje que no se entiende no rompe nada", () => {
    expect(avisoDelMensaje(undefined, "no es base64 ni json")).toEqual({ tipo: "desconocido", conferencia: null });
  });
});
