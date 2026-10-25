import { describe, expect, it } from "vitest";
import { MAX_TRANSCRIPT_CHARS, MIN_TRANSCRIPT_CHARS } from "@/lib/google/doc-parse";
import {
  MAX_TEXTO_A_MANO,
  MIN_TRANSCRIPCION,
  diaEnCostaRica,
  esArchivoDeSubtitulos,
  esPersonaSinCorreo,
  esReunionAMano,
  etiquetaDeLasNotas,
  inicioDeLaReunion,
  leerMarcaAMano,
  leerPersonasEscritas,
  limitesDelDia,
  normalizarSubtitulos,
  pareceTranscripcion,
  participantesDeLaReunion,
  porQueNoSeLePuedeAgregar,
  problemaDelContenido,
  recuerdoDeLaReunion,
  summaryDeLaTranscripcion,
  summaryDelRecuerdo,
  textoDelArchivo,
  type MarcaAMano,
} from "./reunion-a-mano";

const MARCA: MarcaAMano = { tipo: "recuerdo", por: "ana@smarteamcr.com", nombre: "Ana Gómez", at: "2026-10-15T15:00:00.000Z" };

describe("los topes son los de Meet", () => {
  it("el mínimo y el máximo de una transcripción", () => {
    expect(MIN_TRANSCRIPCION).toBe(MIN_TRANSCRIPT_CHARS);
    expect(MAX_TEXTO_A_MANO).toBe(MAX_TRANSCRIPT_CHARS);
  });
});

describe("la marca", () => {
  it("se lee del summary y sobrevive a la ida y vuelta", () => {
    expect(leerMarcaAMano(summaryDelRecuerdo("  Hablamos del pipeline.  ", MARCA))).toEqual(MARCA);
    expect(leerMarcaAMano(summaryDeLaTranscripcion({ ...MARCA, tipo: "transcripcion" }))?.tipo).toBe("transcripcion");
  });

  it("un Json de Gemini o raro no tiene marca", () => {
    expect(leerMarcaAMano({ overview: "Notas" })).toBeNull();
    expect(leerMarcaAMano({ aMano: { tipo: "otro", por: "x@y.com" } })).toBeNull();
    expect(leerMarcaAMano({ aMano: { tipo: "recuerdo" } })).toBeNull();
    expect(leerMarcaAMano(null)).toBeNull();
    expect(leerMarcaAMano([])).toBeNull();
  });

  it("el recuerdo es el texto solo si la marca dice recuerdo", () => {
    expect(recuerdoDeLaReunion(summaryDelRecuerdo("Quedamos en mandar la propuesta.", MARCA))).toBe("Quedamos en mandar la propuesta.");
    expect(recuerdoDeLaReunion({ overview: "Notas de Gemini" })).toBeNull();
    expect(recuerdoDeLaReunion({ overview: "x", aMano: { ...MARCA, tipo: "transcripcion" } })).toBeNull();
  });

  it("las notas se llaman por lo que son", () => {
    expect(etiquetaDeLasNotas({ overview: "x" })).toBe("Notas de Gemini");
    expect(etiquetaDeLasNotas(summaryDelRecuerdo("x", MARCA))).toBe("Lo que recuerda Ana (agregado a mano)");
  });

  it("el id dice si se creó a mano", () => {
    expect(esReunionAMano("manual_abc")).toBe(true);
    expect(esReunionAMano("gmeet_abc")).toBe(false);
  });
});

describe("quién estuvo", () => {
  it("una persona sin correo es alguien anotado por su nombre", () => {
    expect(esPersonaSinCorreo("Ana Pérez")).toBe(true);
    expect(esPersonaSinCorreo("ana@cliente.com")).toBe(false);
  });

  it("separa lo escrito por coma, punto y coma o renglón", () => {
    expect(leerPersonasEscritas("Ana Pérez, luis@cliente.com;\n  María  José  ,x")).toEqual(["Ana Pérez", "luis@cliente.com", "María José"]);
  });

  it("guarda los correos en minúsculas, sin repetir", () => {
    expect(participantesDeLaReunion(["Ana@Smarteamcr.com"], ["ana@smarteamcr.com", "Luis Mora", "luis mora", "PEDRO@cliente.com"])).toEqual([
      "ana@smarteamcr.com",
      "Luis Mora",
      "pedro@cliente.com",
    ]);
  });
});

describe("cuándo fue", () => {
  it("la hora es la de Costa Rica", () => {
    expect(inicioDeLaReunion("2026-10-14", "09:30")?.toISOString()).toBe("2026-10-14T15:30:00.000Z");
  });

  it("sin hora, el mediodía, y cae en su día", () => {
    const d = inicioDeLaReunion("2026-10-14", null)!;
    expect(diaEnCostaRica(d)).toBe("2026-10-14");
  });

  it("una fecha mal escrita no es una fecha", () => {
    expect(inicioDeLaReunion("14/10/2026", "09:00")).toBeNull();
    expect(limitesDelDia("ayer")).toBeNull();
  });

  it("el día va de medianoche a medianoche de Costa Rica", () => {
    const { desde, hasta } = limitesDelDia("2026-10-14")!;
    expect(desde.toISOString()).toBe("2026-10-14T06:00:00.000Z");
    expect(hasta.toISOString()).toBe("2026-10-15T06:00:00.000Z");
  });
});

describe("los subtítulos", () => {
  it("Zoom (.vtt con «Nombre: …»): un turno por persona, sin tiempos ni números", () => {
    const vtt = [
      "WEBVTT",
      "",
      "1",
      "00:00:01.000 --> 00:00:04.000",
      "Ana Gómez: Buenos días a todos.",
      "",
      "2",
      "00:00:04.500 --> 00:00:06.000",
      "Ana Gómez: Empecemos con el pipeline.",
      "",
      "3",
      "00:00:06.500 --> 00:00:09.000",
      "Luis Mora: Perfecto, tengo dudas.",
    ].join("\n");
    expect(normalizarSubtitulos(vtt)).toBe("Ana Gómez: Buenos días a todos. Empecemos con el pipeline.\nLuis Mora: Perfecto, tengo dudas.");
  });

  it("Teams (.vtt con <v Nombre>)", () => {
    const vtt = [
      "WEBVTT",
      "",
      "3f2a9c1e-77b0-4d1a/12-0",
      "00:00:01.000 --> 00:00:03.000",
      "<v Ana Gómez>Hola.</v>",
      "",
      "3f2a9c1e-77b0-4d1a/13-0",
      "00:00:03.000 --> 00:00:05.000",
      "<v Luis Mora>¿Qué tal?</v>",
    ].join("\n");
    expect(normalizarSubtitulos(vtt)).toBe("Ana Gómez: Hola.\nLuis Mora: ¿Qué tal?");
  });

  it(".srt con comas en los tiempos", () => {
    const srt = ["1", "00:00:01,000 --> 00:00:02,000", "Ana: Hola", "", "2", "00:00:02,000 --> 00:00:03,000", "Ana: ¿me oyen?"].join("\r\n");
    expect(normalizarSubtitulos(srt)).toBe("Ana: Hola ¿me oyen?");
  });

  it("reconoce un archivo de subtítulos", () => {
    expect(esArchivoDeSubtitulos("reunion.vtt", "")).toBe(true);
    expect(esArchivoDeSubtitulos("x.txt", "WEBVTT\n\n")).toBe(true);
    expect(esArchivoDeSubtitulos("x.txt", "1\n00:00:01,000 --> 00:00:02,000\nhola")).toBe(true);
    expect(esArchivoDeSubtitulos("notas.txt", "Hablamos del pipeline")).toBe(false);
  });

  it("el texto de un archivo: los subtítulos pasan a turnos y sugieren transcripción", () => {
    const vtt = "WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\nAna: Hola\n";
    expect(textoDelArchivo("reunion.vtt", vtt)).toEqual({ texto: "Ana: Hola", tipoSugerido: "transcripcion", recortado: false });
    expect(textoDelArchivo("notas.txt", "Hablamos del pipeline y quedamos en mandar la propuesta.")).toMatchObject({ tipoSugerido: "recuerdo" });
    expect(textoDelArchivo("largo.txt", "x".repeat(MAX_TEXTO_A_MANO + 10)).recortado).toBe(true);
  });

  it("sugiere transcripción solo con turnos", () => {
    expect(pareceTranscripcion("Ana: hola\nLuis: hola\nAna: empecemos\nLuis: dale")).toBe(true);
    expect(pareceTranscripcion("Hablamos del pipeline.\nQuedamos en mandar la propuesta.\nOtra cosa\nY otra")).toBe(false);
  });
});

describe("qué se puede guardar", () => {
  it("una transcripción corta pide pasarla a recuerdo", () => {
    expect(problemaDelContenido("transcripcion", "Ana: hola")).toMatch(/Lo que recuerdas/);
    expect(problemaDelContenido("transcripcion", "x".repeat(MIN_TRANSCRIPCION))).toBeNull();
  });

  it("un recuerdo de dos líneas alcanza", () => {
    expect(problemaDelContenido("recuerdo", "ok")).not.toBeNull();
    expect(problemaDelContenido("recuerdo", "Quedamos en mandar la propuesta el lunes con los precios.")).toBeNull();
  });

  it("nada pasa del tope", () => {
    expect(problemaDelContenido("recuerdo", "x".repeat(MAX_TEXTO_A_MANO + 1))).toMatch(/tope/);
  });

  it("a una reunión con transcripción o notas no se le agrega nada", () => {
    expect(porQueNoSeLePuedeAgregar({ largoTranscript: 5_000, largoNotas: 0 })).toMatch(/transcripción/);
    expect(porQueNoSeLePuedeAgregar({ largoTranscript: 0, largoNotas: 800 })).toMatch(/notas/);
    expect(porQueNoSeLePuedeAgregar({ largoTranscript: 0, largoNotas: 0 })).toBeNull();
  });
});

describe("de dónde salió lo agregado (T5 y T9, 2026-10-25)", () => {
  it("la marca guarda el origen, y uno que no conoce se ignora", () => {
    expect(leerMarcaAMano({ aMano: { ...MARCA, origen: "preguntas" } })?.origen).toBe("preguntas");
    expect(leerMarcaAMano({ aMano: { ...MARCA, origen: "audio" } })?.origen).toBe("audio");
    expect(leerMarcaAMano({ aMano: { ...MARCA, origen: "otro" } })).not.toHaveProperty("origen");
  });
  it("lo que contó respondiendo las preguntas de Nexus se dice «lo contó una persona»", () => {
    expect(etiquetaDeLasNotas(summaryDelRecuerdo("x", { ...MARCA, origen: "preguntas" }))).toBe("Lo que contó Ana respondiendo las preguntas de Nexus (lo contó una persona)");
    expect(etiquetaDeLasNotas(summaryDelRecuerdo("x", MARCA))).toBe("Lo que recuerda Ana (agregado a mano)");
  });
});
