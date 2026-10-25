/**
 * lib/sessions/audio-de-reunion.test.ts — la reunión presencial (T5): la bandera, qué se acepta subir y cómo se lee lo
 * que devuelve Speech-to-Text.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { MAX_BYTES_AUDIO, audioPrendido, extensionDe, motivoAudioApagado, objetoDelAudio, problemaDelAudio, textoDeLaTranscripcion } from "./audio-de-reunion";
import { leerOperacion } from "@/lib/google/speech-to-text";

describe("la bandera", () => {
  it("apagada por defecto: hace falta REUNIONES_AUDIO=1, el bucket y la clave", () => {
    expect(audioPrendido({})).toBe(false);
    expect(audioPrendido({ REUNIONES_AUDIO: "1", GOOGLE_SPEECH_BUCKET: "b" })).toBe(false);
    expect(audioPrendido({ REUNIONES_AUDIO: "1", GOOGLE_SPEECH_BUCKET: "b", GOOGLE_SERVICE_ACCOUNT_KEY: "{}" })).toBe(true);
    expect(motivoAudioApagado({})).toMatch(/REUNIONES_AUDIO=1 y GOOGLE_SPEECH_BUCKET y GOOGLE_SERVICE_ACCOUNT_KEY/);
    expect(motivoAudioApagado({ REUNIONES_AUDIO: "1", GOOGLE_SPEECH_BUCKET: "b", GOOGLE_SERVICE_ACCOUNT_KEY: "{}" })).toBeNull();
  });
});

describe("qué se acepta", () => {
  it("el audio de un teléfono sí; un documento o un archivo vacío o enorme, no", () => {
    expect(problemaDelAudio({ archivo: "Avis.m4a", bytes: 30_000_000 })).toBeNull();
    expect(problemaDelAudio({ archivo: "grabacion", bytes: 1000, tipo: "audio/mp4" })).toBeNull();
    expect(problemaDelAudio({ archivo: "minuta.pdf", bytes: 1000 })).toMatch(/no es de audio/);
    expect(problemaDelAudio({ archivo: "a.mp3", bytes: 0 })).toMatch(/vacío/);
    expect(problemaDelAudio({ archivo: "a.wav", bytes: MAX_BYTES_AUDIO + 1 })).toMatch(/demasiado grande/);
  });
  it("el objeto del bucket no lleva el nombre que puso la persona", () => {
    expect(objetoDelAudio("manual_abc", "Reunión con Pablo Bogantes.m4a", new Date(1_000))).toBe("reuniones/manual_abc/1000.m4a");
    expect(extensionDe("x.MP3")).toBe(".mp3");
  });
});

describe("lo que devuelve Speech-to-Text", () => {
  it("todavía no terminó", () => expect(leerOperacion({ done: false })).toEqual({ listo: false }));
  it("terminó con el texto y los minutos cobrados", () => {
    const r = leerOperacion({
      done: true,
      response: {
        results: {
          "gs://b/reuniones/x/1.m4a": {
            inlineResult: { transcript: { results: [{ alternatives: [{ transcript: " Buenos días, " }] }, { alternatives: [{ transcript: "empecemos con el cronograma." }] }] } },
            metadata: { totalBilledDuration: "3540s" },
          },
        },
      },
    });
    expect(r).toEqual({ listo: true, ok: true, pedazos: [" Buenos días, ", "empecemos con el cronograma."], minutos: 59 });
    if (r.listo && r.ok) expect(textoDeLaTranscripcion(r.pedazos)).toBe("Buenos días,\nempecemos con el cronograma.");
  });
  it("un error de la operación o del archivo", () => {
    expect(leerOperacion({ done: true, error: { message: "quota" } })).toEqual({ listo: true, ok: false, error: "quota" });
    expect(leerOperacion({ done: true, response: { results: { u: { error: { message: "formato" } } } } })).toEqual({ listo: true, ok: false, error: "formato" });
    expect(leerOperacion({ done: true, response: {} })).toMatchObject({ ok: false });
  });
});
