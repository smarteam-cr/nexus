/**
 * lib/hubspot/transcripcion-de-reunion.test.ts — la grabación de una reunión de HubSpot: el resumen de IA y
 * la transcripción, que la API v1 no trae (CreditForce, 28 sep: Nexus leía la invitación con 49 minutos
 * grabados en HubSpot). Correr: `npx vitest run lib/hubspot/transcripcion-de-reunion.test.ts --project unit`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { textoDeLaReunion, textoDeLaTranscripcion } from "./transcripcion-de-reunion";

const apiRequest = vi.fn();
vi.mock("./client", () => ({
  getSystemHubspotClient: async () => ({ apiRequest }),
  forceRefreshSystemToken: vi.fn(async () => {}),
}));

const respuesta = (status: number, json: unknown) => ({ status, text: async () => JSON.stringify(json) });

describe("el texto de la transcripción", () => {
  it("cada intervención con quién habló y el minuto, en orden, y lo seguido de la misma persona junto", () => {
    expect(
      textoDeLaTranscripcion([
        { text: "Hola, buenos días Andrés.", startTimeMillis: 49_000, speaker: { name: "Adriana Zamora" } },
        { text: "Gracias. Hola Adriana,", startTimeMillis: 0, speaker: { name: "Andrés Pinzón" } },
        { text: "¿cómo estás?", startTimeMillis: 3_000, speaker: { name: "Andrés Pinzón" } },
        { text: "  ", startTimeMillis: 60_000, speaker: { name: "Andrés Pinzón" } },
      ]),
    ).toBe("Andrés Pinzón (0:00): Gracias. Hola Adriana, ¿cómo estás?\nAdriana Zamora (0:49): Hola, buenos días Andrés.");
  });

  it("muy larga, se corta y lo dice", () => {
    const t = textoDeLaTranscripcion([{ text: "x".repeat(500), speaker: { name: "A" } }], 100);
    expect(t.endsWith("[…]")).toBe(true);
  });

  it("primero lo que se habló (el resumen y la transcripción), después la invitación, cada parte con su rótulo", () => {
    expect(textoDeLaReunion({ resumen: "<h5>Resumen</h5><p>Hablaron del modelo.</p>", transcripcion: "A: hola", resto: "Agenda: revisar el diagnóstico" })).toBe(
      "Resumen de la grabación (IA de HubSpot):\nResumen\nHablaron del modelo.\n\nTranscripción de la grabación:\nA: hola\n\nDescripción de la reunión:\nAgenda: revisar el diagnóstico",
    );
    expect(textoDeLaReunion({ resto: "Solo la invitación" }), "sin grabación queda lo de siempre").toBe("Solo la invitación");
  });
});

describe("⛔ la grabación se pide aparte, y sin permiso se sigue sin ella", () => {
  beforeEach(() => {
    apiRequest.mockReset();
    vi.resetModules();
  });

  it("el resumen y el número de la transcripción salen de la reunión (v3), con los nombres reales de HubSpot", async () => {
    apiRequest.mockResolvedValueOnce(
      respuesta(200, {
        results: [
          {
            id: "117334231324",
            properties: {
              hs_meeting_summary: "<p>Resumen</p>",
              hs_has_meeting_transcript: "true",
              hs_meeting_transcription_id: "3982287319",
              hubspot_owner_id: "76545012",
              hs_attendee_owner_ids: "76545012;81234567;",
            },
          },
        ],
      }),
    );
    const { grabacionesDeReuniones } = await import("./grabaciones-de-reuniones");
    const g = await grabacionesDeReuniones(["117334231324"], { transcripciones: 0 });
    // Quiénes de Smarteam estuvieron (su dueño y los asistentes que son usuarios): dice si estuvo Ventas.
    expect(g.get("117334231324")).toEqual({ resumen: "<p>Resumen</p>", transcripcion: null, tieneTranscripcion: true, propietarios: ["76545012", "81234567"] });
    const pedido = apiRequest.mock.calls[0][0] as { path: string; body: { properties: string[] } };
    expect(pedido.path).toBe("/crm/v3/objects/meetings/batch/read");
    expect(pedido.body.properties).toEqual(expect.arrayContaining(["hs_meeting_summary", "hs_meeting_transcription_id"]));
  });

  it("con permiso, la transcripción completa; sin él (403), se queda el resumen y no se vuelve a pedir", async () => {
    const reunion = (id: string, numero: string) => ({ id, properties: { hs_meeting_summary: `Resumen ${id}`, hs_meeting_transcription_id: numero } });
    apiRequest
      .mockResolvedValueOnce(respuesta(200, { results: [reunion("1", "10"), reunion("2", "20")] }))
      .mockResolvedValueOnce(respuesta(403, { message: "requiredGranularScopes: crm.extensions_calling_transcripts.read" }));
    const { grabacionesDeReuniones } = await import("./grabaciones-de-reuniones");
    const g = await grabacionesDeReuniones(["1", "2"], { transcripciones: 2 });
    expect(g.get("1")?.resumen).toBe("Resumen 1");
    expect(g.get("1")?.transcripcion).toBeNull();
    expect(apiRequest, "después del 403 no pide la segunda").toHaveBeenCalledTimes(2);
  });

  it("la transcripción, cuando hay permiso, entra como texto", async () => {
    apiRequest
      .mockResolvedValueOnce(respuesta(200, { results: [{ id: "1", properties: { hs_meeting_transcription_id: "10" } }] }))
      .mockResolvedValueOnce(respuesta(200, { transcriptUtterances: [{ text: "Hola", startTimeMillis: 0, speaker: { name: "Adriana" } }] }));
    const { grabacionesDeReuniones } = await import("./grabaciones-de-reuniones");
    const g = await grabacionesDeReuniones(["1"], { transcripciones: 1 });
    expect(g.get("1")?.transcripcion).toBe("Adriana (0:00): Hola");
  });

  it("sin permiso para leer las reuniones, vacío (y la lectura de siempre sigue)", async () => {
    apiRequest.mockResolvedValueOnce(respuesta(403, { message: "sin permiso" }));
    const { grabacionesDeReuniones } = await import("./grabaciones-de-reuniones");
    expect((await grabacionesDeReuniones(["1"], { transcripciones: 1 })).size).toBe(0);
  });
});
